import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByClerkUserId: vi.fn(),
  getUserByConcordiaId: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("../server/replit_integrations/auth/storage", () => ({
  authStorage: { getUserByClerkUserId: mocks.getUserByClerkUserId },
}));
vi.mock("../server/storage", () => ({
  storage: {
    getUserByClerkUserId: mocks.getUserByClerkUserId,
    getUserByConcordiaId: mocks.getUserByConcordiaId,
  },
}));
vi.mock("../server/db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../server/replit_integrations/auth/replitAuth", () => ({
  isClerkAuthenticated: (req: any, _res: any, next: any) => {
    req.auth = { userId: req.headers["x-reviewer"] ? "reviewer" : req.headers["x-requester"] || "signed-in-subject" };
    next();
  },
}));
vi.mock("@clerk/express", () => ({
  getAuth: (req: any) => ({ userId: req.auth?.userId }),
}));

import { registerAuthRoutes } from "../server/replit_integrations/auth/routes";

const standalone = {
  id: "temporary-account",
  clerkUserId: "signed-in-subject",
  identityTrustStatus: "unverified",
  identityReviewRequired: false,
  concordiaId: null,
  pharmacyPatientId: null,
};

function app() {
  const server = express();
  server.use(express.json());
  registerAuthRoutes(server);
  return server;
}

describe("voluntary pharmacy connection from a separate account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_USER_IDS = "reviewer";
    delete process.env.PHARMACY_CANONICAL_IDENTITY_PROOF_ENABLED;
    mocks.getUserByClerkUserId.mockResolvedValue(standalone);
    mocks.getUserByConcordiaId.mockResolvedValue({
      id: "existing-patient", concordiaId: "CP-123456",
      pharmacyPatientId: "pharmacy-123", identityTrustStatus: "verified",
      identityReviewRequired: false, clerkUserId: null,
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });
  });

  it("does not submit on sign-in or status checks; a patient can explicitly submit", async () => {
    const clientQuery = vi.fn(async (sql: string) => ({
      rows: sql.includes("INSERT INTO pharmacy_link_requests") ? [{ id: 7, status: "pending" }] : [],
    }));
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    const status = await request(app()).get("/api/pharmacy-link-requests/me");
    expect(status.status).toBe(200);
    expect(status.body.request).toBeNull();
    expect(mocks.connect).not.toHaveBeenCalled();

    const submitted = await request(app()).post("/api/pharmacy-link-requests")
      .send({ concordiaId: "CP-123456" });
    expect(submitted.status).toBe(202);
    expect(submitted.body).toEqual({ message: "If eligible, your request has been submitted for pharmacy review." });
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toContain("COMMIT");
  });

  it("does not look up patient IDs at submission, even for duplicate CP IDs", async () => {
    const insertedIds: string[] = [];
    const clientQuery = vi.fn(async (sql: string, params: string[]) => {
      if (sql.includes("INSERT INTO pharmacy_link_requests")) {
        insertedIds.push(params[2]);
        return { rows: [{ id: insertedIds.length, status: "pending" }] };
      }
      return { rows: [] };
    });
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });
    const server = app();
    const existing = await request(server).post("/api/pharmacy-link-requests")
      .send({ concordiaId: "CP-123456" });

    const unknown = await request(server).post("/api/pharmacy-link-requests")
      .send({ concordiaId: "CP-654321" });
    expect(unknown.status).toBe(existing.status);
    expect(unknown.body).toEqual(existing.body);
    const sameIdAnotherSubject = await request(server).post("/api/pharmacy-link-requests")
      .set("x-requester", "other-subject").send({ concordiaId: "CP-123456" });
    expect(sameIdAnotherSubject.status).toBe(existing.status);
    expect(sameIdAnotherSubject.body).toEqual(existing.body);
    expect(insertedIds).toEqual([
      "unverified:signed-in-subject:CP-123456",
      "unverified:signed-in-subject:CP-654321",
      "unverified:other-subject:CP-123456",
    ]);
    expect(mocks.getUserByConcordiaId).not.toHaveBeenCalled();

    mocks.connect.mockClear();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("count(*)")) return { rows: [{ count: 3 }] };
      return { rows: [] };
    });
    const limited = await request(server).post("/api/pharmacy-link-requests")
      .send({ concordiaId: "CP-999999" });
    expect(limited.status).toBe(429);
    expect(mocks.getUserByConcordiaId).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("retains the temporary row but atomically moves its Clerk sign-in to the verified patient", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM pharmacy_link_requests")) {
        return { rows: [{ status: "pending", clerk_subject: "signed-in-subject", concordia_id: "CP-123456", pharmacy_patient_id: "unverified:signed-in-subject:CP-123456" }] };
      }
      if (sql.includes("FROM users WHERE concordia_id=")) {
        return { rows: [{ id: "existing-patient", clerk_user_id: null, concordia_id: "CP-123456", pharmacy_patient_id: "pharmacy-123", identity_trust_status: "verified", identity_review_required: false }] };
      }
      if (sql.includes("FROM users WHERE clerk_user_id=")) {
        return { rows: [{ id: "temporary-account", identity_trust_status: "unverified", identity_review_required: false, concordia_id: null, pharmacy_patient_id: null }] };
      }
      return { rows: [], rowCount: sql.includes("UPDATE users SET clerk_user_id=NULL") ? 1 : undefined };
    });
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    const result = await request(app()).post("/api/admin/pharmacy-link-requests/7/decision")
      .set("x-reviewer", "true").send({ decision: "approve" });
    expect(result.status).toBe(200);
    const calls = clientQuery.mock.calls.map(([sql]) => sql);
    expect(calls.findIndex((sql) => sql.includes("SET clerk_user_id=NULL"))).toBeLessThan(
      calls.findIndex((sql) => sql.includes("SET clerk_user_id=$2")),
    );
    expect(calls.at(-1)).toBe("COMMIT");
  });

  it("requires a separate staff confirmation before replacing an older sign-in", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM pharmacy_link_requests")) {
        return { rows: [{ status: "pending", clerk_subject: "signed-in-subject", concordia_id: "CP-123456", pharmacy_patient_id: "pharmacy-123" }] };
      }
      if (sql.includes("FROM users WHERE concordia_id=")) {
        return { rows: [{ id: "existing-patient", clerk_user_id: "old-subject", concordia_id: "CP-123456", pharmacy_patient_id: "pharmacy-123", identity_trust_status: "verified", identity_review_required: false }] };
      }
      if (sql.includes("FROM users WHERE clerk_user_id=")) {
        return { rows: [{ id: "temporary-account", identity_trust_status: "unverified", identity_review_required: false, concordia_id: null, pharmacy_patient_id: null }] };
      }
      return { rows: [], rowCount: sql.includes("UPDATE users SET clerk_user_id=NULL") ? 1 : undefined };
    });
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });
    const server = app();

    const blocked = await request(server).post("/api/admin/pharmacy-link-requests/7/decision")
      .set("x-reviewer", "true").send({ decision: "approve" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("transfer_confirmation_required");
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("UPDATE users SET"))).toBe(false);

    clientQuery.mockClear();
    const wrongSubject = await request(server).post("/api/admin/pharmacy-link-requests/7/decision")
      .set("x-reviewer", "true").send({
        decision: "approve", replaceExistingSignIn: true,
        confirmedSubject: "another-account", verificationMethod: "in_person_id",
      });
    expect(wrongSubject.status).toBe(409);
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("UPDATE users SET"))).toBe(false);

    clientQuery.mockClear();
    const approved = await request(server).post("/api/admin/pharmacy-link-requests/7/decision")
      .set("x-reviewer", "true").send({
        decision: "approve", replaceExistingSignIn: true,
        confirmedSubject: "signed-in-subject", verificationMethod: "callback_registered_phone",
      });
    expect(approved.status).toBe(200);
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("SET clerk_user_id=$2"))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql, params]) =>
      sql.includes("INSERT INTO pharmacy_link_audit") && params?.includes("transfer_verified_callback_registered_phone"),
    )).toBe(true);
  });

  it("does not detach a held sign-in even when staff confirms a transfer", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM pharmacy_link_requests")) {
        return { rows: [{ status: "pending", clerk_subject: "signed-in-subject", concordia_id: "CP-123456", pharmacy_patient_id: "pharmacy-123" }] };
      }
      if (sql.includes("FROM users WHERE concordia_id=")) {
        return { rows: [{ id: "existing-patient", clerk_user_id: "old-subject", pharmacy_patient_id: "pharmacy-123", identity_trust_status: "verified", identity_review_required: false }] };
      }
      if (sql.includes("FROM users WHERE clerk_user_id=")) {
        return { rows: [{ id: "held-account", identity_trust_status: "pending_review", identity_review_required: true, concordia_id: null, pharmacy_patient_id: null }] };
      }
      return { rows: [] };
    });
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    const result = await request(app()).post("/api/admin/pharmacy-link-requests/7/decision")
      .set("x-reviewer", "true").send({ decision: "approve", replaceExistingSignIn: true });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("identity_conflict");
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("UPDATE users SET"))).toBe(false);
  });

  it("never approves a CP ID that staff cannot resolve to a verified patient", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM pharmacy_link_requests")) {
        return { rows: [{ status: "pending", clerk_subject: "signed-in-subject", concordia_id: "CP-654321", pharmacy_patient_id: "unverified:signed-in-subject:CP-654321" }] };
      }
      return { rows: [] };
    });
    mocks.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() });

    const result = await request(app()).post("/api/admin/pharmacy-link-requests/8/decision")
      .set("x-reviewer", "true").send({ decision: "approve" });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe("identity_conflict");
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("UPDATE users SET"))).toBe(false);
  });
});