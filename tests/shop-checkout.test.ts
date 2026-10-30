import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateShopFulfillment } from "../shared/shop-checkout";

const pickup = { deliveryMethod: "pickup", scheduledPickupTime: "Tomorrow, 10:00 AM", contactPhone: "(212) 555-0123" };
describe("phone-required pickup and delivery requests", () => {
  it("normalizes a callback number for pickup without requiring a delivery address", () => {
    expect(validateShopFulfillment(pickup)).toBe("+12125550123");
  });
  it("supports delivery with an address and a callback number", () => {
    expect(validateShopFulfillment({ contactPhone: "+1 212-555-0123", deliveryMethod: "delivery",
      deliveryAddress: "Isolated fixture address" })).toBe("+12125550123");
  });
  it.each([undefined, null, "", " ", "555", "call me", 2125550123, "+44 20 1234 5678"])(
    "rejects missing or malformed callback number %j for both methods", (contactPhone) => {
      expect(() => validateShopFulfillment({ ...pickup, contactPhone })).toThrow();
      expect(() => validateShopFulfillment({ deliveryMethod: "delivery", deliveryAddress: "Fixture", contactPhone })).toThrow();
    });
  it("requires an actual pickup time or delivery address and only allows these two methods", () => {
    expect(() => validateShopFulfillment({ ...pickup, scheduledPickupTime: " " })).toThrow("pickup time");
    expect(() => validateShopFulfillment({ ...pickup, deliveryMethod: "delivery", deliveryAddress: " " })).toThrow("delivery address");
    expect(() => validateShopFulfillment({ ...pickup, deliveryMethod: "shipping" })).toThrow("pickup or delivery");
  });
  it("validates on the server before saving any new OTC order, while allowing idempotent replay", () => {
    const routes = readFileSync("server/routes.ts", "utf8");
    const start = routes.indexOf('app.post("/api/orders",');
    const handler = routes.slice(start, routes.indexOf("\n  app.", start + 1));
    const validate = handler.indexOf("orderData.contactPhone = validateShopFulfillment(orderData)");
    expect(validate).toBeGreaterThan(handler.indexOf("if (existingOrder.rows[0])"));
    expect(validate).toBeLessThan(handler.indexOf("await storage.createOrderWithItems"));
    expect(handler).toContain('error: "invalid_fulfillment_contact"');
  });
  it("requires the same validated phone in the UI and preserves request-only language", () => {
    const cart = readFileSync("client/src/pages/cart.tsx", "utf8");
    expect(cart).toContain("contactPhone: normalizedPhone");
    expect(cart).toContain("!canProceedToPayment");
    expect(cart).toContain("input-order-contact-phone");
    expect(cart).toContain("Review request");
    expect(cart).toContain("No payment will be charged in this app");
    expect(cart).not.toContain('t("cart.completeYourPurchase")');
  });
});
