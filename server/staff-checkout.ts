import type { Order, OrderItem, OtcProduct, User } from "@shared/schema";
import { canonicalProductId } from "./staff-orders";
import { validateShopFulfillment } from "@shared/shop-checkout";

export const STAFF_CHECKOUT_KIND = "care_catalog_checkout_v1";
export const checkoutExternalId = (order: Pick<Order, "orderNumber">) => {
  if (!order.orderNumber) throw new Error("Missing immutable checkout identity");
  // A new namespace, never used by legacy webhook imports.
  return `care-checkout:${order.orderNumber}`;
};

export function buildStaffCheckoutPayload(order: Order, items: OrderItem[], products: OtcProduct[], user?: User) {
  const phone = validateShopFulfillment(order);
  if (order.orderType !== "otc" || !items.length || items.length > 100) throw new Error("Invalid catalog checkout");
  const grouped = new Map<number, { productId: number; quantity: number; unitPrice: number }>();
  for (const item of items) {
    const product = products.find(p => p.id === item.otcProductId);
    const id = product ? Number(canonicalProductId(product)) : NaN;
    const price = item.unitPrice == null || !String(item.unitPrice).trim() ? NaN : Number(item.unitPrice);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(item.quantity) ||
        item.quantity! < 1 || item.quantity! > 100 || !Number.isFinite(price) || price < 0) {
      throw new Error("Invalid Staff checkout catalog line");
    }
    const previous = grouped.get(id);
    if (previous && previous.unitPrice !== price) throw new Error("Conflicting catalog line prices");
    const quantity = (previous?.quantity ?? 0) + item.quantity!;
    if (quantity > 100) throw new Error("Invalid Staff checkout quantity");
    grouped.set(id, { productId: id, quantity, unitPrice: price });
  }
  return {
    kind: STAFF_CHECKOUT_KIND, id: String(order.id),
    request: {
      customerName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Patient",
      customerPhone: phone,
      fulfillmentType: order.deliveryMethod,
      ...(order.deliveryMethod === "delivery" ? { deliveryAddress: order.deliveryAddress } : {}),
      paymentStatus: "collect_at_counter",
      source: "concordia_care",
      externalOrderId: checkoutExternalId(order),
      items: [...grouped.values()],
    },
  };
}

export const STAFF_CHECKOUT_ERRORS: Record<string, string> = {
  INSUFFICIENT_STOCK: "Staff could not reserve that quantity. Refresh your cart and choose an available quantity.",
  PRODUCT_UNAVAILABLE: "An item is no longer available. Refresh your cart before submitting again.",
  PRICE_CHANGED: "The price changed. Review the updated cart and agree to the new price before submitting again.",
  PRICE_UNAVAILABLE: "The pharmacy must confirm an item's price before checkout.",
  INVALID_ADDRESS: "Staff requires a valid delivery address.",
  INVALID_SOURCE_KEY: "The pharmacy checkout connection needs attention. Contact the pharmacy.",
  SOURCE_NOT_AUTHORIZED: "The pharmacy checkout connection needs attention. Contact the pharmacy.",
};
