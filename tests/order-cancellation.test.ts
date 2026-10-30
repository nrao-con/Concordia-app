import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchPartnerOperation, processPartnerOutbox } from "../server/partner-outbox";
import { readFileSync } from "node:fs";

const payload = { concordiaCareOrderId: 42, patientId: "patient-test", status: "cancelled" };
const row = { id: 2, partner: "pharmflow", operation: "pharmflow_cancel_order",
  payload, leaseToken: "lease-test", attempts: 0, idempotencyKey: "order:42:pharmflow:cancel" };

beforeEach(() => {
  vi.stubEnv("PHARMFLOW_API_URL", "https://pharmflow.example.test");
  vi.stubEnv("PHARMFLOW_API_KEY", "test-only");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("PharmFlow cancellation transport", () => {
  it("sends a stable cancellation key and confirms only after an exact remote cancelled status", async () => {
    let cancelled = false;
    const transport = vi.fn(async (_url: string, request: any) => {
      if (request?.method === "POST") { cancelled = true; return new Response('{"success":true}'); }
      return new Response(JSON.stringify([{ concordiaCareOrderId: "42", status: cancelled ? "cancelled" : "preparing" }]));
    });
    vi.stubGlobal("fetch", transport);
    expect(await dispatchPartnerOperation("pharmflow_cancel_order", payload, row.idempotencyKey)).toEqual({});
    const [url, request] = transport.mock.calls[1];
    expect(url).toBe("https://pharmflow.example.test/api/order-status/patient-test?pharmacyCode=PHARMFLOWS");
    expect(request.headers).toMatchObject({ "Idempotency-Key": row.idempotencyKey, "x-api-key": "test-only" });
    expect(JSON.parse(request.body)).toEqual({ concordiaCareOrderId: 42, status: "cancelled" });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("reconciles a lost cancellation reply without sending the cancellation again", async () => {
    let accepted = false;
    const transport = vi.fn(async (_url: string, request: any) => {
      if (request?.method === "POST") { accepted = true; throw new Error("reply lost"); }
      return new Response(JSON.stringify([{ concordiaCareOrderId: 42, status: accepted ? "cancelled" : "preparing" }]));
    });
    vi.stubGlobal("fetch", transport);
    await expect(dispatchPartnerOperation("pharmflow_cancel_order", payload, row.idempotencyKey)).rejects.toThrow("reply lost");
    await dispatchPartnerOperation("pharmflow_cancel_order", payload, row.idempotencyKey);
    expect(transport.mock.calls.filter(([, req]) => req?.method === "POST")).toHaveLength(1);
  });

  it("does not mistake a 2xx, another order's cancellation, or unchanged state for confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, request) => new Response(request?.method === "POST"
      ? '{"success":true}'
      : JSON.stringify([{ concordiaCareOrderId: 42, status: "preparing" }, { concordiaCareOrderId: 43, status: "cancelled" }]))));
    await expect(dispatchPartnerOperation("pharmflow_cancel_order", payload, row.idempotencyKey))
      .rejects.toThrow("partner cancellation not yet confirmed");
  });

  it.each([500, 401, 404])("retries a failed cancellation delivery (%s) without confirming it", async (status) => {
    const transport = vi.fn(async (_url, request) => new Response(
      request?.method === "POST" ? '{}' : '[]', { status: request?.method === "POST" ? status : 200 },
    ));
    vi.stubGlobal("fetch", transport);
    const store: any = {
      claimDuePartnerOutbox: vi.fn(async () => [row]),
      ownsPartnerOutboxLease: vi.fn(async () => true),
      getOrder: vi.fn(async () => ({ id: 42, userId: payload.patientId, orderType: "rx_refill", status: "cancelled" })),
      completePartnerOutboxWithEffects: vi.fn(),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    store.withOrderDeliveryLock = vi.fn(async (_id, task) => task(store));
    await processPartnerOutbox(store, dispatchPartnerOperation);
    expect(store.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
    expect(store.retryPartnerOutbox).toHaveBeenCalledWith(2, "lease-test", `partner returned HTTP ${status}`);
  });

  it("checks lease ownership before any pharmacy side effect", async () => {
    const dispatch = vi.fn();
    const store: any = {
      claimDuePartnerOutbox: vi.fn(async () => [row]),
      ownsPartnerOutboxLease: vi.fn(async () => false),
      getOrder: vi.fn(), completePartnerOutboxWithEffects: vi.fn(),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    store.withOrderDeliveryLock = vi.fn(async (_id, task) => task(store));
    await processPartnerOutbox(store, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.getOrder).not.toHaveBeenCalled();
    expect(store.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
  });

  it("routes POST and PATCH cancellation through the same durable handler", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const start = routes.indexOf("const cancelPatientOrder");
    const end = routes.indexOf('app.delete("/api/orders/history"', start);
    const cancellation = routes.slice(start, end);
    expect(cancellation).toContain("storage.cancelOrderWithDelivery");
    expect(cancellation).toContain('if (status === "cancelled") return await cancelPatientOrder');
    expect(cancellation).toContain("await cancelPatientOrder(req, res, userId)");
    expect(cancellation).not.toContain('status: "cancelled"');
    const post = cancellation.slice(cancellation.indexOf('app.post("/api/orders/:id/cancel"'));
    expect(post).not.toContain("fetch(");
  });
});
