import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeEmail, normalizePhone, IdentityValidationError } from "../shared/identity";
import { apiErrorMessage } from "../client/src/lib/queryClient";
import {
  mapPharmacyIdentityHttpStatus,
  parsePharmacyIdentityError,
  parsePharmacyIdentityResponse,
} from "../server/replit_integrations/auth/pharmacy-identity";
import { validatePatientFeedPage, validatePatientFeedCycle } from "../server/pharmacy-patient-validation";

describe("patient identity normalization", () => {
  it("normalizes Unicode, whitespace, and case in email", () => {
    expect(normalizeEmail("  User@EXAMPLE.COM  ")).toBe("user@example.com");
    expect(normalizeEmail(" ＵＳＥＲ@example.com ").startsWith("user@")).toBe(true);
  });

  it("canonicalizes US phone formats", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("1-555-123-4567")).toBe("+15551234567");
    expect(normalizePhone("555.123.4567")).toBe(normalizePhone("+1 (555) 123-4567"));
  });

  it("rejects invalid identity contacts with field information", () => {
    expect(() => normalizeEmail("not-an-email")).toThrow(IdentityValidationError);
    expect(() => normalizePhone("555-123")).toThrow(IdentityValidationError);
    try { normalizePhone("abc"); } catch (error) {
      expect(error).toMatchObject({ field: "phone" });
    }
  });

  it("shows the server identity-conflict message to the patient", () => {
    const error = new Error('409: {"error":"identity_conflict","field":"phone","message":"Phone number is already registered."}');
    expect(apiErrorMessage(error, "Unable to save")).toBe("Phone number is already registered.");
    expect(apiErrorMessage(new Error("500: unavailable"), "Unable to save")).toBe("Unable to save");
  });

  it("keeps migration and runtime Unicode normalization aligned", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/0011_patient_identity_uniqueness.sql"),
      "utf8",
    );
    expect(migration.match(/lower\(normalize\(btrim\(u\.email\), NFKC\)\)/g)).toHaveLength(2);
    expect(migration).not.toContain("WHERE lower(btrim(u.email))");
  });

  it("keeps identity fields self-only and roles outside profile updates", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const importer = readFileSync(resolve(process.cwd(), "server/pharmacy-patient-sync.ts"), "utf8");
    expect(routes).toContain(
      "if (!isSelf && [firstName, lastName, dateOfBirth, phone, email, userRole].some",
    );
    expect(routes).toContain('error: "role_edit_forbidden"');
    expect(routes).toContain("Caregivers may only update address and preferences.");
  });

  it("strictly parses the pharmacy-owned identity response", () => {
    expect(parsePharmacyIdentityResponse({ id: "pharmacy-user-9", concordiaId: "CP-123456", concordiaCareUserId: "local-9" }))
      .toEqual({ pharmacyUserId: "pharmacy-user-9", concordiaId: "CP-123456", concordiaCareUserId: "local-9" });
    expect(parsePharmacyIdentityResponse({ id: "pharmacy-user-9", concordiaId: "cp-123456" })).toBeNull();
    expect(parsePharmacyIdentityResponse({ id: "pharmacy-user-9", concordiaId: "CP-12345" })).toBeNull();
    expect(parsePharmacyIdentityResponse({ concordiaId: "CP-123456", email: "patient@example.com" })).toBeNull();
    expect(parsePharmacyIdentityResponse({ id: "pharmacy-user-9", concordiaPatientId: "CP-123456" })).toBeNull();
  });

  it("maps pharmacy identity link, conflict, and outage responses", () => {
    expect(parsePharmacyIdentityError({ error: "identity_link_required" })).toBe("identity_link_required");
    expect(mapPharmacyIdentityHttpStatus(404)).toEqual({ status: 503, error: "pharmacy_identity_unavailable" });
    expect(mapPharmacyIdentityHttpStatus(404, "identity_link_required")).toEqual({ status: 423, error: "identity_link_required" });
    expect(mapPharmacyIdentityHttpStatus(409)).toEqual({ status: 409, error: "identity_conflict" });
    expect(mapPharmacyIdentityHttpStatus(401)).toEqual({ status: 401, error: "pharmacy_identity_unavailable" });
    expect(mapPharmacyIdentityHttpStatus(503)).toEqual({ status: 503, error: "pharmacy_identity_unavailable" });
    expect(mapPharmacyIdentityHttpStatus(200)).toBeNull();
  });

  it("keeps auth linking independent from contact matching and account creation", () => {
    const authRoutes = readFileSync(resolve(process.cwd(), "server/replit_integrations/auth/routes.ts"), "utf8");
    expect(authRoutes).not.toContain("lookupPatientOnWebsite");
    expect(authRoutes).not.toContain("upsertUser({");
    expect(authRoutes).toContain("getUserByClerkUserId");
    expect(authRoutes).toContain("getUserByConcordiaId");
    expect(authRoutes).toContain("bindAuthoritativePharmacyIdentity");
    expect(authRoutes).toContain("Authorization: `Bearer ${token}`");
    expect(authRoutes).toContain("AbortSignal.timeout(5000)");
    expect(authRoutes).not.toContain("X-API-KEY");
    expect(authRoutes).not.toContain("privateMetadata");
    expect(authRoutes).not.toContain("extractPharmacyPatientId");
  });

  it("binds only the Clerk subject and preserves pharmacy trust holds", () => {
    const authStorage = readFileSync(
      resolve(process.cwd(), "server/replit_integrations/auth/storage.ts"),
      "utf8",
    );
    const bindBody = authStorage.slice(authStorage.indexOf("async bindClerkUserToPatient"));
    expect(bindBody).toContain("clerkUserId,");
    expect(bindBody).not.toContain('identityTrustStatus: "verified"');
    expect(bindBody).not.toContain("identityReviewRequired: false");
    const databaseStorage = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
    const databaseBindBody = databaseStorage.slice(databaseStorage.indexOf("async bindClerkUserToPatient"));
    expect(databaseBindBody).toContain("clerkUserId,");
    expect(databaseBindBody).not.toContain('identityTrustStatus: "verified"');
    expect(databaseBindBody).not.toContain("identityReviewRequired: false");
  });

  it("defines the pharmacy internal identity field and non-destructive unique migration", () => {
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0014_add_pharmacy_patient_id.sql"), "utf8");
    expect(schema).toContain('pharmacyPatientId: varchar("pharmacy_patient_id")');
    expect(schema).toContain("UQ_users_pharmacy_patient_id");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });

  it("protects globally authoritative prescription IDs and refuses duplicate migration state", () => {
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0015_medications_external_rx_unique.sql"), "utf8");
    const importer = readFileSync(resolve(process.cwd(), "server/pharmacy-patient-sync.ts"), "utf8");
    expect(schema).toContain('uniqueIndex("UQ_medications_external_rx_id")');
    expect(migration).toContain("HAVING COUNT(*) > 1");
    expect(migration).toContain("RAISE EXCEPTION");
    expect(migration).not.toContain("DELETE");
    expect(importer).toContain("externalMatches[0].id !== rxMatches[0].id");
    expect(importer).toContain('.for("update")');
  });

  it("records provenance and staff-review conflicts without PHI payloads", () => {
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0016_pharmacy_sync_provenance_conflicts.sql"), "utf8");
    const importer = readFileSync(resolve(process.cwd(), "server/pharmacy-patient-sync.ts"), "utf8");
    expect(schema).toContain('syncSource: text("sync_source")');
    expect(schema).toContain('lastSyncedAt: timestamp("last_synced_at")');
    expect(schema).toContain("pharmacySyncConflicts");
    expect(migration).toContain("fingerprint");
    expect(importer).toContain('syncSource: "concordia_pharmacy"');
    expect(importer).toContain("(!canonical || canonical.id !== row.concordiaCareUserId)");
    expect(importer).toContain("lastSyncedAt: values.lastSyncedAt");
    expect(importer).toContain("patient_transaction_failure");
    expect(importer).not.toContain("medicationName: prescription.medicationName, ...");
  });

  it("validates the complete immutable pharmacy feed without contact fields", () => {
    const page = validatePatientFeedPage({
      patients: [
        { id: "pharmacy-1", concordiaId: "CP-123456", email: "ignored@example.com", prescriptions: [
          { id: "rx-1", medicationName: "Medication A", instructions: null, refillsRemaining: 1, status: "active", ignored: "field" },
        ] },
        { id: "pharmacy-2", concordiaId: "CP-654321", concordiaCareUserId: "local-2" },
      ],
      total: 2,
    });
    expect(page?.rows[0]).toHaveProperty("id", "pharmacy-1");
    expect(page?.rows[0]).toHaveProperty("concordiaId", "CP-123456");
    expect(page?.rows[0]).not.toHaveProperty("email");
    expect(page?.rows[0].prescriptions[0]).toEqual({
      id: "rx-1", medicationName: "Medication A", refillsRemaining: 1, status: "active",
    });
    expect(validatePatientFeedCycle(page!.rows)).toBe(true);
    expect(validatePatientFeedCycle([...page!.rows, page!.rows[0]])).toBe(false);
    expect(validatePatientFeedCycle([
      { id: "pharmacy-3", concordiaId: "CP-333333", concordiaCareUserId: "local-2", prescriptions: [] },
      { id: "pharmacy-4", concordiaId: "CP-444444", concordiaCareUserId: "local-2", prescriptions: [] },
    ])).toBe(false);
    expect(validatePatientFeedPage([
      { id: "pharmacy-5", concordiaId: "CP-555555", concordiaCareUserId: null },
    ])?.rows).toEqual([{ id: "pharmacy-5", concordiaId: "CP-555555", prescriptions: [] }]);
    expect(validatePatientFeedPage([{ id: "pharmacy-1", concordiaId: "CP-12345" }])).toBeNull();
    const duplicatePrescriptionPage = validatePatientFeedPage([{ id: "pharmacy-1", concordiaId: "CP-123456", prescriptions: [
      { id: "rx-1", medicationName: "A", refillsRemaining: 1, status: "active" },
      { id: "rx-1", medicationName: "B", refillsRemaining: 1, status: "active" },
    ] }]);
    expect(validatePatientFeedCycle(duplicatePrescriptionPage!.rows)).toBe(false);
  });

  it("integrates the importer before medication pulls and uses pharmacy IDs", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const importer = readFileSync(resolve(process.cwd(), "server/pharmacy-patient-sync.ts"), "utf8");
    expect(routes).toContain("startPharmacyPatientSync();");
    expect(routes).toContain("user.pharmacyPatientId");
    expect(routes).toContain("if (!pharmacyPatientId) return;");
    expect(routes).not.toContain("pharmacyPatientId || userId");
    expect(importer).toContain("MAX_PATIENT_SYNC_ROWS");
    expect(importer).toContain("MAX_PATIENT_SYNC_PAGES");
    expect(importer).toContain("pg_try_advisory_lock");
    expect(importer).toContain("page.rows.length < PAGE_SIZE");
    expect(importer).not.toContain("if (directArray ||");
    expect(importer).toContain("pg_try_advisory_lock");
    expect(importer).toContain('headers: { "X-API-KEY": key }');
    expect(importer).not.toContain("email");
    expect(importer).not.toContain("phone");
    expect(importer).toContain("prescriptionsCreated");
    expect(importer).toContain("externalRxId: prescription.id");
    expect(routes).not.toContain('setInterval(() => runSingletonJob("concordia-medications"');
  });

  it("keeps medication reads scoped to the resolved patient or an approved caregiver link", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
    const storage = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
    const principal = routes.slice(routes.indexOf("function getAuth(req: Request)"), routes.indexOf("async function resolveEffectiveUserId"));
    const resolver = routes.slice(routes.indexOf("async function resolveEffectiveUserId"), routes.indexOf("async function orderHasControlledMedication"));
    const medicationsRoute = routes.slice(routes.indexOf('app.get("/api/medications"'), routes.indexOf('app.post("/api/medications"'));
    const medicationsQuery = storage.slice(storage.indexOf("async getMedicationsWithLinkedConditions("));
    expect(principal).toContain("getCanonicalUserId(req)");
    expect(resolver).toContain('l.patientId === patientId && (l.status === "approved" || l.isApproved)');
    expect(resolver).toContain('patient.identityTrustStatus !== "verified"');
    expect(medicationsRoute).toContain("resolveEffectiveUserId(req, res)");
    expect(medicationsRoute).toContain("getMedicationsWithLinkedConditions(userId)");
    expect(medicationsQuery).toContain(".where(eq(medications.userId, userId))");
  });
});