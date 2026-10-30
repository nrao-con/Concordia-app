import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const fake = vi.hoisted(() => ({
  order: {} as any,
  row: null as any,
  failQueue: false,
  visibleLease: true,
  writes: [] as Array<{ table: string; values: any }>,
  lockTail: Promise.resolve(),
  lockCalls: 0,
}));
vi.mock("../server/db", () => ({
  pool: {},
  db: {
    transaction: async (task: any) => {
      let release: (() => void) | undefined;
      const writes: Array<{ table: string; values: any }> = [];
      const name = (table: any) => table[Symbol.for("drizzle:Name")];
      const tx = {
        execute: async () => {
          fake.lockCalls++;
          const prior = fake.lockTail;
          fake.lockTail = new Promise<void>((resolve) => { release = resolve; });
          await prior;
        },
        select: () => ({ from: (table: any) => ({ where: () => ({
          for: async () => name(table) === "orders" ? (fake.order ? [{ ...fake.order }] : [])
            : fake.row && fake.visibleLease ? [{ ...fake.row }] : [],
        }) }) }),
        insert: (table: any) => ({ values: (values: any) => ({
          then: (resolve: any, reject: any) => {
            if (name(table) === "partner_outbox" && fake.failQueue) { reject(new Error("queue unavailable")); return; }
            writes.push({ table: name(table), values }); resolve();
          },
        }) }),
        update: (table: any) => ({ set: (values: any) => ({ where: () => {
          const stage = () => {
            if (name(table) === "orders" && values.pharmFlowCancellationStatus === "confirmed" &&
                fake.order.pharmFlowCancellationStatus === "confirmed") return [];
            writes.push({ table: name(table), values });
            return [{ ...(name(table) === "orders" ? fake.order : fake.row), ...values }];
          };
          return { returning: async () => stage(), then: (resolve: any) => { stage(); resolve(); } };
        } }) }),
      };
      try {
        const result = await task(tx);
        for (const w of writes) {
          if (w.table === "orders") Object.assign(fake.order, w.values);
          if (w.table === "partner_outbox" && w.values.status && fake.row) Object.assign(fake.row, w.values);
        }
        fake.writes.push(...writes);
        return result;
      } finally { release?.(); }
    },
  },
}));
import { storage } from "../server/storage";
import { processPartnerOutbox } from "../server/partner-outbox";

beforeEach(() => {
  fake.order = { id: 42, userId: "patient-test", orderType: "rx_refill", status: "preparing",
    statusHistory: [], pharmFlowSubmitted: false, pharmFlowCancellationStatus: null };
  fake.row = null; fake.writes = []; fake.failQueue = false;
  fake.visibleLease = true; fake.lockTail = Promise.resolve(); fake.lockCalls = 0;
});
function queue(operation = "pharmflow_cancel_order") {
  return { id: 2, operation, partner: "pharmflow", attempts: 0, status: "processing", leaseToken: "lease-test",
    idempotencyKey: `order:42:pharmflow${operation === "pharmflow_cancel_order" ? ":cancel" : ""}`,
    payload: { concordiaCareOrderId: 42, patientId: "patient-test", ...(operation === "pharmflow_cancel_order" ? { status: "cancelled" } : {}) } };
}
describe("atomic cancellation and order delivery serialization", () => {
  it("saves local cancellation, pending state, one delivery intent and one notification atomically", async () => {
    const result = await storage.cancelOrderWithDelivery(42, "patient-test");
    expect(result.changed).toBe(true);
    expect(fake.order).toMatchObject({ status: "cancelled", pharmFlowCancellationStatus: "pending" });
    expect(fake.writes.map(w => w.table)).toEqual(["orders", "partner_outbox", "notifications"]);
    expect(fake.writes[1].values).toMatchObject({
      operation: "pharmflow_cancel_order", idempotencyKey: "order:42:pharmflow:cancel",
      payload: { concordiaCareOrderId: 42, patientId: "patient-test", status: "cancelled" },
    });
    expect(fake.order.pharmFlowCancellationConfirmedAt).toBeNull();
  });
  it("rolls back the local cancellation if durable delivery cannot be saved", async () => {
    fake.failQueue = true;
    await expect(storage.cancelOrderWithDelivery(42, "patient-test")).rejects.toThrow("queue unavailable");
    expect(fake.order.status).toBe("preparing");
    expect(fake.writes).toEqual([]);
  });
  it("does not duplicate the intent or notification on repeated cancellation", async () => {
    await storage.cancelOrderWithDelivery(42, "patient-test");
    expect((await storage.cancelOrderWithDelivery(42, "patient-test")).changed).toBe(false);
    expect(fake.writes.filter(w => w.table === "partner_outbox")).toHaveLength(1);
    expect(fake.writes.filter(w => w.table === "notifications")).toHaveLength(1);
  });
  it.each(["ready", "verified", "picked_up", "delivered"])("rechecks cancellation eligibility inside the lock (%s)", async (status) => {
    fake.order.status = status;
    await expect(storage.cancelOrderWithDelivery(42, "patient-test")).rejects.toMatchObject({ statusCode: 400 });
    expect(fake.writes).toEqual([]);
  });
  it("keeps another patient's order untouched", async () => {
    await expect(storage.cancelOrderWithDelivery(42, "another-patient")).rejects.toMatchObject({ statusCode: 403 });
    expect(fake.writes).toEqual([]);
  });
  it("does not route an OTC cancellation to PharmFlow", async () => {
    fake.order.orderType = "otc";
    await storage.cancelOrderWithDelivery(42, "patient-test");
    expect(fake.writes.some(w => w.table === "partner_outbox")).toBe(false);
    expect(fake.order.pharmFlowCancellationStatus).toBeNull();
  });
  it("persists remote confirmation, timestamp and one notification with delivery completion", async () => {
    fake.row = queue(); fake.order.status = "cancelled"; fake.order.pharmFlowCancellationStatus = "pending";
    expect(await storage.completePartnerOutboxWithEffects(2, "lease-test", {})).toBe(true);
    expect(fake.order.pharmFlowCancellationStatus).toBe("confirmed");
    expect(fake.order.pharmFlowCancellationConfirmedAt).toBeInstanceOf(Date);
    expect(fake.writes.map(w => w.table)).toEqual(["orders", "notifications", "partner_outbox"]);
    await storage.completePartnerOutboxWithEffects(2, "lease-test", {});
    expect(fake.writes.filter(w => w.table === "notifications")).toHaveLength(1);
  });
  it("preserves a visible failure marker when automatic retries are exhausted", async () => {
    fake.row = { ...queue(), attempts: 7 };
    fake.order.status = "cancelled"; fake.order.pharmFlowCancellationStatus = "pending";
    await storage.retryPartnerOutbox(2, "lease-test", "HTTP error");
    expect(fake.row.status).toBe("failed");
    expect(fake.order.pharmFlowCancellationStatus).toBe("failed");
  });
  it("does not apply effects for a stale delivery lease", async () => {
    fake.row = queue(); fake.visibleLease = false;
    expect(await storage.completePartnerOutboxWithEffects(2, "old-lease", {})).toBe(false);
    expect(fake.writes).toEqual([]);
  });
  it("waits for an in-flight submission to commit before saving and queuing cancellation", async () => {
    fake.row = queue("pharmflow_rx_order");
    let releaseSend!: () => void;
    let enteredSend!: () => void;
    const sending = new Promise<void>(resolve => { enteredSend = resolve; });
    const gate = new Promise<void>(resolve => { releaseSend = resolve; });
    const workerStore = {
      claimDuePartnerOutbox: async () => [{ ...fake.row }],
      withOrderDeliveryLock: storage.withOrderDeliveryLock.bind(storage),
      failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(),
    };
    const worker = processPartnerOutbox(workerStore as any, async () => { enteredSend(); await gate; return {}; });
    await sending;
    const cancellation = storage.cancelOrderWithDelivery(42, "patient-test");
    await Promise.resolve(); await Promise.resolve();
    expect(fake.order.status).toBe("preparing");
    releaseSend();
    await worker; await cancellation;
    expect(fake.order).toMatchObject({ status: "cancelled", pharmFlowSubmitted: true, pharmFlowCancellationStatus: "pending" });
    expect(fake.lockCalls).toBe(2);
    expect(workerStore.retryPartnerOutbox).not.toHaveBeenCalled();
  });
  it("does not send the original refill when cancellation wins the lock first", async () => {
    await storage.cancelOrderWithDelivery(42, "patient-test");
    fake.row = queue("pharmflow_rx_order");
    const dispatch = vi.fn();
    const workerStore = {
      claimDuePartnerOutbox: async () => [{ ...fake.row }],
      withOrderDeliveryLock: storage.withOrderDeliveryLock.bind(storage),
      failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(),
    };
    await processPartnerOutbox(workerStore as any, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(workerStore.failPartnerOutbox).toHaveBeenCalledWith(2, "lease-test", "Refill is no longer active");
  });
  it("preserves unresolved cancellations when history is cleared, and does not depend on queue retention for the warning", () => {
    const source = readFileSync("server/storage.ts", "utf8");
    const deletion = source.slice(source.indexOf("async deleteCompletedOrders"), source.indexOf("async getOrderItems"));
    expect(deletion).toContain('eq(orders.pharmFlowCancellationStatus, "confirmed")');
    expect(deletion).toContain("isNull(orders.pharmFlowCancellationStatus)");
  });
});
