import { createHash } from "node:crypto";

export class WebhookPayloadConflictError extends Error {
  constructor() {
    super("Webhook event ID was reused with a different payload");
    this.name = "WebhookPayloadConflictError";
  }
}

/**
 * Partner status ordering is deliberately centralized. Unknown values are
 * treated as stale rather than being allowed to regress a known state.
 */
export const ORDER_STATUS_RANK: Readonly<Record<string, number>> = {
  pending: 0,
  received: 1,
  preparing: 2,
  verified: 3,
  ready: 4,
  picked_up: 5,
  delivered: 6,
  cancelled: 6,
};

export function normalizeOrderStatus(status: string): string {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    new: "pending",
    submitted: "received",
    in_progress: "preparing",
    complete: "delivered",
    completed: "delivered",
    pickedup: "picked_up",
    canceled: "cancelled",
  };
  return aliases[normalized] ?? normalized;
}

/** The staff pickup workflow's "complete" means collected, not delivered. */
export function mapStaffPanelOrderStatus(status: string): string | null {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const statuses: Record<string, string> = {
    received: "received",
    preparing: "preparing",
    in_progress: "preparing",
    ready: "ready",
    picked_up: "picked_up",
    pickedup: "picked_up",
    complete: "picked_up",
    completed: "picked_up",
    fulfilled: "picked_up",
    cancelled: "cancelled",
    canceled: "cancelled",
  };
  return statuses[normalized] ?? null;
}

/** Returns the accepted status, or null when the partner update is stale. */
export function acceptOrderStatus(current: string | null | undefined, incoming: string): string | null {
  const next = normalizeOrderStatus(incoming);
  const previous = normalizeOrderStatus(current ?? "pending");
  if (!(next in ORDER_STATUS_RANK) || !(previous in ORDER_STATUS_RANK)) return null;
  if (previous === "delivered" || previous === "picked_up" || previous === "cancelled") return null;
  return ORDER_STATUS_RANK[next] >= ORDER_STATUS_RANK[previous] ? next : null;
}

export function stablePayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  )).digest("hex");
}

/** Event IDs are preferred; payload hashes are only a fallback. */
export function webhookReceiptKey(source: string, eventId: string | null | undefined, payload: unknown): {
  source: string; sourceEventId: string; payloadHash: string;
} {
  const payloadHash = stablePayloadHash(payload);
  return { source, sourceEventId: eventId?.trim() || `payload:${payloadHash}`, payloadHash };
}

export function retryDelayMs(attempt: number, baseMs = 1_000, maxMs = 24 * 60 * 60 * 1_000): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(maxMs, baseMs * (2 ** safeAttempt));
}

export const PARTNER_OPERATIONS = [
  "concordia_order", "concordia_refill", "staff_order", "staff_checkout", "pharmflow_rx_order", "pharmflow_cancel_order", "concordia_patient",
  "pharmflow_patient", "concordia_medication", "pharmflow_message",
] as const;
export type PartnerOperation = typeof PARTNER_OPERATIONS[number];
export type PartnerDispatchResult = {
  externalReference?: string;
  messageStatus?: "received" | "read";
  checkoutStatus?: "confirmed" | "rejected" | "unconfirmed";
  checkoutError?: string;
  checkoutReceipt?: { staffOrderId: string; trackingToken?: string; trackingExpiresAt?: string };
};
export type PartnerOutboxDispatcher = (operation: PartnerOperation, payload: Record<string, unknown>, idempotencyKey: string) => Promise<PartnerDispatchResult>;

export function isPartnerOperation(value: string): value is PartnerOperation {
  return (PARTNER_OPERATIONS as readonly string[]).includes(value);
}

export class OrderCancellationError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

/** Shared by cancellation and outbound delivery, across processes/replicas. */
export function orderDeliveryLockKey(orderId: number): string {
  return `concordia-care:order-delivery:${orderId}`;
}