import { describe, expect, it } from "vitest";
import { isStandaloneAccount } from "../server/replit_integrations/auth/standalone";

const unlinked = {
  identityTrustStatus: "unverified",
  identityReviewRequired: false,
  concordiaId: null,
  pharmacyPatientId: null,
};

describe("separate signed-in accounts", () => {
  it("permits a new account without claiming a pharmacy identity", () => {
    expect(isStandaloneAccount(unlinked)).toBe(true);
  });

  it("does not turn patient-linked or held accounts into standalone accounts", () => {
    expect(isStandaloneAccount({ ...unlinked, concordiaId: "CP-123456" })).toBe(false);
    expect(isStandaloneAccount({ ...unlinked, pharmacyPatientId: "pharmacy-patient" })).toBe(false);
    expect(isStandaloneAccount({ ...unlinked, identityReviewRequired: true })).toBe(false);
    expect(isStandaloneAccount({ ...unlinked, identityTrustStatus: "pending_review" })).toBe(false);
    expect(isStandaloneAccount({ ...unlinked, identityTrustStatus: "verified" })).toBe(false);
  });
});