import { createHmac, timingSafeEqual } from "crypto";

export type FraudOutcome = "allow" | "review" | "block";
export type FraudRiskBand = "low" | "medium" | "high" | "critical";

export function riskBandForScore(score: number): FraudRiskBand {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export function outcomeForScore(score: number): FraudOutcome {
  return score >= 80 ? "block" : score >= 45 ? "review" : "allow";
}

export function verifyFraudIngestionSignature(rawBody: Buffer, timestamp: string, signature: string): boolean {
  const secret = process.env.FRAUD_INGESTION_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest("hex");
  const given = signature.replace(/^sha256=/, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}