const PHARMACY_ID_PATTERN = /^CP-[0-9]{6}$/;

export type PharmacyIdentity = {
  pharmacyUserId: string;
  concordiaId: string;
  concordiaCareUserId?: string;
};
export type PharmacyIdentityHttpError = {
  status: 401 | 409 | 423 | 503;
  error: "identity_link_required" | "identity_conflict" | "pharmacy_identity_unavailable";
};

export function parsePharmacyIdentityError(payload: unknown): "identity_link_required" | "identity_conflict" | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  const code = value.error ?? value.code;
  return code === "identity_link_required" || code === "identity_conflict" ? code : null;
}

export function mapPharmacyIdentityHttpStatus(status: number, structuredError?: string | null): PharmacyIdentityHttpError | null {
  if (status === 401) return { status: 401, error: "pharmacy_identity_unavailable" };
  if (structuredError === "identity_link_required") return { status: 423, error: structuredError };
  if (structuredError === "identity_conflict") return { status: 409, error: structuredError };
  if (status === 409) return { status: 409, error: "identity_conflict" };
  if (status < 200 || status >= 300) {
    return { status: 503, error: "pharmacy_identity_unavailable" };
  }
  return null;
}

/** Parse only the pharmacy server's documented identity response fields. */
export function parsePharmacyIdentityResponse(payload: unknown): PharmacyIdentity | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  const pharmacyUserId = value.id;
  const concordiaId = value.concordiaId;
  const linkage = value.concordiaCareUserId;
  if (linkage !== undefined && typeof linkage !== "string") return null;
  const existingLinkage = typeof linkage === "string" && linkage.trim().length > 0 ? linkage : undefined;
  return typeof pharmacyUserId === "string" && pharmacyUserId.trim().length > 0
    && typeof concordiaId === "string" && PHARMACY_ID_PATTERN.test(concordiaId)
    ? { pharmacyUserId, concordiaId, ...(existingLinkage ? { concordiaCareUserId: existingLinkage } : {}) }
    : null;
}