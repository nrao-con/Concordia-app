import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; values: any }>,
  failQueue: false,
  claimed: null as any,
  order: { id: 42, userId: "test-patient", pharmFlowSubmitted: false } as any,
}));
vi.mock("../server/db", () => ({
  pool: {},
  db: {
    transaction: async (callback: any) => {
      const pending: Array<{ table: string; values: any }> = [];
      const name = (table: any) => table[Symbol.for("drizzle:Name")];
      const tx = {
        insert: (table: any) => ({
          values: (values: any) => {
            const tableName = name(table);
            const commit = () => {
              if (tableName === "partner_outbox" && fake.failQueue) throw new Error("queue write failed");
              pending.push({ table: tableName, values });
            };
            return {
              returning: async () => { commit(); return tableName === "orders" ? [{ ...fake.order, ...values }]
                : (Array.isArray(values) ? values : [values]); },
              then: (resolve: any, reject: any) => { try { commit(); resolve(); } catch (e) { reject(e); } },
            };
          },
        }),
        select: () => ({ from: () => ({ where: () => ({
          for: async () => fake.claimed ? [fake.claimed] : [],
        }) }) }),
        update: (table: any) => ({
          set: (values: any) => ({
            where: () => ({
              returning: async () => {
                if (fake.order.pharmFlowSubmitted) return [];
                pending.push({ table: name(table), values });
                return [{ ...fake.order, ...values }];
              },
              then: (resolve: any) => { pending.push({ table: name(table), values }); resolve(); },
            }),
          }),
        }),
      };
      const result = await callback(tx);
      fake.writes.push(...pending);
      for (const write of pending) if (write.table === "orders") Object.assign(fake.order, write.values);
      return result;
    },
  },
}));
import { storage } from "../server/storage";

beforeEach(() => {
  fake.writes = []; fake.failQueue = false; fake.claimed = null;
  fake.order = { id: 42, userId: "test-patient", pharmFlowSubmitted: false };
});
const order = { userId: "test-patient", orderType: "rx_refill", status: "preparing" } as any;
const items = [{ productName: "Verified item", productType: "rx", quantity: 1 }];
const payload = { patientId: "test-patient", medications: [{ name: "Verified item", quantity: 1 }] };

describe("refill creation and confirmation transactions", () => {
  it("commits order, items, and durable delivery together with the database order ID", async () => {
    await storage.createOrderWithItems(order, items, payload);
    expect(fake.writes.map((x) => x.table)).toEqual(["orders", "order_items", "partner_outbox"]);
    expect(fake.writes[2].values).toMatchObject({
      operation: "pharmflow_rx_order", partner: "pharmflow", idempotencyKey: "order:42:pharmflow",
      payload: { ...payload, concordiaCareOrderId: 42 },
    });
  });
  it("rolls the entire order back if durable delivery cannot be saved", async () => {
    fake.failQueue = true;
    await expect(storage.createOrderWithItems(order, items, payload)).rejects.toThrow("queue write failed");
    expect(fake.writes).toEqual([]);
  });
  it("does not create PharmFlow delivery work for OTC orders", async () => {
    await storage.createOrderWithItems({ ...order, orderType: "otc" }, items);
    expect(fake.writes.map((x) => x.table)).toEqual(["orders", "order_items"]);
  });
  it("commits the confirmation timestamp and one notification with queue completion", async () => {
    fake.claimed = { id: 1, operation: "pharmflow_rx_order", payload: { concordiaCareOrderId: 42 } };
    expect(await storage.completePartnerOutboxWithEffects(1, "lease", {})).toBe(true);
    expect(fake.writes.map((x) => x.table)).toEqual(["orders", "notifications", "partner_outbox"]);
    expect(fake.order.pharmFlowSubmitted).toBe(true);
    expect(fake.order.pharmFlowSubmittedAt).toBeInstanceOf(Date);
    expect(fake.writes[2].values).toMatchObject({ status: "completed", payload: {}, leaseToken: null });
    await storage.completePartnerOutboxWithEffects(1, "lease", {});
    expect(fake.writes.filter((x) => x.table === "notifications")).toHaveLength(1);
  });
  it("does not change confirmation or notify when the lease no longer owns the row", async () => {
    expect(await storage.completePartnerOutboxWithEffects(1, "stale-lease", {})).toBe(false);
    expect(fake.writes).toEqual([]);
  });
});
