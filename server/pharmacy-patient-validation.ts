const CP_PATTERN = /^CP-[0-9]{6}$/;

export type PharmacyPatientFeedRow = {
  id: string;
  concordiaId: string;
  concordiaCareUserId?: string;
  prescriptions: PharmacyPrescriptionFeedRow[];
};
export type PharmacyPrescriptionFeedRow = {
  id: string;
  medicationName: string;
  rxNumber?: string;
  dosage?: string;
  instructions?: string;
  prescribedBy?: string;
  refillsRemaining: number;
  lastFilledDate?: string | null;
  nextRefillDate?: string | null;
  status: "active" | "cancelled";
};
const bounded = (value: unknown, max = 255): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const validDate = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null ||
  (typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value)));

export function validatePatientFeedPage(payload: unknown): { rows: PharmacyPatientFeedRow[]; total?: number } | null {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as any).patients)
      ? (payload as any).patients
      : null;
  if (!rows) return null;
  const total = !Array.isArray(payload) && Number.isInteger((payload as any).total)
    ? (payload as any).total : undefined;
  const result: PharmacyPatientFeedRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const id = (row as any).id;
    const concordiaId = (row as any).concordiaId;
    const linkage = (row as any).concordiaCareUserId;
    const prescriptions = (row as any).prescriptions ?? [];
    if (typeof id !== "string" || id.trim().length === 0 || id.length > 255) return null;
    if (typeof concordiaId !== "string" || !CP_PATTERN.test(concordiaId)) return null;
    if (linkage !== undefined && linkage !== null &&
        (typeof linkage !== "string" || linkage.trim().length === 0 || linkage.length > 255)) return null;
    if (!Array.isArray(prescriptions)) return null;
    const parsed: PharmacyPrescriptionFeedRow[] = [];
    for (const raw of prescriptions) {
      if (!raw || typeof raw !== "object") return null;
      const p = raw as any;
      if (!bounded(p.id) || !bounded(p.medicationName) ||
          !Number.isInteger(p.refillsRemaining) || p.refillsRemaining < 0 ||
          !["active", "cancelled"].includes(p.status) ||
          !validDate(p.lastFilledDate) || !validDate(p.nextRefillDate)) return null;
      for (const field of ["rxNumber", "dosage", "instructions", "prescribedBy"]) {
        if (p[field] !== undefined && p[field] !== null && !bounded(p[field])) return null;
      }
      parsed.push({
        id: p.id, medicationName: p.medicationName,
        ...(p.rxNumber ? { rxNumber: p.rxNumber } : {}),
        ...(p.dosage ? { dosage: p.dosage } : {}),
        ...(p.instructions ? { instructions: p.instructions } : {}),
        ...(p.prescribedBy ? { prescribedBy: p.prescribedBy } : {}),
        refillsRemaining: p.refillsRemaining,
        ...(p.lastFilledDate !== undefined ? { lastFilledDate: p.lastFilledDate } : {}),
        ...(p.nextRefillDate !== undefined ? { nextRefillDate: p.nextRefillDate } : {}),
        status: p.status,
      });
    }
    result.push({ id, concordiaId, prescriptions: parsed, ...(typeof linkage === "string" ? { concordiaCareUserId: linkage } : {}) });
  }
  return { rows: result, total };
}

export function validatePatientFeedCycle(rows: PharmacyPatientFeedRow[]): boolean {
  const cp = new Set<string>();
  const pharmacy = new Set<string>();
  const linkage = new Set<string>();
  const prescriptionIds = new Set<string>();
  return rows.every((row) => {
    if (cp.has(row.concordiaId) || pharmacy.has(row.id) ||
        (row.concordiaCareUserId !== undefined && linkage.has(row.concordiaCareUserId))) return false;
    cp.add(row.concordiaId);
    pharmacy.add(row.id);
    if (row.concordiaCareUserId !== undefined) linkage.add(row.concordiaCareUserId);
    for (const prescription of row.prescriptions) {
      if (prescriptionIds.has(prescription.id)) return false;
      prescriptionIds.add(prescription.id);
    }
    return true;
  });
}