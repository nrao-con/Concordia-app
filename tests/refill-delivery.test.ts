import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchPartnerOperation, processPartnerOutbox } from "../server/partner-outbox";
import { readFileSync } from "node:fs";

const payload = {
  concordiaCareOrderId: 42, patientId: "test-patient",
  pharmacyCode: "PHARMFLOWS", medications: [{ name: "Test medication", quantity: 1 }],
};
function fixture(overrides: Record<string, unknown> = {}) {
  const row: any = {
    id: 1, operation: "pharmflow_rx_order", partner: "pharmflow",
    idempotencyKey: "order:42:pharmflow", payload, leaseToken: "lease-one",
    attempts: 0, status: "processing",
  };
  const order: any = { id: 42, userId: "test-patient", orderType: "rx_refill",
    status: "preparing", pharmFlowSubmitted: false, ...overrides };
  const storage: any = {
    claimDuePartnerOutbox: vi.fn(async () => [row]),
    getOrder: vi.fn(async () => order),
    ownsPartnerOutboxLease: vi.fn(async () => true),
    withOrderDeliveryLock: vi.fn(async (_id, task) => task(storage)),
    completePartnerOutboxWithEffects: vi.fn(async () => { order.pharmFlowSubmitted = true; return true; }),
    retryPartnerOutbox: vi.fn(async () => { row.attempts++; row.status = "pending"; }),
    failPartnerOutbox: vi.fn(async () => { row.status = "failed"; }),
  };
  return { row, order, storage };
}

beforeEach(() => {
  vi.stubEnv("PHARMFLOW_API_URL", "https://pharmflow.example.test");
  vi.stubEnv("PHARMFLOW_API_KEY", "test-only");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("durable PharmFlow refill delivery", () => {
  it("uses the correct endpoint, immutable order ID and stable idempotency key, then commits confirmation", async () => {
    const { storage } = fixture();
    const fetchMock = vi.fn(async (_url, request) => new Response(
      JSON.stringify(request?.method === "POST" ? { success: true } : []),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const notify = vi.fn();
    expect(await processPartnerOutbox(storage as any, dispatchPartnerOperation, 25, notify)).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://pharmflow.example.test/api/order-status/test-patient?pharmacyCode=PHARMFLOWS");
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("https://pharmflow.example.test/api/incoming-orders");
    expect(request.headers).toMatchObject({
      "Idempotency-Key": "order:42:pharmflow", "x-api-key": "test-only",
    });
    expect(JSON.parse(request.body)).toEqual(payload);
    expect(storage.completePartnerOutboxWithEffects).toHaveBeenCalledWith(1, "lease-one", {});
    expect(notify).toHaveBeenCalledOnce();
  });

  it("keeps a failed HTTP delivery unconfirmed and retries with the identical key and payload", async () => {
    const { storage, order } = fixture();
    let posts = 0;
    const fetchMock = vi.fn(async (_url, request) => new Response(
      JSON.stringify(request?.method === "POST" ? { success: true } : []),
      { status: request?.method === "POST" && posts++ === 0 ? 503 : 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    expect(await processPartnerOutbox(storage as any, dispatchPartnerOperation)).toBe(0);
    expect(order.pharmFlowSubmitted).toBe(false);
    expect(storage.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
    expect(storage.retryPartnerOutbox).toHaveBeenCalledWith(1, "lease-one", "partner returned HTTP 503");
    expect(await processPartnerOutbox(storage as any, dispatchPartnerOperation)).toBe(1);
    const sends = fetchMock.mock.calls.filter(([, req]) => req?.method === "POST");
    expect(sends[0][1].body).toBe(sends[1][1].body);
    expect(sends[0][1].headers["Idempotency-Key"]).toBe(sends[1][1].headers["Idempotency-Key"]);
  });

  it("reconciles an accepted request whose reply was lost without POSTing again", async () => {
    const { storage, order } = fixture();
    let accepted = false;
    const fetchMock = vi.fn(async (_url, request) => {
      if (request?.method === "POST") { accepted = true; throw new Error("lost HTTP reply"); }
      return new Response(JSON.stringify(accepted ? [{ concordiaCareOrderId: "42", status: "received" }] : []));
    });
    vi.stubGlobal("fetch", fetchMock);
    await processPartnerOutbox(storage as any, dispatchPartnerOperation);
    expect(order.pharmFlowSubmitted).toBe(false);
    await processPartnerOutbox(storage as any, dispatchPartnerOperation);
    expect(order.pharmFlowSubmitted).toBe(true);
    expect(fetchMock.mock.calls.filter(([, req]) => req?.method === "POST")).toHaveLength(1);
  });

  it("reconciles a lost database completion even with an attempt count of zero", async () => {
    const { storage, row } = fixture();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ orders: [
      { concordiaCareOrderId: 42, status: "received" },
    ] }))));
    storage.completePartnerOutboxWithEffects.mockRejectedValueOnce(new Error("database interrupted"));
    await processPartnerOutbox(storage as any, dispatchPartnerOperation);
    row.attempts = 0; // A process crash could leave the original claim to expire.
    expect(await processPartnerOutbox(storage as any, dispatchPartnerOperation)).toBe(1);
    expect((fetch as any).mock.calls.every(([, req]: any[]) => req?.method !== "POST")).toBe(true);
  });

  it.each([
    [502, "[]"], [200, "<html>frontend shell</html>"], [200, '{"success":true}'],
  ])("does not blindly POST when reconciliation is unavailable or invalid (%s)", async (status, body) => {
    const { storage } = fixture();
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetchMock);
    await processPartnerOutbox(storage as any, dispatchPartnerOperation);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storage.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
    expect(storage.retryPartnerOutbox).toHaveBeenCalledOnce();
  });

  it.each(["cancelled", "picked_up", "delivered"])("does not submit a queued refill already marked %s", async (status) => {
    const { storage } = fixture({ status });
    const dispatch = vi.fn();
    await processPartnerOutbox(storage as any, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(storage.failPartnerOutbox).toHaveBeenCalledWith(1, "lease-one", "Refill is no longer active");
  });

  it("rejects a mismatched patient and does not repeat an already recorded confirmation", async () => {
    const mismatch = fixture({ userId: "different-patient" });
    const dispatch = vi.fn();
    await processPartnerOutbox(mismatch.storage as any, dispatch);
    expect(mismatch.storage.failPartnerOutbox).toHaveBeenCalledWith(1, "lease-one", "Invalid refill ownership");
    const recorded = fixture({ pharmFlowSubmitted: true });
    const notify = vi.fn();
    await processPartnerOutbox(recorded.storage as any, dispatch, 25, notify);
    expect(dispatch).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not notify on stale lease completion or retry a committed order when notification fails", async () => {
    const { storage } = fixture();
    const notify = vi.fn(() => { throw new Error("notification unavailable"); });
    storage.completePartnerOutboxWithEffects.mockResolvedValueOnce(false);
    await processPartnerOutbox(storage as any, async () => ({}), 25, notify);
    expect(notify).not.toHaveBeenCalled();
    await processPartnerOutbox(storage as any, async () => ({}), 25, notify);
    expect(notify).toHaveBeenCalledOnce();
    expect(storage.retryPartnerOutbox).not.toHaveBeenCalled();
  });

  it("the checkout route queues verified item names atomically, even without configured partner credentials", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const checkout = routes.slice(routes.indexOf('app.post("/api/orders"'), routes.indexOf('app.get("/api/blister-packs"'));
    expect(checkout).toContain("}, preparedItems, refillPayload, !isRxOrder)");
    expect(checkout).toContain("medications: preparedItems.map");
    expect(checkout).toContain("pharmFlowSubmitted: false");
    expect(checkout).toContain("pharmFlowSubmittedAt: null");
    expect(checkout).not.toContain("/api/incoming-orders");
    expect(checkout).not.toContain("process.env.PHARMFLOW_API_URL && isRxOrder");
  });
});
