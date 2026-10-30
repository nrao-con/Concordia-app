import type { PartnerOutbox } from "@shared/schema";
import type { IStorage, LockedOrderDelivery } from "./storage";
import { isPartnerOperation, type PartnerOutboxDispatcher } from "./sync-reliability";
import { STAFF_BASE_URL } from "./staff-inventory";
import { parsePharmacyReceipt } from "@shared/pharmacy-receipts";
import { STAFF_CHECKOUT_KIND, STAFF_CHECKOUT_ERRORS, checkoutExternalId } from "./staff-checkout";

export class UnconfirmedMessageReceiptError extends Error {}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function findPharmFlowOrder(payload: Record<string, unknown>) {
  const id = Number(payload.concordiaCareOrderId);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof payload.patientId !== "string" || !payload.patientId) {
    throw new Error("invalid pharmacy order identity");
  }
  const response = await fetch(
    `${required("PHARMFLOW_API_URL")}/api/order-status/${encodeURIComponent(payload.patientId)}?pharmacyCode=PHARMFLOWS`,
    { headers: { "x-api-key": required("PHARMFLOW_API_KEY") }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error(`partner lookup returned HTTP ${response.status}`);
  const body = await response.json();
  const orders = Array.isArray(body) ? body : Array.isArray(body?.orders) ? body.orders : null;
  if (!orders) throw new Error("partner lookup returned invalid order list");
  return orders.find((order: any) => Number(order.concordiaCareOrderId) === id);
}

/** The sole outbound HTTP dispatcher. Payloads are never logged. */
export const dispatchPartnerOperation: PartnerOutboxDispatcher = async (operation, payload, idempotencyKey) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  let url: string;
  switch (operation) {
    case "concordia_order":
      headers["X-API-KEY"] = required("CONCORDIA_API_KEY");
      url = `${required("CONCORDIA_API_URL")}/api/orders/sync`;
      break;
    case "concordia_refill":
      headers["x-api-key"] = required("CONCORDIA_API_KEY");
      url = `${required("CONCORDIA_API_URL")}/api/external/primerx/refill-request`;
      break;
    case "staff_order":
      headers["X-API-KEY"] = required("CONCORDIA_STAFF_WEBHOOK_KEY");
      url = `${STAFF_BASE_URL}/api/public/webhooks/new-order`;
      break;
    case "staff_checkout":
      headers["X-API-KEY"] = required("CONCORDIA_STAFF_WEBHOOK_KEY");
      url = `${STAFF_BASE_URL}/api/public/orders`;
      if (payload.kind !== STAFF_CHECKOUT_KIND || !payload.request ||
          (payload.request as any).source !== "concordia_care") {
        throw new Error("Invalid Staff checkout provenance");
      }
      break;
    case "pharmflow_rx_order":
      headers["x-api-key"] = required("PHARMFLOW_API_KEY");
      url = `${required("PHARMFLOW_API_URL")}/api/incoming-orders`;
      // A send may have succeeded before its HTTP reply or local commit was
      // lost. Reconcile the immutable order ID before every (re)delivery,
      // including a reclaimed lease whose attempt counter is still zero.
      {
        if (await findPharmFlowOrder(payload)) return {};
      }
      break;
    case "pharmflow_cancel_order": {
      if (payload.status !== "cancelled") throw new Error("invalid cancellation status");
      const remote = await findPharmFlowOrder(payload);
      if (["cancelled", "canceled"].includes(String(remote?.status).toLowerCase())) return {};
      headers["x-api-key"] = required("PHARMFLOW_API_KEY");
      url = `${required("PHARMFLOW_API_URL")}/api/order-status/${encodeURIComponent(String(payload.patientId))}?pharmacyCode=PHARMFLOWS`;
      break;
    }
    case "concordia_patient":
      headers["X-API-KEY"] = required("CONCORDIA_API_KEY");
      url = `${required("CONCORDIA_API_URL")}/api/external/register-patient`;
      break;
    case "pharmflow_patient":
      headers["x-api-key"] = required("PHARMFLOW_API_KEY");
      url = `${required("PHARMFLOW_API_URL")}/api/patient-profile`;
      break;
    case "concordia_medication":
      headers["X-API-KEY"] = required("CONCORDIA_API_KEY");
      url = `${required("CONCORDIA_API_URL")}/api/external/medications`;
      break;
    case "pharmflow_message":
      headers["x-api-key"] = required("PHARMFLOW_API_KEY");
      url = `${required("PHARMFLOW_API_URL")}/api/chat/message`;
      break;
  }
  const response = await fetch(url, {
    method: "POST", headers, body: JSON.stringify(operation === "pharmflow_cancel_order"
      ? { concordiaCareOrderId: payload.concordiaCareOrderId, status: "cancelled" }
      : operation === "staff_checkout" ? payload.request : payload),
    signal: AbortSignal.timeout(8000),
  });
  if (operation === "staff_checkout") {
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json().catch(() => null) : null;
    if (!response.ok) {
      const code = typeof body?.code === "string" ? body.code : body?.error;
      const allowed: Record<number, string[]> = {
        409: ["INSUFFICIENT_STOCK", "PRODUCT_UNAVAILABLE", "PRICE_CHANGED", "PRICE_UNAVAILABLE"],
        400: ["INVALID_ADDRESS"], 401: ["INVALID_SOURCE_KEY"], 403: ["SOURCE_NOT_AUTHORIZED"],
      };
      if (typeof code === "string" && STAFF_CHECKOUT_ERRORS[code] && allowed[response.status]?.includes(code)) {
        return { checkoutStatus: "rejected", checkoutError: code };
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { checkoutStatus: "unconfirmed" };
      }
      throw new Error(`Staff checkout returned HTTP ${response.status}`);
    }
    const input = payload.request as Record<string, unknown>;
    const reference = typeof body?.orderNumber === "string" && body.orderNumber.trim()
      ? body.orderNumber : undefined;
    const staffId = body?.orderId;
    const validId = (typeof staffId === "number" && Number.isSafeInteger(staffId) && staffId > 0) ||
      (typeof staffId === "string" && /^[1-9]\d*$/.test(staffId));
    // 200 duplicates are safe only for this newly namespaced checkout intent,
    // never for the independently identified legacy import operation.
    const committed = response.status === 201 || (response.status === 200 && body?.duplicate === true);
    if (!committed || !reference || !validId ||
        (body?.externalOrderId !== undefined && body.externalOrderId !== input.externalOrderId) ||
        (body?.fulfillmentType !== undefined && body.fulfillmentType !== input.fulfillmentType) ||
        (body?.paymentStatus !== undefined && body.paymentStatus !== "collect_at_counter")) {
      return { checkoutStatus: "unconfirmed" };
    }
    return {
      checkoutStatus: "confirmed", externalReference: reference,
      checkoutReceipt: {
        staffOrderId: String(staffId),
        ...(typeof body?.trackingToken === "string" ? { trackingToken: body.trackingToken } : {}),
        ...(typeof body?.trackingExpiresAt === "string" ? { trackingExpiresAt: body.trackingExpiresAt } : {}),
      },
    };
  }
  if (!response.ok) throw new Error(`partner returned HTTP ${response.status}`);
  if (operation === "pharmflow_message") {
    const expectedId = payload.concordiaCareMessageId;
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json().catch(() => null) : null;
    const receipt = typeof expectedId === "number" ? parsePharmacyReceipt(body, expectedId) : null;
    if (!receipt) {
      // It may already exist remotely. Do not replay a possibly accepted
      // message just to obtain a badge; await a callback/reconciliation.
      throw new UnconfirmedMessageReceiptError("Pharmacy message receipt unconfirmed; reconciliation required");
    }
    return { messageStatus: receipt.status };
  }
  if (operation === "pharmflow_cancel_order") {
    // A 2xx alone is not proof that cancellation was applied to this order.
    // Do not tell the patient it is confirmed until an exact remote match
    // reports cancelled. Eventual visibility is reconciled on the next retry.
    const remote = await findPharmFlowOrder(payload);
    if (!["cancelled", "canceled"].includes(String(remote?.status).toLowerCase())) {
      throw new Error("partner cancellation not yet confirmed");
    }
  }
  if (operation === "staff_order") {
    const body = await response.json().catch(() => null) as any;
    const staffOrderNumber = body?.orderNumber ?? body?.staffOrderNumber ?? body?.id;
    if (staffOrderNumber == null) throw new Error("partner returned invalid success response");
    return { externalReference: String(staffOrderNumber) };
  }
  return {};
};

/** Processes due work without ever logging the payload (which may contain PHI). */
export async function processPartnerOutbox(
  storage: Pick<IStorage, "claimDuePartnerOutbox" | "completePartnerOutboxWithEffects" | "retryPartnerOutbox" | "failPartnerOutbox" | "getOrder" | "withOrderDeliveryLock">,
  dispatch: PartnerOutboxDispatcher,
  limit = 25,
  onRefillDelivered?: (row: PartnerOutbox) => void,
  idempotencyKey?: string,
): Promise<number> {
  const due = await storage.claimDuePartnerOutbox(limit, idempotencyKey);
  let processed = 0;
  for (const row of due) {
    if (!isPartnerOperation(row.operation)) {
      await storage.failPartnerOutbox(row.id, row.leaseToken ?? "", "Unsupported partner operation");
      continue;
    }
    try {
      const staffOrderOperation = row.operation === "staff_order" || row.operation === "staff_checkout";
      const pharmacyOrderOperation = row.operation === "pharmflow_rx_order" || row.operation === "pharmflow_cancel_order";
      const deliver = async (locked: LockedOrderDelivery): Promise<{ committed: boolean; notify?: boolean; failure?: string }> => {
        const payload = row.payload as Record<string, unknown>;
        if (!await locked.ownsPartnerOutboxLease(row.id, row.leaseToken ?? "")) return { committed: false };
        const order = await locked.getOrder(Number(staffOrderOperation ? payload.id : payload.concordiaCareOrderId));
        if (staffOrderOperation) {
          if (!order || order.orderType !== "otc") {
            return { committed: false, failure: "Staff order requires canonical reconciliation" };
          }
          if (row.operation === "staff_checkout") {
            const input = payload.request as Record<string, unknown> | undefined;
            if (!order.staffCheckoutStatus || payload.kind !== STAFF_CHECKOUT_KIND ||
                input?.source !== "concordia_care" || input?.externalOrderId !== checkoutExternalId(order)) {
              return { committed: false, failure: "Staff checkout requires canonical reconciliation" };
            }
            if (order.staffCheckoutStatus === "confirmed") {
              return { committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", {}) };
            }
            if (order.staffCheckoutStatus === "rejected" || ["cancelled", "picked_up", "delivered", "rejected"].includes(order.status ?? "")) {
              return { committed: false, failure: "Staff checkout is no longer active" };
            }
            const result = await dispatch("staff_checkout", payload, row.idempotencyKey);
            return { committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", result) };
          }
          if (payload.source !== "concordia_care") {
            return { committed: false, failure: "Staff order requires canonical reconciliation" };
          }
          if (order.staffPanelOrderNumber) return {
            committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", { externalReference: order.staffPanelOrderNumber }),
          };
          if (["cancelled", "picked_up", "delivered"].includes(order.status ?? "")) {
            return { committed: false, failure: "Staff order is no longer active" };
          }
          const result = await dispatch("staff_order", payload, row.idempotencyKey);
          return { committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", result) };
        }
        const allowedTypes = row.operation === "pharmflow_rx_order" ? ["rx_refill"]
          : ["rx_refill", "blister_pack", "refill", "rx", "prescription", "blister"];
        if (!order || order.userId !== payload.patientId || !allowedTypes.includes(order.orderType)) {
          return { committed: false, failure: "Invalid refill ownership" };
        }
        if (row.operation === "pharmflow_rx_order" && order.pharmFlowSubmitted) {
          return { committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", {}) };
        }
        if (row.operation === "pharmflow_rx_order" && ["cancelled", "picked_up", "delivered"].includes(order.status ?? "")) {
          return { committed: false, failure: "Refill is no longer active" };
        }
        if (row.operation === "pharmflow_cancel_order" && (order.status !== "cancelled" || payload.status !== "cancelled")) {
          return { committed: false, failure: "Invalid cancellation state" };
        }
        const result = await dispatch(row.operation as "pharmflow_rx_order" | "pharmflow_cancel_order", payload, row.idempotencyKey);
        return { committed: await locked.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "", result), notify: true };
      };
      const delivery = pharmacyOrderOperation || staffOrderOperation
        ? await storage.withOrderDeliveryLock(Number(staffOrderOperation ? (row.payload as any).id : (row.payload as any).concordiaCareOrderId), deliver)
        : { committed: await storage.completePartnerOutboxWithEffects(row.id, row.leaseToken ?? "",
          await dispatch(row.operation, row.payload as Record<string, unknown>, row.idempotencyKey)) };
      if ("failure" in delivery && delivery.failure) {
        await storage.failPartnerOutbox(row.id, row.leaseToken ?? "", delivery.failure);
      }
      if (delivery.committed) {
        processed++;
        // Push/email are best-effort after the durable confirmation commits.
        // Their failure must never replay an already accepted pharmacy order.
        if (row.operation === "pharmflow_rx_order" && "notify" in delivery && delivery.notify && onRefillDelivered) {
          try { onRefillDelivered(row); } catch {}
        }
      }
    } catch (error) {
      if (error instanceof UnconfirmedMessageReceiptError) {
        await storage.failPartnerOutbox(row.id, row.leaseToken ?? "", error.message);
      } else {
        await storage.retryPartnerOutbox(row.id, row.leaseToken ?? "", error instanceof Error ? error.message : "dispatch failed");
      }
    }
  }
  return processed;
}