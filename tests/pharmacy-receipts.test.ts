import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { parsePharmacyReceipt } from "../shared/pharmacy-receipts";
import { createPharmacyReceiptHandler } from "../server/pharmacy-receipts";
import { dispatchPartnerOperation, processPartnerOutbox, UnconfirmedMessageReceiptError } from "../server/partner-outbox";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("pharmacy delivery receipts", () => {
  it.each([null, {}, { concordiaCareMessageId: "1", status: "read" },
    { concordiaCareMessageId: 1, status: "sent" }, { concordiaCareMessageId: 0, status: "received" },
    { concordiaCareMessageId: 2, status: "read" }])("rejects invalid or mismatched receipt %j", body => {
    expect(parsePharmacyReceipt(body, 1)).toBeNull();
  });

  it("does not mistake local patient isRead for pharmacy read", () => {
    expect(parsePharmacyReceipt({ concordiaCareMessageId: 1, isRead: true }, 1)).toBeNull();
  });

  function appFixture() {
    let status = "sent";
    const store = {
      applyPharmacyReceipt: vi.fn(async (id: number, patientId: string, next: string) => {
        if (id !== 1 || patientId !== "fixture-patient") return undefined;
        if (status !== "read") status = next;
        return { id, userId: patientId, direction: "outbound", deliveryStatus: status, isRead: true };
      }),
    };
    const notify = vi.fn();
    const app = express().use(express.json());
    app.post("/receipt", createPharmacyReceiptHandler(store as any, notify));
    return { app, store, notify };
  }

  it("handles received, read, duplicate and late received callbacks without downgrading", async () => {
    const { app, notify } = appFixture();
    for (const [status, expected] of [["received", "received"], ["read", "read"], ["read", "read"], ["received", "read"]]) {
      const result = await request(app).post("/receipt")
        .send({ concordiaCareMessageId: 1, patientId: "fixture-patient", status });
      expect(result.status).toBe(200);
      expect(result.body.status).toBe(expected);
    }
    expect(notify).toHaveBeenLastCalledWith("fixture-patient", expect.objectContaining({ deliveryStatus: "read" }));
  });

  it("rejects malformed callbacks and mismatched patient IDs", async () => {
    const { app, store } = appFixture();
    expect((await request(app).post("/receipt").send({ concordiaCareMessageId: 1, status: "read" })).status).toBe(400);
    expect(store.applyPharmacyReceipt).not.toHaveBeenCalled();
    expect((await request(app).post("/receipt")
      .send({ concordiaCareMessageId: 1, patientId: "other-patient", status: "read" })).status).toBe(404);
  });

  it.each(["received", "read"])("accepts exact JSON %s acknowledgement with a stable retry identity", async status => {
    vi.stubEnv("PHARMFLOW_API_URL", "https://fixture.invalid");
    vi.stubEnv("PHARMFLOW_API_KEY", "fixture-only");
    const fetch = vi.fn(async () => Response.json({ concordiaCareMessageId: 1, status }));
    vi.stubGlobal("fetch", fetch);
    const payload = { concordiaCareMessageId: 1, patientId: "fixture-patient", message: "Isolated fixture" };
    for (let i = 0; i < 2; i++) {
      expect(await dispatchPartnerOperation("pharmflow_message", payload, "message:1:pharmflow"))
        .toEqual({ messageStatus: status });
    }
    for (const call of fetch.mock.calls as any[]) {
      expect(call[1].headers["Idempotency-Key"]).toBe("message:1:pharmflow");
      expect(JSON.parse(call[1].body)).toEqual(payload);
    }
  });

  it.each([
    () => new Response("<html>Website</html>", { headers: { "content-type": "text/html" } }),
    () => Response.json({ success: true }),
    () => Response.json({ concordiaCareMessageId: 2, status: "read" }),
  ])("leaves generic or wrong-message success unconfirmed", async makeResponse => {
    vi.stubEnv("PHARMFLOW_API_URL", "https://fixture.invalid");
    vi.stubEnv("PHARMFLOW_API_KEY", "fixture-only");
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse()));
    await expect(dispatchPartnerOperation("pharmflow_message", { concordiaCareMessageId: 1 }, "message:1:pharmflow"))
      .rejects.toBeInstanceOf(UnconfirmedMessageReceiptError);
  });

  it("does not replay a possibly accepted message solely to get a receipt", async () => {
    const store = {
      claimDuePartnerOutbox: vi.fn(async () => [{ id: 1, operation: "pharmflow_message",
        payload: { concordiaCareMessageId: 1 }, idempotencyKey: "message:1:pharmflow", leaseToken: "fixture-lease" }]),
      completePartnerOutboxWithEffects: vi.fn(), failPartnerOutbox: vi.fn(), retryPartnerOutbox: vi.fn(),
    };
    await processPartnerOutbox(store as any, async () => { throw new UnconfirmedMessageReceiptError("unconfirmed"); });
    expect(store.failPartnerOutbox).toHaveBeenCalledWith(1, "fixture-lease", "unconfirmed");
    expect(store.retryPartnerOutbox).not.toHaveBeenCalled();
    expect(store.completePartnerOutboxWithEffects).not.toHaveBeenCalled();
  });
});
