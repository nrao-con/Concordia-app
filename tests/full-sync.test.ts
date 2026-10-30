import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createFullSyncHandler } from "../server/full-sync";

const patient = {
  id: "test-patient", firstName: "Test", lastName: "Patient",
  identityTrustStatus: "verified", identityReviewRequired: false,
  userRole: "patient", pharmacyPatientId: "test-pharmacy-patient",
  dateOfBirth: "1980-01-02T00:00:00Z",
  phone: "5550100", email: "patient@example.test", deliveryAddress: "Test address",
};

function fixture(users: any[] = [patient]) {
  const store = {
    getAllUsers: vi.fn(async () => users),
    getOtcProducts: vi.fn(async () => [{ id: 1 }, { id: 2 }] as any),
    // Tripwires: full sync must not enumerate or mutate historical orders,
    // nor manufacture/retry delivery intents.
    getOrders: vi.fn(() => { throw new Error("must not read orders"); }),
    getOrderItems: vi.fn(() => { throw new Error("must not read order items"); }),
    updateOrder: vi.fn(),
    enqueuePartnerOutbox: vi.fn(),
    retryFailedPartnerOutbox: vi.fn(),
  };
  const transport = vi.fn<typeof fetch>(async () => new Response('{"success":true}'));
  const config = vi.fn(() => ({ baseUrl: "https://pharmflow.example.test", apiKey: "test-only" }));
  const handler = createFullSyncHandler(store, config, transport);
  async function run() {
    const res = { statusCode: 200, body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: any) { this.body = body; return this; },
    };
    await handler({} as any, res as any, vi.fn());
    return res;
  }
  return { store, transport, config, run };
}

describe("full sync without order resubmission", () => {
  it("preserves the profile request and existing summary fields", async () => {
    const f = fixture();
    const res = await f.run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true, synced: { patients: 1, ordersToPharmFlow: 0, productsAvailable: 2 },
      patientsSkipped: 0, orderDelivery: "durable_queue", errors: undefined,
    });
    expect(f.transport).toHaveBeenCalledWith(
      "https://pharmflow.example.test/api/patient-profile",
      expect.objectContaining({
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": "test-only" },
        body: JSON.stringify({
          concordiaCareUserId: patient.id, patientName: "Test Patient", dateOfBirth: "01/02/1980",
          phone: patient.phone, email: patient.email, deliveryAddress: patient.deliveryAddress,
        }),
      }),
    );
  });

  it("repeated syncs never read, recreate or resend orders or requeue deliveries", async () => {
    const f = fixture();
    await f.run();
    await f.run();
    expect(f.transport).toHaveBeenCalledTimes(2);
    for (const [url] of f.transport.mock.calls) expect(url).toBe("https://pharmflow.example.test/api/patient-profile");
    expect(f.store.getOrders).not.toHaveBeenCalled();
    expect(f.store.getOrderItems).not.toHaveBeenCalled();
    expect(f.store.updateOrder).not.toHaveBeenCalled();
    expect(f.store.enqueuePartnerOutbox).not.toHaveBeenCalled();
    expect(f.store.retryFailedPartnerOutbox).not.toHaveBeenCalled();
  });

  it.each([
    { identityTrustStatus: "unverified" },
    { identityTrustStatus: "pending_review" },
    { identityReviewRequired: true },
    { userRole: "caregiver" },
    { userRole: "admin" },
    { pharmacyPatientId: null },
    { firstName: "", lastName: "" },
  ])("does not export a non-patient, unlinked or held account: %j", async (override) => {
    const f = fixture([{ ...patient, ...override }, patient]);
    const res = await f.run();
    expect(res.body.synced.patients).toBe(1);
    expect(res.body.patientsSkipped).toBe(1);
    expect(f.transport).toHaveBeenCalledTimes(1);
  });

  it("preserves profile defaults and blank DOB behavior", async () => {
    const f = fixture([{ ...patient, dateOfBirth: null, phone: null, email: null, deliveryAddress: null }]);
    await f.run();
    expect(JSON.parse(String(f.transport.mock.calls[0][1]?.body))).toMatchObject({
      dateOfBirth: "", phone: "", email: "", deliveryAddress: "",
    });
  });

  it.each([401, 500])("reports HTTP %s without claiming profile acceptance", async (status) => {
    const f = fixture([patient, { ...patient, id: "test-second" }]);
    f.transport.mockResolvedValueOnce(new Response("sensitive remote body", { status }));
    const res = await f.run();
    expect(res.body.synced).toEqual({ patients: 1, ordersToPharmFlow: 0, productsAvailable: 2 });
    expect(res.body.errors).toEqual([`Patient profile: HTTP ${status}`]);
    expect(JSON.stringify(res.body)).not.toContain("sensitive remote body");
  });

  it("continues after a network failure without exposing partner error details", async () => {
    const f = fixture([patient, { ...patient, id: "test-second" }]);
    f.transport.mockRejectedValueOnce(new Error("sensitive connection details"));
    const res = await f.run();
    expect(res.body.synced.patients).toBe(1);
    expect(res.body.errors).toEqual(["Patient profile: delivery unavailable"]);
    expect(JSON.stringify(res.body)).not.toContain("sensitive connection details");
  });

  it("fails closed when PharmFlow configuration is missing", async () => {
    const f = fixture();
    const handler = createFullSyncHandler(f.store, () => null, f.transport);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({} as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(f.store.getAllUsers).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  });

  it("does not expose a credential configuration exception", async () => {
    const f = fixture();
    f.config.mockImplementation(() => { throw new Error("sensitive config"); });
    const res = await f.run();
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("sensitive config");
    expect(f.transport).not.toHaveBeenCalled();
  });

  it("retains the protected route and the normal checkout's durable delivery", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    expect(routes).toContain('app.post("/api/sync/full", concordiaApi, createFullSyncHandler(storage,');
    const start = routes.indexOf('app.post("/api/orders",');
    expect(start).toBeGreaterThan(-1);
    const checkout = routes.slice(start, routes.indexOf("\n  app.", start + 1));
    expect(checkout).toContain("storage.createOrderWithItems");
    expect(checkout).toContain("preparedItems, refillPayload");
    expect(routes).toContain("processPartnerOutbox(");
  });
});
