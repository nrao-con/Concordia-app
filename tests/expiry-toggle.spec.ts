/**
 * End-to-end tests for the expiry date tap-to-toggle on home screen
 * pharmacy alert cards.
 *
 * Each alert card displays a relative countdown label ("Expires in 1 day")
 * when the notification is close to its retention expiry.  Tapping that label
 * expands it to an absolute date string ("Expires on June 16, 2026") and a
 * second tap collapses it back.
 *
 * Strategy
 * --------
 * All API endpoints are intercepted via Playwright's page.route() so the test
 * runs without real authentication or an external Concordia pharmacy service.
 *
 * IMPORTANT: Playwright evaluates page.route() handlers in LIFO order
 * (last-registered handler wins).  The catch-all "*‍/api/**" must therefore be
 * registered FIRST so that more-specific handlers registered afterwards
 * override it.
 *
 * Data setup:
 *   - /api/pharmacy-alerts  → one alert whose message matches the seeded notif
 *   - /api/notifications    → one pharmacy_alert notification created 6 days
 *                             ago (with retentionDays=7, that leaves 1 day,
 *                             which is ≤ NEAR_EXPIRY_THRESHOLD_DAYS=2, so the
 *                             expiry label is rendered)
 *   - /api/push-config      → retentionDays: 7
 *   - All other /api/*      → benign empty-array responses
 *
 * Selector:  data-testid="text-alert-expiry-{idx}"
 * Source:    client/src/pages/home.tsx ~line 749
 */

import { test, expect, type Page } from "@playwright/test";

const ALERT_MESSAGE = "Your medication refill is ready for pickup";
const RETENTION_DAYS = 7;
const DAYS_OLD = RETENTION_DAYS - 1; // 6 days old → 1 day remaining

function nearExpiryNotification() {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - DAYS_OLD);
  return {
    id: 99901,
    userId: "test-user-expiry-e2e",
    type: "pharmacy_alert",
    title: "Test Pharmacy Alert",
    message: ALERT_MESSAGE,
    createdAt: createdAt.toISOString(),
    isRead: false,
    actionUrl: null,
    relatedOrderId: null,
    relatedMedicationId: null,
  };
}

async function setupMocks(page: Page): Promise<void> {
  // ── Catch-all registered FIRST — Playwright uses LIFO, so specific routes
  //    registered after this will take precedence over it.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  // ── Specific overrides (registered last → matched first in LIFO order) ──

  await page.route("**/api/auth/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-expiry-e2e",
        email: "expiry-e2e@example.com",
        firstName: "Test",
        lastName: "Patient",
        profileImageUrl: null,
        phone: null,
        dateOfBirth: null,
        deliveryAddress: null,
        preferredDeliveryMethod: "pickup",
        userRole: "patient",
        onboardingComplete: true,
        lastPharmacySyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        language: null,
      }),
    })
  );

  await page.route("**/api/pharmacy-alerts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "test-alert-expiry-e2e-1",
          title: "Medication Ready",
          message: ALERT_MESSAGE,
          type: "pharmacy",
          severity: "high",
        },
      ]),
    })
  );

  await page.route("**/api/notifications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([nearExpiryNotification()]),
    })
  );

  await page.route("**/api/push-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pharmacyAlert: {
          retentionDays: RETENTION_DAYS,
          urgent: { vibrate: [300, 100, 300], requireInteraction: true },
          high: { vibrate: [200, 100, 200], requireInteraction: true },
          info: { vibrate: [200, 100, 200], requireInteraction: false },
        },
        isAdmin: false,
      }),
    })
  );

  await page.route("**/api/notification-preferences", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pharmacyAlertsEnabled: true,
        pharmacyAlertMinSeverity: "all",
        snoozeUntilAt: null,
        inactivityThresholdHours: 24,
      }),
    })
  );

  await page.route("**/api/loyalty", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ balance: 0, tier: "bronze", streakDays: 0 }),
    })
  );

  await page.route("**/api/patient-insights", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ insights: [], tips: [] }),
    })
  );
}

test.describe("Home screen expiry date tap-to-toggle", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/");
    // Wait until the network is quiet, then give the expiry button time to render.
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="text-alert-expiry-0"]', {
      timeout: 15_000,
    });
  });

  test("relative expiry label is visible by default", async ({ page }) => {
    const expiryBtn = page.getByTestId("text-alert-expiry-0");

    await expect(expiryBtn).toBeVisible();

    const labelText = await expiryBtn.textContent();
    expect(labelText).toBeTruthy();
    // The relative label does not contain a 4-digit year like "2026"
    expect(labelText).not.toMatch(/\b\d{4}\b/);
  });

  test("tapping expiry label switches to absolute date string", async ({ page }) => {
    const expiryBtn = page.getByTestId("text-alert-expiry-0");
    await expect(expiryBtn).toBeVisible();

    const relativeText = await expiryBtn.textContent();

    await expiryBtn.click();

    const expandedText = await expiryBtn.textContent();
    // Text must have changed
    expect(expandedText).not.toBe(relativeText);
    // Absolute date contains a 4-digit year
    expect(expandedText).toMatch(/\b\d{4}\b/);
  });

  test("tapping expanded label restores the relative label", async ({ page }) => {
    const expiryBtn = page.getByTestId("text-alert-expiry-0");
    await expect(expiryBtn).toBeVisible();

    const originalText = await expiryBtn.textContent();

    // First tap — expand to absolute date
    await expiryBtn.click();
    const expandedText = await expiryBtn.textContent();
    expect(expandedText).not.toBe(originalText);

    // Second tap — collapse back to relative label
    await expiryBtn.click();
    const restoredText = await expiryBtn.textContent();
    expect(restoredText).toBe(originalText);
  });
});
