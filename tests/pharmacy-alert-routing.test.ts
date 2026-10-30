import { describe, expect, it } from "vitest";
import {
  filterPharmacyAlertsForUser,
  isExplicitBroadcastAlert,
} from "../server/pharmacy-alert-routing";

describe("pharmacy alert account isolation", () => {
  const patient = { id: "patient-123", email: "Patient@Example.com" };

  it("keeps alerts targeted to the effective patient ID", () => {
    const alert = { id: 1, patientId: " patient-123 ", message: "Ready" };
    expect(filterPharmacyAlertsForUser([alert], patient)).toEqual([alert]);
  });

  it("keeps alerts targeted to the effective patient email case-insensitively", () => {
    const alert = { id: 2, patientEmail: "patient@example.COM", message: "Ready" };
    expect(filterPharmacyAlertsForUser([alert], patient)).toEqual([alert]);
  });

  it("excludes alerts targeted to another patient", () => {
    const alert = { id: 3, userId: "different-patient", message: "Private" };
    expect(filterPharmacyAlertsForUser([alert], patient)).toEqual([]);
  });

  it("rejects malformed untargeted alerts instead of broadcasting them", () => {
    const alert = { id: 4, message: "Missing ownership" };
    expect(filterPharmacyAlertsForUser([alert], patient)).toEqual([]);
  });

  it("retains only explicitly marked broadcasts", () => {
    const alerts = [
      { id: 5, broadcast: true },
      { id: 6, audience: "ALL" },
      { id: 7, scope: " broadcast " },
    ];
    expect(alerts.every((alert) => isExplicitBroadcastAlert(alert))).toBe(true);
    expect(filterPharmacyAlertsForUser(alerts, patient)).toEqual(alerts);
  });
});