import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  outcomeForScore,
  riskBandForScore,
  verifyFraudIngestionSignature,
} from "../server/fraud-crypto";

const originalSecret = process.env.FRAUD_INGESTION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.FRAUD_INGESTION_SECRET;
  else process.env.FRAUD_INGESTION_SECRET = originalSecret;
});

describe("fraud risk thresholds", () => {
  it("allows low risk, reviews elevated risk, and blocks critical risk", () => {
    expect(outcomeForScore(20)).toBe("allow");
    expect(outcomeForScore(45)).toBe("review");
    expect(outcomeForScore(80)).toBe("block");
    expect(riskBandForScore(100)).toBe("critical");
  });
});

describe("signed fraud ingestion", () => {
  it("accepts a current correctly signed body", () => {
    process.env.FRAUD_INGESTION_SECRET = "test-secret";
    const body = Buffer.from('{"sourceEventId":"event-123"}');
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "test-secret")
      .update(timestamp).update(".").update(body).digest("hex");
    expect(verifyFraudIngestionSignature(body, timestamp, signature)).toBe(true);
  });

  it("rejects changed bodies and expired signatures", () => {
    process.env.FRAUD_INGESTION_SECRET = "test-secret";
    const body = Buffer.from('{"sourceEventId":"event-123"}');
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const signature = createHmac("sha256", "test-secret")
      .update(timestamp).update(".").update(body).digest("hex");
    expect(verifyFraudIngestionSignature(body, timestamp, signature)).toBe(false);
    expect(verifyFraudIngestionSignature(Buffer.from("changed"), String(Date.now()), signature)).toBe(false);
  });
});