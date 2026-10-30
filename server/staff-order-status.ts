import type { RequestHandler } from "express";
import type { IStorage } from "./storage";
import { mapStaffPanelOrderStatus, OrderCancellationError } from "./sync-reliability";

export function createStaffOrderStatusHandler(
  store: Pick<IStorage, "applyStaffOrderStatus">,
  notify: (userId: string, payload: Record<string, unknown>) => void,
): RequestHandler {
  return async (req, res) => {
    const rawId = String(req.params.externalOrderId ?? "");
    const id = Number(rawId);
    const appStatus = req.body?.appStatus;
    // Unlike the legacy Staff polling status, this contract explicitly carries
    // an app status, so delivered/verified/pending are unambiguous here.
    const status = typeof appStatus !== "string" ? null
      : ["pending", "received", "preparing", "verified", "ready", "picked_up", "delivered", "cancelled"].includes(appStatus)
        ? appStatus : mapStaffPanelOrderStatus(appStatus);
    const staffNumber = req.body?.concordiaOrderNumber;
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id) || !status ||
        typeof staffNumber !== "string" || !staffNumber.trim() || staffNumber.length > 128) {
      res.status(400).json({ error: "Invalid external order ID, appStatus or concordiaOrderNumber" });
      return;
    }
    try {
      const order = await store.applyStaffOrderStatus(id, status, staffNumber.trim());
      try { notify(order.userId, { orderId: order.id, status: order.status, kind: "order_status_changed" }); } catch {}
      res.json({ success: true, id: order.id, status: order.status, concordiaOrderNumber: order.staffPanelOrderNumber });
    } catch (error) {
      res.status(error instanceof OrderCancellationError ? error.statusCode : 500)
        .json({ error: error instanceof OrderCancellationError ? error.message : "Failed to apply Staff status" });
    }
  };
}
