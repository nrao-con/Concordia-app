import { describe, expect, it, vi } from "vitest";
import { fetchCanonicalIdentity, identityMatchesPatient, parseCanonicalIdentity } from "../server/replit_integrations/auth/canonical-identity";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const valid = {
  pharmacyUserId: "pharmacy-1",
  canonicalPatientId: "CP-000321",
  concordiaCareUserId: null,
  linkStatus: "unlinked",
};

describe("pharmacy website canonical identity contract", () => {
  it("accepts only a complete canonical response and coherent link state", () => {
    expect(parseCanonicalIdentity(valid)).toEqual(valid);
    expect(parseCanonicalIdentity({ ...valid, linkStatus: "linked", concordiaCareUserId: "app-1" })).not.toBeNull();
    expect(parseCanonicalIdentity({ ...valid, canonicalPatientId: "patient@example.com" })).toBeNull();
    expect(parseCanonicalIdentity({ ...valid, pharmacyUserId: "" })).toBeNull();
    expect(parseCanonicalIdentity({ ...valid, linkStatus: "linked" })).toBeNull();
    expect(parseCanonicalIdentity({ ...valid, concordiaCareUserId: "app-1" })).toBeNull();
    expect(parseCanonicalIdentity({ ...valid, linkStatus: "pending" })).toBeNull();
  });

  it("requires exact CP and pharmacy IDs, and rejects another app-profile owner", () => {
    const patient = { id: "app-1", concordiaId: "CP-000321", pharmacyPatientId: "pharmacy-1" };
    expect(identityMatchesPatient(valid, patient)).toBe(true);
    expect(identityMatchesPatient({ ...valid, canonicalPatientId: "CP-000322" }, patient)).toBe(false);
    expect(identityMatchesPatient({ ...valid, pharmacyUserId: "pharmacy-2" }, patient)).toBe(false);
    expect(identityMatchesPatient({ ...valid, concordiaCareUserId: "app-2", linkStatus: "linked" }, patient)).toBe(false);
    expect(identityMatchesPatient({ ...valid, concordiaCareUserId: "app-1", linkStatus: "linked" }, patient)).toBe(true);
  });

  it("uses a patient session bearer token only in the unused cross-tenant helper", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }));
    expect(await fetchCanonicalIdentity("https://pharmacy.example/", "session-jwt", fetcher)).toEqual({
      ok: true, identity: valid,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://pharmacy.example/api/patient/canonical-identity",
      expect.objectContaining({
        headers: { Authorization: "Bearer session-jwt", Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
      }),
    );
    const routes = readFileSync(resolve(process.cwd(), "server/replit_integrations/auth/routes.ts"), "utf8");
    expect(routes).not.toContain('process.env.PHARMACY_CANONICAL_IDENTITY_PROOF_ENABLED === "true"');
    expect(routes).not.toContain("fetchCanonicalIdentity(");
  });

  it.each([
    [401, "pharmacy_session_rejected"],
    [404, "pharmacy_identity_missing"],
    [409, "identity_conflict"],
    [500, "pharmacy_identity_unavailable"],
  ])("fails closed for website response %i", async (status, error) => {
    const result = await fetchCanonicalIdentity("https://pharmacy.example", "session-jwt",
      vi.fn(async () => new Response(null, { status })));
    expect(result).toMatchObject({ ok: false, error });
  });

  it("rejects invalid JSON and network failures", async () => {
    expect(await fetchCanonicalIdentity("https://pharmacy.example", "jwt",
      vi.fn(async () => new Response("not json", { status: 200 })))).toMatchObject({
        ok: false, error: "pharmacy_identity_invalid",
      });
    expect(await fetchCanonicalIdentity("https://pharmacy.example", "jwt",
      vi.fn(async () => { throw new Error("network unavailable"); }))).toMatchObject({
        ok: false, error: "pharmacy_identity_unavailable",
      });
    expect(await fetchCanonicalIdentity("", "jwt")).toMatchObject({ ok: false });
    expect(await fetchCanonicalIdentity("https://pharmacy.example", "")).toMatchObject({ ok: false });
  });
});