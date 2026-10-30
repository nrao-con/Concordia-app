import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStaffOrderPayload } from "../server/staff-orders";
import { dispatchPartnerOperation, processPartnerOutbox } from "../server/partner-outbox";
import { createStaffOrderStatusHandler } from "../server/staff-order-status";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StaffSubmissionStatus } from "../client/src/components/staff-submission-status";
import { readFileSync } from "node:fs";

const order = { id: 42, orderNumber: "FIXTURE-42", userId: "fixture-patient", orderType: "otc",
  status: "pending", deliveryMethod: "pickup", createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:01:00Z"), staffPanelOrderNumber: null } as any;
const item = { id: 555, orderId: 42, otcProductId: 901, productName: "Fixture item",
  quantity: 2, unitPrice: "4.25" } as any;
const product = { id: 901, externalId: "sp:7", staffPanelProductId: 7, syncSource: "staff_panel" } as any;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Staff order contract and durable delivery", () => {
  it("sends the order callback number without changing patient identity, and includes delivery details", () => {
    const payload = buildStaffOrderPayload({ ...order, contactPhone: "+12125550123",
      deliveryMethod: "delivery", deliveryAddress: "Fixture delivery address" }, [item], [product],
      { phone: "+16465550123" } as any);
    expect(payload).toMatchObject({ guestPhone: "+12125550123", deliveryMethod: "delivery",
      deliveryAddress: "Fixture delivery address" });
    expect(payload).not.toHaveProperty("paymentStatus");
  });
  it("includes the requested pickup time for Staff", () => {
    expect(buildStaffOrderPayload({ ...order, scheduledPickupTime: "Tomorrow 10 AM" }, [item], [product]))
      .toMatchObject({ deliveryMethod: "pickup", scheduledPickupTime: "Tomorrow 10 AM" });
  });
  it("includes canonical ID separately from local product and order-line IDs", () => {
    const payload = buildStaffOrderPayload(order, [item], [product]);
    expect(payload).toMatchObject({
      source: "concordia_care", id: "42", orderNumber: "FIXTURE-42", status: "pending",
      createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:01:00.000Z",
      orderItems: [{ id: "555", concordiaProductId: 7, name: "Fixture item", quantity: 2, price: "4.25" }],
    });
    expect(payload).not.toHaveProperty("paymentStatus");
  });
  it.each([0, -1, 101, 1.5])("rejects unsafe quantity %s", (quantity) => {
    expect(() => buildStaffOrderPayload(order, [{ ...item, quantity }], [product])).toThrow();
  });
  it("requires canonical inventory mapping, server price, timestamps and 1–100 items", () => {
    expect(() => buildStaffOrderPayload(order, [item], [])).toThrow();
    expect(() => buildStaffOrderPayload(order, [item], [{ ...product, externalId: null }])).toThrow();
    expect(() => buildStaffOrderPayload(order, [{ ...item, unitPrice: null }], [product])).toThrow();
    expect(() => buildStaffOrderPayload({ ...order, createdAt: null }, [item], [product])).toThrow();
    expect(() => buildStaffOrderPayload(order, [], [product])).toThrow();
    expect(() => buildStaffOrderPayload(order, Array(101).fill(item), [product])).toThrow();
  });
  it("uses the canonical Staff host and backend credential; duplicate delivery reserves once in an isolated central fixture", async () => {
    vi.stubEnv("CONCORDIA_STAFF_WEBHOOK_KEY", "fixture-only");
    vi.stubEnv("STAFF_APP_URL", "https://wrong-host.example.test");
    const payload = buildStaffOrderPayload(order, [item], [product]);
    const reserved = new Set<string>();
    let stock = 10;
    let lost = true;
    const transport = vi.fn(async (url: any, request: any) => {
      expect(url).toBe("https://concordia-staff.replit.app/api/public/webhooks/new-order");
      expect(request.headers).toMatchObject({ "X-API-KEY": "fixture-only", "Idempotency-Key": "order:42:staff" });
      const received = JSON.parse(request.body);
      if (!reserved.has(received.id)) { reserved.add(received.id); stock -= received.orderItems[0].quantity; }
      if (lost) { lost = false; throw new Error("response lost after central acceptance"); }
      return new Response('{"orderNumber":"STAFF-FIXTURE-42"}');
    });
    vi.stubGlobal("fetch", transport);
    await expect(dispatchPartnerOperation("staff_order", payload, "order:42:staff")).rejects.toThrow("response lost");
    expect(await dispatchPartnerOperation("staff_order", payload, "order:42:staff"))
      .toEqual({ externalReference: "STAFF-FIXTURE-42" });
    expect(stock).toBe(8);
    expect(reserved.size).toBe(1);
  });
  it("retains an unconfirmed job for retry when transport fails", async () => {
    const payload = buildStaffOrderPayload(order, [item], [product]);
    const row = { id: 1, operation: "staff_order", idempotencyKey: "order:42:staff",
      leaseToken: "fixture-lease", payload } as any;
    const store: any = {
      claimDuePartnerOutbox: vi.fn(async () => [row]), ownsPartnerOutboxLease: vi.fn(async () => true),
      getOrder: vi.fn(async () => order), completePartnerOutboxWithEffects: vi.fn(),
      failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(),
    };
    store.withOrderDeliveryLock = vi.fn(async (_id, task) => task(store));
    const send = vi.fn(async () => { throw new Error("offline"); });
    await processPartnerOutbox(store, send, 1, undefined, "order:42:staff");
    expect(store.claimDuePartnerOutbox).toHaveBeenCalledWith(1, "order:42:staff");
    expect(store.retryPartnerOutbox).toHaveBeenCalledWith(1, "fixture-lease", "offline");
    expect(store.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "picked_up", "delivered"])("does not create new pharmacy work for a %s order", async (status) => {
    const store: any = {
      claimDuePartnerOutbox: vi.fn(async () => [{ id: 1, operation: "staff_order", leaseToken: "fixture",
        payload: buildStaffOrderPayload(order, [item], [product]), idempotencyKey: "order:42:staff" }]),
      ownsPartnerOutboxLease: vi.fn(async () => true), getOrder: vi.fn(async () => ({ ...order, status })),
      failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(), completePartnerOutboxWithEffects: vi.fn(),
    };
    store.withOrderDeliveryLock = vi.fn(async (_id, task) => task(store));
    const send = vi.fn();
    await processPartnerOutbox(store, send);
    expect(send).not.toHaveBeenCalled();
    expect(store.failPartnerOutbox).toHaveBeenCalled();
  });
  it("a discarded/absent queue is never displayed as proof of delivery", () => {
    const html = renderToStaticMarkup(createElement(StaffSubmissionStatus, { order }));
    expect(html).toContain("unconfirmed");
    const confirmed = renderToStaticMarkup(createElement(StaffSubmissionStatus,
      { order: { ...order, staffPanelOrderNumber: "STAFF-FIXTURE-42" } }));
    expect(confirmed).toContain("not payment or stock reservation");
  });
  it("retains protected polling routes and does not expose shared credentials to the browser", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain('app.patch("/api/external/orders/:externalOrderId/app-status", staffApi,');
    expect(routes).toContain('app.get("/api/external/orders", concordiaApi,');
    expect(routes).toContain('app.get("/api/staff/orders/lookup", staffApi,');
    expect(routes).not.toContain('paymentStatus: "paid"');
    const client = readFileSync("client/src/lib/inventory-sync.ts", "utf8") +
      readFileSync("client/src/hooks/use-staff-panel-sse.ts", "utf8");
    expect(client).not.toContain("CONCORDIA_STAFF_WEBHOOK_KEY");
    expect(client).not.toContain("X-API-KEY");
  });
});

describe("Staff status callback boundary", () => {
  function fixture() {
    const store = { applyStaffOrderStatus: vi.fn(async (_id, status, number) =>
      ({ ...order, status, staffPanelOrderNumber: number })) };
    const notify = vi.fn();
    const handler = createStaffOrderStatusHandler(store as any, notify);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const run = (params: any = { externalOrderId: "42" }, body: any =
      { appStatus: "ready", concordiaOrderNumber: "STAFF-FIXTURE-42" }) =>
      handler({ params, body } as any, res as any, vi.fn());
    return { store, notify, res, run };
  }
  it("updates and notifies only the owner of the exact immutable external ID", async () => {
    const f = fixture(); await f.run();
    expect(f.store.applyStaffOrderStatus).toHaveBeenCalledWith(42, "ready", "STAFF-FIXTURE-42");
    expect(f.notify).toHaveBeenCalledWith(order.userId, { kind: "order_status_changed", orderId: 42, status: "ready" });
  });
  it.each(["42x", "0", "-1", "FIXTURE-42", "9007199254740993"])("rejects an ambiguous ID %s", async (externalOrderId) => {
    const f = fixture(); await f.run({ externalOrderId });
    expect(f.res.status).toHaveBeenCalledWith(400);
    expect(f.store.applyStaffOrderStatus).not.toHaveBeenCalled();
  });
  it("rejects unknown statuses or a missing Staff reference", async () => {
    const f = fixture();
    await f.run(undefined, { appStatus: "made_up", concordiaOrderNumber: "x" });
    await f.run(undefined, { appStatus: "ready" });
    expect(f.store.applyStaffOrderStatus).not.toHaveBeenCalled();
  });
});
