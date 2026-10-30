const CP_ID = /^CP-\d{6}$/;

export type CanonicalIdentity = {
  pharmacyUserId: string;
  canonicalPatientId: string;
  concordiaCareUserId: string | null;
  linkStatus: "linked" | "unlinked";
};

export type IdentityProofResult =
  | { ok: true; identity: CanonicalIdentity }
  | { ok: false; status: 401 | 404 | 409 | 503; error: string; message: string };

export function parseCanonicalIdentity(value: unknown): CanonicalIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.pharmacyUserId !== "string" || !data.pharmacyUserId.trim() ||
      typeof data.canonicalPatientId !== "string" || !CP_ID.test(data.canonicalPatientId) ||
      (data.concordiaCareUserId !== null &&
        (typeof data.concordiaCareUserId !== "string" || !data.concordiaCareUserId.trim())) ||
      (data.linkStatus !== "linked" && data.linkStatus !== "unlinked")) return null;
  if ((data.linkStatus === "linked") !== (data.concordiaCareUserId !== null)) return null;
  return data as CanonicalIdentity;
}

/** Proof never grants access: it only checks the exact local patient tuple. */
export function identityMatchesPatient(
  identity: CanonicalIdentity,
  patient: { id: string; concordiaId: string; pharmacyPatientId: string },
): boolean {
  return identity.canonicalPatientId === patient.concordiaId &&
    identity.pharmacyUserId === patient.pharmacyPatientId &&
    (!identity.concordiaCareUserId || identity.concordiaCareUserId === patient.id);
}

/**
 * Server-to-server proof only. The browser authenticates to this app with its
 * same-origin Clerk cookie; it never handles a bearer token for this request.
 */
export async function fetchCanonicalIdentity(
  pharmacyBaseUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
): Promise<IdentityProofResult> {
  if (!pharmacyBaseUrl || !sessionToken) {
    return { ok: false, status: 503, error: "pharmacy_identity_unavailable",
      message: "Pharmacy identity verification is not configured." };
  }
  let response: Response;
  try {
    response = await fetcher(`${pharmacyBaseUrl.replace(/\/$/, "")}/api/patient/canonical-identity`, {
      headers: { Authorization: `Bearer ${sessionToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, status: 503, error: "pharmacy_identity_unavailable",
      message: "Pharmacy identity verification is temporarily unavailable." };
  }
  if (response.status === 401) {
    return { ok: false, status: 401, error: "pharmacy_session_rejected",
      message: "The pharmacy did not accept this sign-in session." };
  }
  if (response.status === 404) {
    return { ok: false, status: 404, error: "pharmacy_identity_missing",
      message: "Your pharmacy account needs to be linked by the pharmacy team." };
  }
  if (response.status === 409) {
    return { ok: false, status: 409, error: "identity_conflict",
      message: "Your pharmacy identity needs review before it can be linked." };
  }
  if (response.status !== 200) {
    return { ok: false, status: 503, error: "pharmacy_identity_unavailable",
      message: "Pharmacy identity verification is temporarily unavailable." };
  }
  const identity = parseCanonicalIdentity(await response.json().catch(() => null));
  return identity
    ? { ok: true, identity }
    : { ok: false, status: 503, error: "pharmacy_identity_invalid",
        message: "The pharmacy identity response was invalid." };
}