import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../server/db", () => ({ pool: { query: vi.fn() } }));

import {
  createEnrollmentPack, EnrollmentConflictError, EnrollmentPatientReviewError, findEnrollmentPack, validEnrollmentId,
  type EnrollmentCreate,
} from "../server/blister-enrollments";
import { resolveBlisterPackPatient } from "../server/blister-pack-patient";

const request: EnrollmentCreate = {
  pharmacyEnrollmentId: "enrollment-123",
  payloadHash: "hash-1",
  userId: "local-verified-1",
  name: "Monthly pack",
  medications: [{ name: "Sample", timeSlot: "Morning" }],
  durationDays: 1,
  startDate: new Date("2026-09-20T12:00:00Z"),
  qrCode: "data:image/png;base64,test",
  slots: [{
    slotIndex: 0, medicationName: "Sample", dosage: "one", timeSlot: "Morning",
    plannedDate: new Date("2026-09-20T08:00:00Z"),
  }],
};

function fakeDatabase(options: { failSlots?: boolean } = {}) {
  const packs = new Map<string, { id: number; userId: string; payloadHash: string }>();
  const effects = { slots: 0, notifications: 0, inserts: 0 };
  let nextId = 1;
  const connect = async () => {
    let pending: { id: number; enrollmentId: string; userId: string; hash: string } | null = null;
    let pendingSlots = 0;
    let pendingNotifications = 0;
    return {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql === "BEGIN" || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (sql.includes("FROM users WHERE id = $1")) {
          return { rows: [request.userId, "another-patient"].includes(values[0] as string) ? [{ id: values[0] }] : [] };
        }
        if (sql.includes("enrollment_payload_hash AS")) {
          const existing = packs.get(values[0] as string);
          return { rows: existing ? [{ id: existing.id, userId: existing.userId, payloadHash: existing.payloadHash }] : [] };
        }
        if (sql.includes("INSERT INTO blister_packs")) {
          pending = { id: nextId++, userId: values[0] as string, enrollmentId: values[1] as string, hash: values[2] as string };
          return { rows: [{ id: pending.id }] };
        }
        if (sql.includes("INSERT INTO blister_dose_slots")) {
          if (options.failSlots) throw new Error("slot insert failed");
          pendingSlots += JSON.parse(values[1] as string).length;
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO notifications")) { pendingNotifications++; return { rows: [] }; }
        if (sql === "COMMIT") {
          if (pending) {
            packs.set(pending.enrollmentId, { id: pending.id, userId: pending.userId, payloadHash: pending.hash });
            effects.inserts++;
          }
          effects.slots += pendingSlots;
          effects.notifications += pendingNotifications;
          return { rows: [] };
        }
        if (sql === "ROLLBACK") { pending = null; return { rows: [] }; }
        throw new Error(`Unexpected query: ${sql}`);
      },
      release: () => {},
    };
  };
  const lookup = async (_sql: string, values: unknown[]) => {
    const found = packs.get(values[0] as string);
    return { rows: found?.userId === values[1] ? [{ id: found.id }] : [] };
  };
  return { packs, effects, connect, lookup };
}

describe("pharmacy blister enrollment idempotency", () => {
  it("recovers the same pack after a successful commit whose response times out", async () => {
    const db = fakeDatabase();
    await expect((async () => {
      await createEnrollmentPack(request, db.connect as any);
      throw new Error("simulated response timeout");
    })()).rejects.toThrow("simulated response timeout");
    const retry = await createEnrollmentPack(request, db.connect as any);
    expect(retry).toEqual({ blisterPackId: 1, replayed: true });
    expect(db.effects).toEqual({ inserts: 1, slots: 1, notifications: 1 });
  });

  it("repeats a create without new local effects and rejects reused IDs with changed ownership or payload", async () => {
    const db = fakeDatabase();
    expect(await createEnrollmentPack(request, db.connect as any)).toEqual({ blisterPackId: 1, replayed: false });
    expect(await createEnrollmentPack(request, db.connect as any)).toEqual({ blisterPackId: 1, replayed: true });
    await expect(createEnrollmentPack({ ...request, payloadHash: "different" }, db.connect as any))
      .rejects.toBeInstanceOf(EnrollmentConflictError);
    await expect(createEnrollmentPack({ ...request, userId: "another-patient" }, db.connect as any))
      .rejects.toBeInstanceOf(EnrollmentConflictError);
    expect(db.effects).toEqual({ inserts: 1, slots: 1, notifications: 1 });
  });

  it("rejects a missing verified patient before creating any pack", async () => {
    const db = fakeDatabase();
    const lookup = vi.fn(async () => undefined);
    expect(await resolveBlisterPackPatient({ userId: "missing" }, {
      byLocalId: lookup, byConcordiaId: lookup, byPharmacyId: lookup,
    })).toEqual({ status: "not_found" });
    await expect(createEnrollmentPack({ ...request, userId: "missing" }, db.connect as any))
      .rejects.toBeInstanceOf(EnrollmentPatientReviewError);
    expect(db.effects.inserts).toBe(0);
  });

  it("rolls back the pack and notification if dose slot creation fails", async () => {
    const db = fakeDatabase({ failSlots: true });
    await expect(createEnrollmentPack(request, db.connect as any)).rejects.toThrow("slot insert failed");
    expect(db.effects).toEqual({ inserts: 0, slots: 0, notifications: 0 });
    expect(db.packs.size).toBe(0);
  });

  it("finds an already indexed historical pack only for its canonical owner", async () => {
    const db = fakeDatabase();
    db.packs.set("enrollment-historical", { id: 27, userId: request.userId, payloadHash: "older-hash" });
    expect(await findEnrollmentPack("enrollment-historical", request.userId, db.lookup)).toBe(27);
    expect(await findEnrollmentPack("enrollment-historical", "different-user", db.lookup)).toBeUndefined();
    // A pre-index pack with no enrollment ID cannot be safely matched by name.
    expect(await findEnrollmentPack("unindexed-old-enrollment", request.userId, db.lookup)).toBeUndefined();
    expect(db.effects.inserts).toBe(0);
  });

  it("rejects missing, padded or control-character enrollment identifiers", () => {
    expect(validEnrollmentId("enrollment-123")).toBe(true);
    expect(validEnrollmentId("")).toBe(false);
    expect(validEnrollmentId(" enrollment-123")).toBe(false);
    expect(validEnrollmentId("enrollment\n123")).toBe(false);
  });

  it("keeps create, lookup and status routes under partner-key guards", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/external/create-blister-pack", concordiaOrPharmFlowApi,');
    expect(routes).toContain('app.get("/api/external/blister-pack-by-enrollment", concordiaOrPharmFlowApi,');
    expect(routes).toContain('app.post("/api/external/blister-pack-status", pharmFlowApi,');
    expect(routes).toContain("blisterPackId: concordiaCareBlisterPackId, status");
    expect(routes).toContain('console.warn("[External BlisterPack] create rejected: pharmacy_enrollment_id_required")');
    expect(routes).toContain('console.warn("[External BlisterPack] create rejected: canonical_patient_id_required")');
    const migration = readFileSync(resolve(process.cwd(), "migrations/0018_blister_enrollment_idempotency.sql"), "utf8");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });
});