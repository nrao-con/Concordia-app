export interface PharmacyAlertRecipient {
  id: string;
  email?: string | null;
}

export function isExplicitBroadcastAlert(alert: Record<string, unknown>): boolean {
  return alert.broadcast === true ||
    String(alert.audience ?? "").trim().toLowerCase() === "all" ||
    String(alert.scope ?? "").trim().toLowerCase() === "broadcast";
}

export function filterPharmacyAlertsForUser(
  alerts: unknown[],
  user: PharmacyAlertRecipient,
): unknown[] {
  const userId = user.id.trim();
  const userEmail = user.email?.trim().toLowerCase();

  return alerts.filter((alert) => {
    if (!alert || typeof alert !== "object") return false;
    const item = alert as Record<string, unknown>;
    const idTargets = ["concordiaCareUserId", "userId", "patientId"]
      .map((field) => item[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
    const emailTargets = ["email", "patientEmail"]
      .map((field) => item[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");

    if (idTargets.length === 0 && emailTargets.length === 0) {
      return isExplicitBroadcastAlert(item);
    }
    if (idTargets.some((value) => String(value).trim() === userId)) return true;
    return !!userEmail &&
      emailTargets.some((value) => String(value).trim().toLowerCase() === userEmail);
  });
}