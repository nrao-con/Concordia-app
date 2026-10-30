import type { User } from "@shared/schema";

type StandaloneFields = Pick<User, "identityTrustStatus" | "identityReviewRequired" | "concordiaId" | "pharmacyPatientId">;

export function isStandaloneAccount(user: StandaloneFields): boolean {
  return user.identityTrustStatus === "unverified"
    && !user.identityReviewRequired
    && !user.concordiaId
    && !user.pharmacyPatientId;
}