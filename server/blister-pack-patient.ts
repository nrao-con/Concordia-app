type Patient = {
  id: string;
  concordiaId: string | null;
  pharmacyPatientId: string | null;
  userRole: string | null;
  identityTrustStatus: string | null;
  identityReviewRequired: boolean | null;
};

type Lookups = {
  byLocalId: (id: string) => Promise<Patient | undefined>;
  byConcordiaId: (id: string) => Promise<Patient | undefined>;
  byPharmacyId: (id: string) => Promise<Patient | undefined>;
};

export type BlisterPackPatientResult =
  | { status: "matched"; patient: Patient }
  | { status: "identifier_required" | "invalid_identifier" | "not_found" | "identity_conflict" | "review_required" };

/** Contact fields are deliberately excluded: they cannot establish ownership. */
export async function resolveBlisterPackPatient(
  input: { userId?: unknown; concordiaId?: unknown; pharmacyPatientId?: unknown; [key: string]: unknown },
  lookups: Lookups,
): Promise<BlisterPackPatientResult> {
  const { userId, concordiaId, pharmacyPatientId } = input;
  const present = [userId, concordiaId, pharmacyPatientId].filter((value) => value !== undefined && value !== null);
  if (present.length === 0) return { status: "identifier_required" };
  const validId = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 255;
  if (present.some((value) => !validId(value)) ||
      (concordiaId != null && (typeof concordiaId !== "string" || !/^CP-\d{6}$/.test(concordiaId)))) {
    return { status: "invalid_identifier" };
  }

  const matches = await Promise.all([
    userId != null ? lookups.byLocalId(userId as string) : null,
    concordiaId != null ? lookups.byConcordiaId(concordiaId as string) : null,
    pharmacyPatientId != null ? lookups.byPharmacyId(pharmacyPatientId as string) : null,
  ]);
  const requested = matches.filter((patient): patient is Patient => patient != null);
  if (requested.length !== present.length) return { status: "not_found" };
  const patient = requested[0];
  if (requested.some((other) => other.id !== patient.id) ||
      (userId != null && patient.id !== userId) ||
      (concordiaId != null && patient.concordiaId !== concordiaId) ||
      (pharmacyPatientId != null && patient.pharmacyPatientId !== pharmacyPatientId)) {
    return { status: "identity_conflict" };
  }
  if (patient.userRole !== "patient" ||
      patient.identityTrustStatus !== "verified" || patient.identityReviewRequired ||
      !/^CP-\d{6}$/.test(patient.concordiaId ?? "") || !patient.pharmacyPatientId) {
    return { status: "review_required" };
  }
  return { status: "matched", patient };
}