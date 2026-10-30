import { createHash, createHmac, randomUUID } from "crypto";
import type { Request } from "express";
import { pool } from "./db";
import type { PoolClient } from "pg";
import { outcomeForScore, riskBandForScore } from "./fraud-crypto";
export { outcomeForScore, riskBandForScore, verifyFraudIngestionSignature } from "./fraud-crypto";

export type FraudAction =
  | "identity.link"
  | "caregiver.link"
  | "medication.refill"
  | "order.create"
  | "order.pickup"
  | "partner.event";

export interface FraudAssessment {
  eventId: number;
  requestId: string;
  score: number;
  riskBand: "low" | "medium" | "high" | "critical";
  outcome: "allow" | "review" | "block";
  caseId: number | null;
  caseNumber: string | null;
  signals: Array<{ code: string; weight: number }>;
}

interface AssessInput {
  actorId: string;
  patientUserId?: string | null;
  action: FraudAction;
  requestId?: string;
  source?: string;
  controlledMedication?: boolean;
  identityMatchOnly?: boolean;
  caregiver?: boolean;
  req?: Request;
  safeDetails?: Record<string, unknown>;
  transactionClient?: PoolClient;
}

function hmac(value: string | undefined): string | null {
  if (!value) return null;
  const key = process.env.SESSION_SECRET;
  if (!key) return createHash("sha256").update(value).digest("hex");
  return createHmac("sha256", key).update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function assessFraudRisk(input: AssessInput): Promise<FraudAssessment> {
  const requestId = input.requestId?.trim() || randomUUID();
  const queryRunner = input.transactionClient ?? pool;
  const existing = await queryRunner.query(
    `SELECT e.id, e.request_id, e.actor_id, e.patient_user_id, e.action, e.safe_details,
            e.score, e.risk_band, e.outcome,
            c.id AS case_id, c.case_number, c.status AS case_status, e.signals
       FROM fraud_events e LEFT JOIN fraud_cases c ON c.event_id = e.id
      WHERE e.request_id = $1`,
    [requestId],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (
      row.actor_id !== input.actorId ||
      row.patient_user_id !== (input.patientUserId ?? null) ||
      row.action !== input.action ||
      canonicalJson(row.safe_details) !== canonicalJson({
        ...(input.safeDetails ?? {}),
        controlledMedication: input.controlledMedication === true,
      })
    ) {
      throw new Error("Fraud idempotency key was reused for a different actor, patient, or action");
    }
    return {
      eventId: row.id, requestId: row.request_id, score: row.score,
      riskBand: row.risk_band, outcome: row.case_status === "approved" ? "allow" : row.outcome,
      caseId: row.case_id, caseNumber: row.case_number, signals: row.signals,
    };
  }

  const signals: Array<{ code: string; weight: number }> = [];
  const safeDetails = {
    ...(input.safeDetails ?? {}),
    controlledMedication: input.controlledMedication === true,
  };
  const actor = await queryRunner.query(
    `SELECT first_name, last_name, phone, date_of_birth, identity_trust_status, created_at FROM users WHERE id = $1`,
    [input.actorId],
  );
  const actorRow = actor.rows[0];
  if (!actorRow || !actorRow.first_name || !actorRow.last_name || !actorRow.phone || !actorRow.date_of_birth) {
    signals.push({ code: "identity_profile_incomplete", weight: 25 });
  }
  if (actorRow?.identity_trust_status && actorRow.identity_trust_status !== "verified") {
    signals.push({ code: "identity_not_verified", weight: 45 });
  }
  if (actorRow?.created_at && Date.now() - new Date(actorRow.created_at).getTime() < 24 * 60 * 60 * 1000) {
    signals.push({ code: "new_account", weight: 15 });
  }
  if (input.identityMatchOnly) signals.push({ code: "single_factor_record_match", weight: 70 });
  if (input.controlledMedication) signals.push({ code: "controlled_medication", weight: 45 });
  if (input.caregiver || (input.patientUserId && input.patientUserId !== input.actorId)) {
    signals.push({ code: "delegated_medication_access", weight: 25 });
  }

  const recent = await queryRunner.query(
    `SELECT count(*)::int AS count FROM fraud_events
      WHERE actor_id = $1 AND action = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [input.actorId, input.action],
  );
  if ((recent.rows[0]?.count ?? 0) >= 3) signals.push({ code: "high_request_velocity", weight: 45 });

  const score = Math.min(100, signals.reduce((total, signal) => total + signal.weight, 0));
  const riskBand = riskBandForScore(score);
  const outcome = outcomeForScore(score);
  const eventUuid = randomUUID();
  const caseNumber = outcome === "allow" ? null : `FR-${randomUUID().slice(0, 8).toUpperCase()}`;
  const ownsTransaction = !input.transactionClient;
  const client = input.transactionClient ?? await pool.connect();
  try {
    if (ownsTransaction) await client.query("BEGIN");
    const event = await client.query(
      `INSERT INTO fraud_events
       (event_id, request_id, actor_id, patient_user_id, action, outcome, score, risk_band,
        signals, safe_details, ip_hash, user_agent_hash, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
       RETURNING id`,
      [eventUuid, requestId, input.actorId, input.patientUserId ?? null, input.action, outcome,
       score, riskBand, JSON.stringify(signals), canonicalJson(safeDetails),
       hmac(input.req?.ip), hmac(input.req?.get("user-agent")), input.source ?? "app"],
    );
    let caseId: number | null = null;
    if (caseNumber) {
      const reviewCase = await client.query(
        `INSERT INTO fraud_cases (case_number, event_id, patient_user_id, priority)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [caseNumber, event.rows[0].id, input.patientUserId ?? null, riskBand === "critical" ? "critical" : "high"],
      );
      caseId = reviewCase.rows[0].id;
    }
    if (ownsTransaction) await client.query("COMMIT");
    return { eventId: event.rows[0].id, requestId, score, riskBand, outcome, caseId, caseNumber, signals };
  } catch (error: any) {
    if (ownsTransaction) await client.query("ROLLBACK");
    if (ownsTransaction && error?.code === "23505") return assessFraudRisk({ ...input, requestId });
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export function fraudBlockResponse(assessment: FraudAssessment) {
  return {
    error: assessment.outcome === "block" ? "identity_verification_failed" : "verification_required",
    message: "This medication request requires pharmacy identity review before it can continue.",
    caseNumber: assessment.caseNumber,
    requestId: assessment.requestId,
  };
}
