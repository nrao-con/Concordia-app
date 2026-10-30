import type { PoolClient } from "pg";
import { pool } from "./db";

export class EnrollmentConflictError extends Error {}
export class EnrollmentPatientReviewError extends Error {}

export function validEnrollmentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}

export type EnrollmentSlot = {
  slotIndex: number;
  medicationName: string;
  dosage: string;
  timeSlot: string;
  plannedDate: Date;
};

export type EnrollmentCreate = {
  pharmacyEnrollmentId: string;
  payloadHash: string;
  userId: string;
  name: string;
  medications: unknown[];
  durationDays: number;
  startDate: Date;
  qrCode: string;
  slots: EnrollmentSlot[];
};

type Connect = () => Promise<Pick<PoolClient, "query" | "release">>;

/**
 * Serialize by immutable enrollment ID across processes. All local effects
 * commit together before the caller sends a response; a lost response can be
 * recovered by retrying the same request.
 */
export async function createEnrollmentPack(
  input: EnrollmentCreate,
  connect: Connect = () => pool.connect(),
): Promise<{ blisterPackId: number; replayed: boolean }> {
  const client = await connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`blister-enrollment:${input.pharmacyEnrollmentId}`]);
    const verified = await client.query(
      `SELECT id FROM users WHERE id = $1 AND user_role = 'patient'
         AND identity_trust_status = 'verified' AND identity_review_required IS NOT TRUE
         AND concordia_id ~ '^CP-[0-9]{6}$' AND pharmacy_patient_id IS NOT NULL FOR UPDATE`,
      [input.userId],
    );
    if (!verified.rows.length) throw new EnrollmentPatientReviewError("Patient identity needs review");
    const existing = await client.query(
      `SELECT id, user_id AS "userId", enrollment_payload_hash AS "payloadHash"
         FROM blister_packs WHERE pharmacy_enrollment_id = $1`,
      [input.pharmacyEnrollmentId],
    );
    if (existing.rows.length) {
      const pack = existing.rows[0];
      if (pack.userId !== input.userId || pack.payloadHash !== input.payloadHash) {
        throw new EnrollmentConflictError("Enrollment ID is already assigned to a different patient or payload");
      }
      await client.query("COMMIT");
      return { blisterPackId: pack.id, replayed: true };
    }
    const created = await client.query(
      `INSERT INTO blister_packs
        (user_id, pharmacy_enrollment_id, enrollment_payload_hash, name, medications,
         duration_days, status, start_date, qr_code)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'active', $7, $8)
       RETURNING id`,
      [input.userId, input.pharmacyEnrollmentId, input.payloadHash, input.name,
        JSON.stringify(input.medications), input.durationDays, input.startDate, input.qrCode],
    );
    const blisterPackId = created.rows[0].id as number;
    if (input.slots.length) {
      await client.query(
        `INSERT INTO blister_dose_slots
           (blister_pack_id, slot_index, medication_name, dosage, time_slot, planned_date, status)
         SELECT $1, slot_index, medication_name, dosage, time_slot, planned_date::timestamp, 'pending'
           FROM jsonb_to_recordset($2::jsonb) AS slots
             (slot_index integer, medication_name text, dosage text, time_slot text, planned_date text)`,
        [blisterPackId, JSON.stringify(input.slots.map((slot) => ({
          slot_index: slot.slotIndex,
          medication_name: slot.medicationName,
          dosage: slot.dosage,
          time_slot: slot.timeSlot,
          planned_date: slot.plannedDate.toISOString(),
        })))],
      );
    }
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'blister_pack', $2, $3)`,
      [input.userId, "New Blister Pack", `A new blister pack "${input.name}" has been set up for you by your pharmacy.`],
    );
    await client.query("COMMIT");
    return { blisterPackId, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function findEnrollmentPack(
  pharmacyEnrollmentId: string,
  userId: string,
  query: (sql: string, values: unknown[]) => Promise<{ rows: { id: number }[] }> =
    (sql, values) => pool.query(sql, values),
): Promise<number | undefined> {
  const result = await query(
    "SELECT id FROM blister_packs WHERE pharmacy_enrollment_id = $1 AND user_id = $2",
    [pharmacyEnrollmentId, userId],
  );
  return result.rows[0]?.id;
}