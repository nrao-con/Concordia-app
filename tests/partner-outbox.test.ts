import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { dispatchPartnerOperation, processPartnerOutbox } from "../server/partner-outbox";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1, partner: "concordia", operation: "concordia_order",
  idempotencyKey: "key", payload: { id: 1 }, status: "processing",
  attempts: 0, nextAttemptAt: new Date(), lastError: null,
  leaseToken: "lease-a", createdAt: new Date(), updatedAt: new Date(), ...overrides,
}) as any;

describe("partner outbox worker fencing", () => {
  it("passes the claimed lease and completes effects after dispatch", async () => {
    const calls: string[] = [];
    const storage = {
      claimDuePartnerOutbox: vi.fn(async () => [row()]),
      completePartnerOutboxWithEffects: vi.fn(async (_id, lease) => { calls.push(`complete:${lease}`); return true; }),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    const dispatch = vi.fn(async () => { calls.push("dispatch"); return {}; });
    expect(await processPartnerOutbox(storage as any, dispatch)).toBe(1);
    expect(calls).toEqual(["dispatch", "complete:lease-a"]);
  });

  it("does not count a stale fenced completion", async () => {
    const storage = {
      claimDuePartnerOutbox: vi.fn(async () => [row()]),
      completePartnerOutboxWithEffects: vi.fn(async () => false),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    expect(await processPartnerOutbox(storage as any, async () => ({}))).toBe(0);
  });

  it("fences retries with the claimed lease", async () => {
    const storage = {
      claimDuePartnerOutbox: vi.fn(async () => [row()]),
      completePartnerOutboxWithEffects: vi.fn(),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    await processPartnerOutbox(storage as any, async () => { throw new Error("network"); });
    expect(storage.retryPartnerOutbox).toHaveBeenCalledWith(1, "lease-a", "network");
  });

  it("fails unsupported operations terminally", async () => {
    const storage = {
      claimDuePartnerOutbox: vi.fn(async () => [row({ operation: "unknown" })]),
      completePartnerOutboxWithEffects: vi.fn(),
      retryPartnerOutbox: vi.fn(), failPartnerOutbox: vi.fn(),
    };
    await processPartnerOutbox(storage as any, async () => ({}));
    expect(storage.failPartnerOutbox).toHaveBeenCalledWith(1, "lease-a", "Unsupported partner operation");
    expect(storage.retryPartnerOutbox).not.toHaveBeenCalled();
  });
});

describe("Staff Panel retry contract", () => {
  it("uses the same visible webhook contract as immediate checkout", async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.STAFF_APP_URL;
    const originalKey = process.env.CONCORDIA_STAFF_WEBHOOK_KEY;
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ orderNumber: "STAFF-123" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    globalThis.fetch = fetchMock as typeof fetch;
    process.env.STAFF_APP_URL = "https://staff.example.test";
    process.env.CONCORDIA_STAFF_WEBHOOK_KEY = "test-staff-key";
    const payload = {
      id: "42",
      orderNumber: "ORD-42",
      source: "concordia_care",
      status: "pending",
      createdAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T10:00:00Z",
      customerName: "Test Patient",
      deliveryMethod: "pickup",
      orderItems: [{ id: "1", name: "Test Item", quantity: 1, price: "0.00", concordiaProductId: "7" }],
    };
    try {
      const result = await dispatchPartnerOperation("staff_order", payload, "order:42:staff");
      expect(result).toEqual({ externalReference: "STAFF-123" });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe("https://concordia-staff.replit.app/api/public/webhooks/new-order");
      expect(request.headers).toMatchObject({
        "Content-Type": "application/json",
        "Idempotency-Key": "order:42:staff",
        "X-API-KEY": "test-staff-key",
      });
      expect(JSON.parse(request.body)).toEqual(payload);
      expect(JSON.parse(request.body)).not.toHaveProperty("patientName");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.STAFF_APP_URL;
      else process.env.STAFF_APP_URL = originalUrl;
      if (originalKey === undefined) delete process.env.CONCORDIA_STAFF_WEBHOOK_KEY;
      else process.env.CONCORDIA_STAFF_WEBHOOK_KEY = originalKey;
    }
  });

  it("uses the shared dispatcher for immediate checkout instead of a second sender", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const syncStart = routes.indexOf("async function syncOrderToStaffPanel");
    const syncEnd = routes.indexOf("export async function registerRoutes", syncStart);
    const syncSource = routes.slice(syncStart, syncEnd);
    expect(syncSource).toContain(
      'processPartnerOutbox(storage, dispatchPartnerOperation, 1, undefined, `order:${orderId}:staff`)',
    );
    expect(syncSource).not.toContain("/api/public/webhooks/new-order");
    expect(syncSource).not.toContain("STAFF_PANEL_BASE_URL");
    expect(syncSource).not.toContain("setTimeout");
  });

  it("includes the connected pharmacy code in PharmFlow chat payloads", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const messageStart = routes.indexOf('app.post("/api/pharmacy-messages"');
    const messageEnd = routes.indexOf('app.patch("/api/pharmacy-messages/:id/read"', messageStart);
    const messageSource = routes.slice(messageStart, messageEnd);
    expect(messageSource).toContain('pharmacyCode: "PHARMFLOWS"');
    expect(messageSource).toContain("storage.createOutgoingPharmacyMessage(");
    expect(messageSource).toContain('processPartnerOutbox(storage, dispatchPartnerOperation, 1, undefined, `message:${msg.id}:pharmflow`)');
    expect(messageSource).not.toContain("sendOrEnqueue(");
  });

  it("counts a successful authoritative Staff catalog sync as product health", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const staffStart = routes.indexOf("const syncProductsFromStaffPanel");
    const staffEnd = routes.indexOf("setTimeout(() => runSingletonJob(\"staff-products\"", staffStart);
    const staffSource = routes.slice(staffStart, staffEnd);
    expect(staffSource).toContain("lastProductSyncAt = new Date()");
    expect(staffSource.indexOf("lastProductSyncAt = new Date()")).toBeGreaterThan(
      staffSource.indexOf("bulkSyncOtcProducts"),
    );
  });
});