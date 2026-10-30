import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  order: {} as any, items: [] as any[], products: [] as any[],
  writes: [] as Array<{ table: string; values: any }>,
  failQueue: false, locks: 0, outbox: null as any,
}));
vi.mock("../server/db", () => ({
  pool: {},
  db: {
    transaction: async (task: any) => {
      const writes: Array<{ table: string; values: any }> = [];
      const name = (table: any) => table[Symbol.for("drizzle:Name")];
      const tx = {
        execute: async () => { fake.locks++; },
        select: () => ({ from: (table: any) => ({ where: () => {
          const rows = name(table) === "orders" ? [structuredClone(fake.order)]
            : name(table) === "partner_outbox" ? (fake.outbox ? [fake.outbox] : [])
            : name(table) === "otc_products" ? fake.products : [];
          return { for: async () => rows, then: (resolve: any) => resolve(rows) };
        } }) }),
        insert: (table: any) => ({ values: (values: any) => {
          if (name(table) === "partner_outbox" && fake.failQueue) throw new Error("queue unavailable");
          const action = () => writes.push({ table: name(table), values });
          return {
            onConflictDoNothing: async () => action(),
            returning: async () => {
              action();
              return name(table) === "orders" ? [{ ...fake.order, ...values }]
                : values.map((value: any, index: number) => ({ ...value, id: 500 + index }));
            },
            then: (resolve: any) => { action(); resolve(); },
          };
        } }),
        update: (table: any) => ({ set: (values: any) => ({ where: () => ({
          then: (resolve: any) => {
            writes.push({ table: name(table), values });
            resolve();
          },
          returning: async () => {
            writes.push({ table: name(table), values });
            return [{ ...fake.order, ...values }];
          },
        }) }) }),
      };
      const result = await task(tx);
      fake.writes.push(...writes);
      for (const write of writes) if (write.table === "orders") Object.assign(fake.order, write.values);
      return result;
    },
  },
}));
import { storage } from "../server/storage";

beforeEach(() => {
  const date = new Date("2026-01-01T10:00:00Z");
  fake.order = { id: 42, userId: "fixture-patient", orderType: "otc", orderNumber: "FIXTURE-42",
    status: "pending", contactPhone: "+12125550123", staffPanelOrderNumber: null, createdAt: date, updatedAt: date,
    deliveryMethod: "pickup", scheduledPickupTime: "Tomorrow morning",
    statusHistory: [{ status: "pending", timestamp: date.toISOString() }] };
  fake.items = [{ productName: "Fixture", productType: "otc", otcProductId: 901, quantity: 2, unitPrice: "4.25" }];
  fake.products = [{ id: 901, externalId: "sp:7", syncSource: "staff_panel" }];
  fake.writes = []; fake.failQueue = false; fake.locks = 0; fake.outbox = null;
});
describe("atomic Staff intent and stock-free status callbacks", () => {
  it("commits app OTC order, items and canonical delivery intent in one transaction", async () => {
    await storage.createOrderWithItems(fake.order, fake.items, undefined, true);
    expect(fake.writes.map(w => w.table)).toEqual(["orders", "order_items", "partner_outbox"]);
    expect(fake.writes[2].values).toMatchObject({
      operation: "staff_checkout", partner: "staff", idempotencyKey: "order:42:staff",
      payload: { kind: "care_catalog_checkout_v1", id: "42",
        request: { source: "concordia_care", customerPhone: "+12125550123",
          externalOrderId: "care-checkout:FIXTURE-42", fulfillmentType: "pickup",
          paymentStatus: "collect_at_counter", items: [{ productId: 7, quantity: 2, unitPrice: 4.25 }] } },
    });
    expect(fake.products[0]).not.toHaveProperty("stockCount"); // no local reservation ledger
    expect(fake.order.staffCheckoutStatus).toBe("pending");
  });
  it("rolls back the order when durable intent persistence fails", async () => {
    fake.failQueue = true;
    await expect(storage.createOrderWithItems(fake.order, fake.items, undefined, true)).rejects.toThrow("queue unavailable");
    expect(fake.writes).toEqual([]);
  });
  it("does not loop website/imported OTC orders back into Staff", async () => {
    await storage.createOrderWithItems(fake.order, fake.items);
    expect(fake.writes.map(w => w.table)).toEqual(["orders", "order_items"]);
  });
  it("applies the exact Staff status, persists its reference and appends history once", async () => {
    await storage.applyStaffOrderStatus(42, "ready", "STAFF-FIXTURE-42");
    const once = structuredClone(fake.order);
    await storage.applyStaffOrderStatus(42, "ready", "STAFF-FIXTURE-42");
    expect(fake.order).toEqual(once);
    expect(fake.order.statusHistory).toHaveLength(2);
    expect(fake.order.staffPanelOrderNumber).toBe("STAFF-FIXTURE-42");
    expect(fake.locks).toBe(2);
    expect(fake.writes.map(w => w.table)).toEqual(["orders"]);
  });
  it.each(["picked_up", "delivered", "cancelled"])("does not reopen %s or alter stock on a stale callback", async (status) => {
    fake.order.status = status;
    fake.order.staffPanelOrderNumber = "STAFF-FIXTURE-42";
    await storage.applyStaffOrderStatus(42, "preparing", "STAFF-FIXTURE-42");
    expect(fake.order.status).toBe(status);
    expect(fake.writes).toEqual([]);
  });
  it("rejects a mismatched Staff reference without changing the order", async () => {
    fake.order.staffPanelOrderNumber = "OTHER";
    await expect(storage.applyStaffOrderStatus(42, "ready", "STAFF-FIXTURE-42"))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(fake.writes).toEqual([]);
  });
  it("does not apply Staff OTC status updates to prescription orders", async () => {
    fake.order.orderType = "rx_refill";
    await expect(storage.applyStaffOrderStatus(42, "ready", "STAFF-FIXTURE-42"))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(fake.writes).toEqual([]);
  });
  it("stores checkout evidence and tokens separately from public order data", async () => {
    fake.order.staffCheckoutStatus = "pending";
    fake.outbox = { id: 9, operation: "staff_checkout", payload: { id: "42" } };
    expect(await storage.completePartnerOutboxWithEffects(9, "fixture-lease", {
      checkoutStatus: "confirmed", externalReference: "STAFF-42",
      checkoutReceipt: { staffOrderId: "123", trackingToken: "fixture-private-token", trackingExpiresAt: "fixture-expiry" },
    })).toBe(true);
    expect(fake.order.staffCheckoutStatus).toBe("confirmed");
    expect(fake.order.staffPanelOrderNumber).toBe("STAFF-42");
    expect(fake.order).not.toHaveProperty("trackingToken");
    expect(fake.writes.find(w => w.table === "staff_checkout_receipts")?.values)
      .toMatchObject({ orderId: 42, trackingToken: "fixture-private-token" });
    expect(fake.writes.find(w => w.table === "partner_outbox")?.values)
      .toMatchObject({ status: "completed", payload: {} });
  });
  it("persists definitive rejection without a stock mutation", async () => {
    fake.order.staffCheckoutStatus = "pending";
    fake.outbox = { id: 9, operation: "staff_checkout", payload: { id: "42" } };
    await storage.completePartnerOutboxWithEffects(9, "fixture-lease", {
      checkoutStatus: "rejected", checkoutError: "PRICE_CHANGED",
    });
    expect(fake.order).toMatchObject({ status: "rejected", staffCheckoutStatus: "rejected", staffCheckoutError: "PRICE_CHANGED" });
    expect(fake.writes.every(w => w.table !== "otc_products")).toBe(true);
  });
  it("does not fake a local cancellation of a Staff-reserved checkout", async () => {
    fake.order.staffCheckoutStatus = "confirmed";
    await expect(storage.cancelOrderWithDelivery(42, "fixture-patient")).rejects.toMatchObject({ statusCode: 409 });
    expect(fake.writes).toEqual([]);
  });
  it("does not promote a status callback into reservation proof", async () => {
    fake.order.staffCheckoutStatus = "pending";
    await storage.applyStaffOrderStatus(42, "ready", "STAFF-42");
    expect(fake.order.staffCheckoutStatus).toBe("pending");
    expect(fake.writes.every(w => w.table === "orders")).toBe(true);
  });
});
