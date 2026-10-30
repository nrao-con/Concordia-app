import type { RequestHandler } from "express";
import type { IStorage } from "./storage";

type FullSyncStorage = Pick<IStorage, "getAllUsers" | "getOtcProducts">;
type PharmFlowConfig = { baseUrl: string; apiKey: string } | null;

// Full sync refreshes profiles, never reconstructs order submissions from history.
// New orders and their retries belong exclusively to the durable delivery queue.
export function createFullSyncHandler(
  store: FullSyncStorage,
  getConfig: () => PharmFlowConfig,
  transport: typeof fetch = fetch,
): RequestHandler {
  return async (_req, res) => {
    const results = { patients: 0, orders: 0, products: 0, errors: [] as string[] };
    let patientsSkipped = 0;
    try {
      const config = getConfig();
      if (!config) {
        res.status(503).json({ error: "PharmFlow not configured" });
        return;
      }
      const headers = { "Content-Type": "application/json", "x-api-key": config.apiKey };
      const allUsers = await store.getAllUsers();
      for (const user of allUsers) {
        // A signed-in account alone is not authorization to export a patient.
        if (user.identityTrustStatus !== "verified" || user.identityReviewRequired ||
            user.userRole !== "patient" || !user.pharmacyPatientId) {
          patientsSkipped++;
          continue;
        }
        const patientName = [user.firstName, user.lastName].filter(Boolean).join(" ")
          .replace(/[^a-zA-Z\s]/g, "").trim();
        if (!patientName) {
          patientsSkipped++;
          continue;
        }
        let formattedDOB = "";
        if (user.dateOfBirth && user.dateOfBirth.trim()) {
          const parts = user.dateOfBirth.trim().split("T")[0].split("-");
          if (parts.length === 3 && parts[0].length === 4) {
            formattedDOB = `${parts[1]}/${parts[2]}/${parts[0]}`;
          }
        }
        try {
          const response = await transport(`${config.baseUrl}/api/patient-profile`, {
            method: "POST", headers,
            body: JSON.stringify({
              concordiaCareUserId: user.id,
              patientName,
              dateOfBirth: formattedDOB,
              phone: user.phone || "",
              email: user.email || "",
              deliveryAddress: user.deliveryAddress || "",
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) results.patients++;
          else results.errors.push(`Patient profile: HTTP ${response.status}`);
        } catch {
          // Partner errors may contain profile data or credentials.
          results.errors.push("Patient profile: delivery unavailable");
        }
      }
      results.products = (await store.getOtcProducts()).length;
      res.json({
        success: true,
        synced: {
          patients: results.patients,
          // Keep the existing response contract without claiming queue acceptance.
          ordersToPharmFlow: results.orders,
          productsAvailable: results.products,
        },
        patientsSkipped,
        orderDelivery: "durable_queue",
        errors: results.errors.length > 0 ? results.errors : undefined,
      });
    } catch {
      res.status(500).json({ error: "Full sync failed", partial: results });
    }
  };
}
