export type PharmacyReceiptStatus = "received" | "read";

/** A generic HTTP 200 (including an HTML website shell) is not a receipt. */
export function parsePharmacyReceipt(body: unknown, expectedId?: number) {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const id = value.concordiaCareMessageId;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  if (expectedId !== undefined && id !== expectedId) return null;
  if (value.status !== "received" && value.status !== "read") return null;
  return { id, status: value.status as PharmacyReceiptStatus };
}
