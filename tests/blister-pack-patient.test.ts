import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveBlisterPackPatient } from "../server/blister-pack-patient";

const patient = {
  id: "local-1",
  concordiaId: "CP-000123",
  pharmacyPatientId: "pharmacy-1",
  userRole: "patient",
  identityTrustStatus: "verified",
  identityReviewRequired: false,
};
const otherPatient = { ...patient, id: "local-2", concordiaId: "CP-000124", pharmacyPatientId: "pharmacy-2" };

function lookups() {
  return {
    byLocalId: vi.fn(async (id: string) => [patient, otherPatient].find((p) => p.id === id)),
    byConcordiaId: vi.fn(async (id: string) => [patient, otherPatient].find((p) => p.concordiaId === id)),
    byPharmacyId: vi.fn(async (id: string) => [patient, otherPatient].find((p) => p.pharmacyPatientId === id)),
  };
}

describe("external blister-pack patient ownership", () => {
  it("never resolves a patient from contact details", async () => {
    const lookup = lookups();
    const result = await resolveBlisterPackPatient({
      patientEmail: "patient@example.test",
      email: "patient@example.test",
      firstName: "A",
      phone: "5551234567",
      dateOfBirth: "1950-01-01",
    }, lookup);
    expect(result).toEqual({ status: "identifier_required" });
    expect(lookup.byLocalId).not.toHaveBeenCalled();
    expect(lookup.byConcordiaId).not.toHaveBeenCalled();
    expect(lookup.byPharmacyId).not.toHaveBeenCalled();
  });

  it("accepts each exact canonical identifier, even if contact fields disagree", async () => {
    for (const identifier of [
      { userId: "local-1" },
      { concordiaId: "CP-000123" },
      { pharmacyPatientId: "pharmacy-1" },
      { userId: "local-1", concordiaId: "CP-000123", pharmacyPatientId: "pharmacy-1" },
    ]) {
      expect(await resolveBlisterPackPatient({ ...identifier, email: "wrong@example.test" }, lookups()))
        .toEqual({ status: "matched", patient });
    }
  });

  it("rejects a mismatched or missing identifier without falling back to contact data", async () => {
    expect(await resolveBlisterPackPatient(
      { userId: "local-1", concordiaId: "CP-000124", patientEmail: "patient@example.test" }, lookups(),
    )).toEqual({ status: "identity_conflict" });
    expect(await resolveBlisterPackPatient(
      { concordiaId: "CP-000123", pharmacyPatientId: "unknown", phone: "5551234567" }, lookups(),
    )).toEqual({ status: "not_found" });
    expect(await resolveBlisterPackPatient(
      { concordiaId: "not-a-cp-id" }, lookups(),
    )).toEqual({ status: "invalid_identifier" });
  });

  it("does not create packs for patients under identity review", async () => {
    const lookup = lookups();
    lookup.byLocalId.mockImplementation(async () => ({ ...patient, identityReviewRequired: true }));
    expect(await resolveBlisterPackPatient({ userId: "local-1" }, lookup))
      .toEqual({ status: "review_required" });
    lookup.byLocalId.mockImplementation(async () => ({ ...patient, concordiaId: null }));
    expect(await resolveBlisterPackPatient({ userId: "local-1" }, lookup))
      .toEqual({ status: "review_required" });
    lookup.byLocalId.mockImplementation(async () => ({ ...patient, userRole: "caregiver" }));
    expect(await resolveBlisterPackPatient({ userId: "local-1" }, lookup))
      .toEqual({ status: "review_required" });
  });

  it("wires only the canonical resolver into the protected partner route", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const route = routes.slice(routes.indexOf('app.post("/api/external/create-blister-pack"'), routes.indexOf("const parsedStartDate = startDate"));
    expect(route).toContain("concordiaOrPharmFlowApi");
    expect(route).toContain("resolveBlisterPackPatient");
    expect(route).toContain("canonical_patient_id_required");
    expect(route).not.toContain("getUserByEmail");
    expect(route).not.toContain("findUserByPhone");
    expect(route).not.toContain("findUserByNamePhoneDob");
  });
});