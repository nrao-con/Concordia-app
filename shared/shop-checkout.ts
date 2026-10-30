import { normalizePhone } from "./identity";

/** Contact for this request only; never changes the patient's sign-in identity. */
export function validateShopFulfillment(input: {
  contactPhone?: unknown; deliveryMethod?: unknown; deliveryAddress?: unknown; scheduledPickupTime?: unknown;
}) {
  if (typeof input.contactPhone !== "string" || input.contactPhone.length > 40) {
    throw new Error("Enter a phone number where the pharmacy can reach you.");
  }
  let contactPhone: string;
  try { contactPhone = normalizePhone(input.contactPhone); }
  catch { throw new Error("Enter a valid 10-digit phone number, with an optional +1 country code."); }
  if (input.deliveryMethod !== "pickup" && input.deliveryMethod !== "delivery") {
    throw new Error("Select pickup or delivery.");
  }
  if (input.deliveryMethod === "delivery" &&
      (typeof input.deliveryAddress !== "string" || !input.deliveryAddress.trim())) {
    throw new Error("Enter a delivery address.");
  }
  if (input.deliveryMethod === "pickup" &&
      (typeof input.scheduledPickupTime !== "string" || !input.scheduledPickupTime.trim())) {
    throw new Error("Choose a pickup time.");
  }
  return contactPhone;
}
