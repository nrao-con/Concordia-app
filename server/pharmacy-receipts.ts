import type { RequestHandler } from "express";
import type { IStorage } from "./storage";
import { parsePharmacyReceipt } from "@shared/pharmacy-receipts";

export function createPharmacyReceiptHandler(
  store: Pick<IStorage, "applyPharmacyReceipt">,
  notify: (userId: string, payload: Record<string, unknown>) => void,
): RequestHandler {
  return async (req, res) => {
    const receipt = parsePharmacyReceipt(req.body);
    const patientId = req.body?.patientId;
    if (!receipt || typeof patientId !== "string" || !patientId.trim() || patientId.length > 255) {
      res.status(400).json({ error: "Provide concordiaCareMessageId, patientId and status (received or read)" });
      return;
    }
    try {
      const message = await store.applyPharmacyReceipt(receipt.id, patientId, receipt.status);
      if (!message) {
        res.status(404).json({ error: "Outbound message not found for patient" });
        return;
      }
      try { notify(message.userId, message as unknown as Record<string, unknown>); } catch {}
      res.json({ success: true, concordiaCareMessageId: message.id, status: message.deliveryStatus });
    } catch {
      res.status(500).json({ error: "Failed to record pharmacy receipt" });
    }
  };
}
