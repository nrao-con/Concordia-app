import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { pool } from "./db";
import { users, medications, pharmacySyncConflicts } from "../shared/schema";
import { validatePatientFeedPage, validatePatientFeedCycle, type PharmacyPatientFeedRow } from "./pharmacy-patient-validation";
const PAGE_SIZE = 200;
export const MAX_PATIENT_SYNC_ROWS = 1000;
export const MAX_PATIENT_SYNC_PAGES = 10;
export { validatePatientFeedPage, validatePatientFeedCycle };

async function recordConflict(tx: any, row: PharmacyPatientFeedRow, type: string, prescriptionId?: string) {
  const fingerprint = `${type}:${row.id}:${row.concordiaId}:${prescriptionId ?? ""}`;
  await tx.insert(pharmacySyncConflicts).values({
    fingerprint, conflictType: type, pharmacyPatientId: row.id,
    concordiaId: row.concordiaId, prescriptionId,
  }).onConflictDoUpdate({
    target: pharmacySyncConflicts.fingerprint,
    set: { status: "open", occurrenceCount: sql`${pharmacySyncConflicts.occurrenceCount} + 1`, lastSeenAt: new Date() },
  });
}

class PrescriptionOwnershipConflict extends Error {
  constructor(readonly prescriptionId: string) {
    super("Prescription ownership conflict");
  }
}

let syncRunning = false;

export type PatientImportCounts = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  invalid: number;
  prescriptionsFetched: number;
  prescriptionsCreated: number;
  prescriptionsUpdated: number;
  prescriptionsUnchanged: number;
  prescriptionsConflicts: number;
};

export async function importPharmacyPatients(): Promise<PatientImportCounts> {
  const counts: PatientImportCounts = {
    fetched: 0, created: 0, updated: 0, unchanged: 0, conflicts: 0, invalid: 0,
    prescriptionsFetched: 0, prescriptionsCreated: 0, prescriptionsUpdated: 0,
    prescriptionsUnchanged: 0, prescriptionsConflicts: 0,
  };
  const base = process.env.CONCORDIA_API_URL;
  const key = process.env.CONCORDIA_API_KEY;
  if (!base || !key) return counts;

  if (syncRunning) return counts;
  syncRunning = true;
  let client: any;
  let lockAcquired = false;
  const rows: PharmacyPatientFeedRow[] = [];
  let offset = 0;
  let expectedTotal: number | undefined;
  let pageCount = 0;
  try {
    client = await pool.connect();
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      ["concordia-patient-import"],
    );
    if (!lock.rows[0]?.locked) return counts;
    lockAcquired = true;
    while (true) {
      pageCount++;
      if (pageCount > MAX_PATIENT_SYNC_PAGES) { counts.invalid++; return counts; }
      const response = await fetch(`${base}/api/external/patients?limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: { "X-API-KEY": key },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const page = validatePatientFeedPage(payload);
      if (!page || !validatePatientFeedCycle(page.rows)) {
        counts.invalid++;
        return counts;
      }
      if (page.total !== undefined) {
        if (!Number.isSafeInteger(page.total) || page.total < 0 || page.total > MAX_PATIENT_SYNC_ROWS) {
          counts.invalid++;
          return counts;
        }
        if (expectedTotal !== undefined && page.total !== expectedTotal) {
          counts.invalid++;
          return counts;
        }
        if (expectedTotal === undefined) expectedTotal = page.total;
      } else if (expectedTotal !== undefined && offset + page.rows.length < expectedTotal) {
        counts.invalid++;
        return counts;
      }
      if (page.rows.length === 0 && offset < (expectedTotal ?? 0)) {
        counts.invalid++;
        return counts;
      }
      rows.push(...page.rows);
      offset += page.rows.length;
      if (rows.length > MAX_PATIENT_SYNC_ROWS) { counts.invalid++; return counts; }
      if (page.rows.length === 0 || page.rows.length < PAGE_SIZE ||
          (expectedTotal !== undefined && offset >= expectedTotal)) break;
    }
    if (!validatePatientFeedCycle(rows) || (expectedTotal !== undefined && rows.length !== expectedTotal)) {
      counts.invalid++;
      return counts;
    }
    counts.fetched = rows.length;
    counts.prescriptionsFetched = rows.reduce((sum, row) => sum + row.prescriptions.length, 0);
    for (const row of rows) {
      // Only publish counters after the transaction commits; rolled-back work
      // must never be reported as created or updated.
      const committed = {
        created: 0, updated: 0, unchanged: 0,
        prescriptionsCreated: 0, prescriptionsUpdated: 0, prescriptionsUnchanged: 0,
      };
      try {
        await db.transaction(async (tx) => {
        const [byCp] = await tx.select().from(users).where(eq(users.concordiaId, row.concordiaId)).for("update");
        const [byPharmacy] = await tx.select().from(users).where(eq(users.pharmacyPatientId, row.id)).for("update");
        if (byCp && byPharmacy && byPharmacy.id !== byCp.id) { counts.conflicts++; await recordConflict(tx, row, "pharmacy_ownership_conflict"); return; }
        const canonical = byCp ?? byPharmacy;
        if (row.concordiaCareUserId && (!canonical || canonical.id !== row.concordiaCareUserId)) {
          counts.conflicts++;
          await recordConflict(tx, row, "identity_linkage_conflict");
          return;
        }
        let ownerId = canonical?.id;
        if (canonical) {
          if (canonical.concordiaId && canonical.concordiaId !== row.concordiaId) { counts.conflicts++; await recordConflict(tx, row, "pharmacy_ownership_conflict"); return; }
          if (canonical.pharmacyPatientId && canonical.pharmacyPatientId !== row.id) { counts.conflicts++; await recordConflict(tx, row, "pharmacy_ownership_conflict"); return; }
          if (canonical.pharmacyPatientId === row.id && canonical.concordiaId === row.concordiaId) committed.unchanged++;
          else {
            await tx.update(users).set({ concordiaId: row.concordiaId, pharmacyPatientId: row.id, updatedAt: new Date() }).where(eq(users.id, canonical.id));
            committed.updated++;
          }
        } else {
          ownerId = row.concordiaCareUserId || randomUUID();
          await tx.insert(users).values({
            id: ownerId,
            concordiaId: row.concordiaId,
            pharmacyPatientId: row.id,
            identityTrustStatus: "verified",
          });
          committed.created++;
        }
        for (const prescription of row.prescriptions) {
          const [externalMatches, rxMatches] = await Promise.all([
            tx.select().from(medications).where(eq(medications.externalRxId, prescription.id)).for("update"),
            prescription.rxNumber
              ? tx.select().from(medications).where(eq(medications.rxNumber, prescription.rxNumber)).for("update")
              : Promise.resolve([]),
          ]);
          if (externalMatches.length > 1 || rxMatches.length > 1 ||
              (externalMatches[0] && rxMatches[0] && externalMatches[0].id !== rxMatches[0].id) ||
              externalMatches.some((med) => med.userId !== ownerId) ||
              rxMatches.some((med) => med.userId !== ownerId)) {
              throw new PrescriptionOwnershipConflict(prescription.id);
          }
          if (!ownerId) throw new PrescriptionOwnershipConflict(prescription.id);
          const existing = externalMatches[0] ?? rxMatches.find((med) => med.userId === ownerId);
          const values = {
            externalRxId: prescription.id,
            name: prescription.medicationName,
            rxNumber: prescription.rxNumber ?? null,
            dosage: prescription.dosage ?? "",
            frequency: "As directed",
            prescribedBy: prescription.prescribedBy ?? null,
            refillsRemaining: prescription.refillsRemaining,
            lastFilledDate: prescription.lastFilledDate ? new Date(prescription.lastFilledDate) : null,
            nextRefillDate: prescription.nextRefillDate ? new Date(prescription.nextRefillDate) : null,
            instructions: prescription.instructions ?? null,
            category: "prescription",
            isActive: prescription.status === "active",
            syncSource: "concordia_pharmacy",
            lastSyncedAt: new Date(),
          };
          if (!existing) {
            await tx.insert(medications).values({ userId: ownerId, ...values });
            committed.prescriptionsCreated++;
          } else {
            const changed = Object.entries(values).filter(([key]) => key !== "syncSource" && key !== "lastSyncedAt").some(([key, value]) => (existing as any)[key] instanceof Date && value instanceof Date
              ? (existing as any)[key].getTime() !== value.getTime()
              : (existing as any)[key] !== value);
            if (!changed) {
              await tx.update(medications).set({
                syncSource: "concordia_pharmacy",
                lastSyncedAt: values.lastSyncedAt,
              }).where(eq(medications.id, existing.id));
              committed.prescriptionsUnchanged++;
            }
            else {
              await tx.update(medications).set(values).where(eq(medications.id, existing.id));
              committed.prescriptionsUpdated++;
            }
          }
        }
        await tx.update(users).set({ lastPharmacySyncAt: new Date() }).where(eq(users.id, ownerId!));
        // Only a fully committed patient import proves that the previously
        // reported ownership/linkage conflicts for this exact pair are clear.
        await tx.update(pharmacySyncConflicts).set({ status: "resolved" }).where(and(
          eq(pharmacySyncConflicts.pharmacyPatientId, row.id),
          eq(pharmacySyncConflicts.concordiaId, row.concordiaId),
          eq(pharmacySyncConflicts.status, "open"),
        ));
        });
        for (const key of Object.keys(committed) as (keyof typeof committed)[]) {
          counts[key] += committed[key];
        }
      } catch (error) {
        // A single patient's transaction must not roll back unrelated patients.
        counts.conflicts++;
        if (error instanceof PrescriptionOwnershipConflict) {
          counts.prescriptionsConflicts++;
          // The patient's writes were rolled back. Record review separately
          // so the conflict itself survives the rollback.
          try {
            await recordConflict(db, row, "prescription_ownership_conflict", error.prescriptionId);
          } catch { counts.invalid++; }
          continue;
        }
        try {
          await db.insert(pharmacySyncConflicts).values({
            fingerprint: `patient-transaction:${row.id}:${row.concordiaId}`,
            conflictType: "patient_transaction_failure",
            pharmacyPatientId: row.id,
            concordiaId: row.concordiaId,
          }).onConflictDoUpdate({
            target: pharmacySyncConflicts.fingerprint,
            set: {
              status: "open",
              occurrenceCount: sql`${pharmacySyncConflicts.occurrenceCount} + 1`,
              lastSeenAt: new Date(),
            },
          });
        } catch { /* conflict review persistence is best effort */ }
      }
    }
    console.log(
      `[Concordia Patient Import] fetched=${counts.fetched} created=${counts.created} updated=${counts.updated} ` +
      `unchanged=${counts.unchanged} conflicts=${counts.conflicts} invalid=${counts.invalid} ` +
      `prescriptionsFetched=${counts.prescriptionsFetched} prescriptionsCreated=${counts.prescriptionsCreated} ` +
      `prescriptionsUpdated=${counts.prescriptionsUpdated} prescriptionsUnchanged=${counts.prescriptionsUnchanged} ` +
      `prescriptionsConflicts=${counts.prescriptionsConflicts}`,
    );
  } catch {
    // Partner outages are non-fatal; the next bounded cycle retries.
  } finally {
    if (client) {
      if (lockAcquired) {
        try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["concordia-patient-import"]); } catch {}
      }
      client.release();
    }
    syncRunning = false;
  }
  return counts;
}

export function startPharmacyPatientSync(): void {
  const run = () => void importPharmacyPatients().then((counts) => {
    console.log(
      `[Concordia Patient Sync] fetched=${counts.fetched} created=${counts.created} ` +
      `updated=${counts.updated} unchanged=${counts.unchanged} ` +
      `conflicts=${counts.conflicts} invalid=${counts.invalid}`,
    );
  });
  const initial = setTimeout(run, 5000);
  initial.unref?.();
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
}