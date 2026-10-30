import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStaffCheckoutPayload, checkoutExternalId } from "../server/staff-checkout";
import { dispatchPartnerOperation, processPartnerOutbox } from "../server/partner-outbox";

const order = {
  id: 42, orderType: "otc", orderNumber: "FIXTURE-UUID", userId: "fixture-patient",
  deliveryMethod: "pickup", contactPhone: "+12125550123", scheduledPickupTime: "Tomorrow",
  status: "pending", staffCheckoutStatus: "pending",
} as any;
const products = [{ id: 901, syncSource: "staff_panel", externalId: "sp:7", staffPanelProductId: 7 }] as any;
const items = [{ otcProductId: 901, quantity: 2, unitPrice: "4.25" }] as any;
const payload = () => buildStaffCheckoutPayload(order, items, products);
const success = (extras = {}) => ({
  orderId: 123, orderNumber: "STAFF-123", status: "pending", fulfillmentType: "pickup",
  paymentStatus: "collect_at_counter", trackingToken: "fixture-private", trackingExpiresAt: "fixture-expiry", ...extras,
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function transport(body: unknown, status = 201) {
  vi.stubEnv("CONCORDIA_STAFF_WEBHOOK_KEY", "fixture-only");
  const fetch = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Staff stock-checked checkout contract", () => {
  it("builds numeric canonical catalog lines, phone, unpaid pickup and a new immutable ID namespace", () => {
    const p = payload();
    expect(p.request).toMatchObject({ fulfillmentType: "pickup", paymentStatus: "collect_at_counter",
      externalOrderId: "care-checkout:FIXTURE-UUID", customerPhone: "+12125550123",
      items: [{ productId: 7, quantity: 2, unitPrice: 4.25 }] });
    expect(p.request).not.toHaveProperty("deliveryAddress");
    expect(p.request.externalOrderId).not.toBe(String(order.id));
  });
  it("builds delivery with an address without enabling online payment", () => {
    const p = buildStaffCheckoutPayload({ ...order, deliveryMethod: "delivery", deliveryAddress: "Isolated fixture address" }, items, products);
    expect(p.request).toMatchObject({ fulfillmentType: "delivery", deliveryAddress: "Isolated fixture address", paymentStatus: "collect_at_counter" });
  });
  it("rejects missing phone, missing delivery address and name-only/custom lines before queueing", () => {
    expect(() => buildStaffCheckoutPayload({ ...order, contactPhone: "" }, items, products)).toThrow();
    expect(() => buildStaffCheckoutPayload({ ...order, deliveryMethod: "delivery" }, items, products)).toThrow();
    expect(() => buildStaffCheckoutPayload(order, [{ quantity: 1, productName: "Custom", unitPrice: "1" }] as any, products)).toThrow();
  });
  it("groups repeated canonical IDs and rejects invalid quantities and price ambiguity", () => {
    expect(buildStaffCheckoutPayload(order, [...items, ...items], products).request.items[0].quantity).toBe(4);
    for (const quantity of [0, -1, 1.5, 101]) {
      expect(() => buildStaffCheckoutPayload(order, [{ ...items[0], quantity }], products)).toThrow();
    }
    expect(() => buildStaffCheckoutPayload(order, [...items, { ...items[0], unitPrice: "5" }], products)).toThrow();
  });
  it("uses only central checkout, strips local metadata, and confirms 201 without a reservationConfirmed flag", async () => {
    const fetch = transport(success());
    const p = payload();
    const result = await dispatchPartnerOperation("staff_checkout", p, "order:42:staff");
    expect(result).toMatchObject({ checkoutStatus: "confirmed", externalReference: "STAFF-123",
      checkoutReceipt: { staffOrderId: "123", trackingToken: "fixture-private" } });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0] as any;
    expect(url).toBe("https://concordia-staff.replit.app/api/public/orders");
    expect(request.headers).toMatchObject({ "X-API-KEY": "fixture-only", "Idempotency-Key": "order:42:staff" });
    expect(JSON.parse(request.body)).toEqual(p.request);
    expect(request.body).not.toContain("webhooks");
    expect(request.body).not.toContain("care_catalog_checkout_v1");
  });
  it.each(["INSUFFICIENT_STOCK", "PRODUCT_UNAVAILABLE", "PRICE_CHANGED", "PRICE_UNAVAILABLE"])(
    "makes %s a definitive rejection, never an automatic reprice or a new order", async code => {
      const fetch = transport({ error: code }, 409);
      expect(await dispatchPartnerOperation("staff_checkout", payload(), "order:42:staff"))
        .toEqual({ checkoutStatus: "rejected", checkoutError: code });
      expect(fetch).toHaveBeenCalledOnce();
    });
  it.each([[400, "INVALID_ADDRESS"], [401, "INVALID_SOURCE_KEY"], [403, "SOURCE_NOT_AUTHORIZED"]])(
    "handles HTTP %s %s without claiming reservation", async (status, code) => {
      transport({ code }, status as number);
      expect(await dispatchPartnerOperation("staff_checkout", payload(), "order:42:staff"))
        .toEqual({ checkoutStatus: "rejected", checkoutError: code });
    });
  it.each([{}, success({ duplicate: false }), success({ fulfillmentType: "delivery", duplicate: true }),
    success({ externalOrderId: "legacy-webhook-42", duplicate: true })])(
    "does not confirm an ambiguous or mismatched duplicate response", async body => {
      transport(body, 200);
      expect(await dispatchPartnerOperation("staff_checkout", payload(), "order:42:staff"))
        .toEqual({ checkoutStatus: "unconfirmed" });
    });
  it("does not treat a legacy import acknowledgement as a new reservation", async () => {
    transport({ orderNumber: "LEGACY-42" });
    const result = await dispatchPartnerOperation("staff_order", { id: "42", source: "concordia_care" }, "order:42:staff");
    expect(result).toEqual({ externalReference: "LEGACY-42" });
    expect(result.checkoutStatus).toBeUndefined();
  });

  it("recovers a lost reply using the same immutable ID and payload, without reserving stock twice", async () => {
    const remote = new Map<string, unknown>();
    const bodies: string[] = [];
    let stock = 3;
    vi.stubEnv("CONCORDIA_STAFF_WEBHOOK_KEY", "fixture-only");
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      bodies.push(options.body);
      const input = JSON.parse(options.body);
      if (remote.has(input.externalOrderId)) return Response.json(success({ duplicate: true }), { status: 200 });
      stock -= input.items[0].quantity;
      remote.set(input.externalOrderId, true);
      throw new Error("Isolated lost response after commit");
    }));
    let state = "pending";
    const row = { id: 9, operation: "staff_checkout", leaseToken: "lease", idempotencyKey: "order:42:staff", payload: payload() };
    const locked = {
      getOrder: vi.fn(async () => ({ ...order, staffCheckoutStatus: state })),
      ownsPartnerOutboxLease: vi.fn(async () => true),
      completePartnerOutboxWithEffects: vi.fn(async (_id, _lease, result) => { state = result.checkoutStatus; return true; }),
    };
    const store = {
      claimDuePartnerOutbox: vi.fn(async () => [row]), withOrderDeliveryLock: vi.fn(async (_id, run) => run(locked)),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    expect(await processPartnerOutbox(store as any, dispatchPartnerOperation)).toBe(0);
    expect(store.retryPartnerOutbox).toHaveBeenCalledOnce();
    expect(await processPartnerOutbox(store as any, dispatchPartnerOperation)).toBe(1);
    expect(state).toBe("confirmed");
    expect(stock).toBe(1);
    expect(remote.size).toBe(1);
    expect(bodies[0]).toBe(bodies[1]);
  });
  it("refuses checkout delivery for an old import order even if somebody adds a checkout job", async () => {
    const dispatch = vi.fn();
    const store = {
      claimDuePartnerOutbox: vi.fn(async () => [{ id: 9, operation: "staff_checkout", payload: payload(), leaseToken: "lease" }]),
      withOrderDeliveryLock: vi.fn(async (_id, run) => run({
        getOrder: async () => ({ ...order, staffCheckoutStatus: null }), ownsPartnerOutboxLease: async () => true,
      })),
      failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(),
    };
    await processPartnerOutbox(store as any, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.failPartnerOutbox).toHaveBeenCalledOnce();
  });
  it("never changes the new external identity on a retry", () => {
    expect(payload().request.externalOrderId).toBe(checkoutExternalId({ ...order, updatedAt: new Date() }));
  });
});
