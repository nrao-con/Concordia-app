import type { Order, OrderItem, OtcProduct, User } from "@shared/schema";

export function canonicalProductId(product: Pick<OtcProduct, "externalId" | "syncSource" | "staffPanelProductId">) {
  if (product.syncSource !== "staff_panel" || !product.externalId?.startsWith("sp:")) {
    throw new Error("Product lacks a canonical Staff catalog ID");
  }
  const id = product.externalId.slice(3);
  if (!id) throw new Error("Product lacks a canonical Staff catalog ID");
  if (product.staffPanelProductId != null && String(product.staffPanelProductId) === id) return product.staffPanelProductId;
  return id;
}

export function buildStaffOrderPayload(order: Order, items: OrderItem[], products: OtcProduct[], user?: User) {
  if (!order.orderNumber || !order.status || items.length < 1 || items.length > 100) {
    throw new Error("Invalid Staff order");
  }
  if (!order.createdAt || !order.updatedAt) throw new Error("Missing Staff order timestamps");
  const createdAt = new Date(order.createdAt).toISOString();
  const updatedAt = new Date(order.updatedAt).toISOString();
  return {
    id: String(order.id), source: "concordia_care",
    orderNumber: order.orderNumber, status: order.status, createdAt, updatedAt,
    customerName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Patient",
    guestEmail: user?.email ?? undefined, guestPhone: order.contactPhone ?? user?.phone ?? undefined,
    deliveryMethod: order.deliveryMethod ?? "pickup",
    deliveryAddress: order.deliveryMethod === "delivery" ? order.deliveryAddress ?? undefined : undefined,
    scheduledPickupTime: order.deliveryMethod === "pickup" ? order.scheduledPickupTime ?? undefined : undefined,
    orderItems: items.map((item) => {
      const product = products.find((p) => p.id === item.otcProductId);
      if (!product || !Number.isInteger(item.quantity) || item.quantity! < 1 || item.quantity! > 100 ||
          item.unitPrice == null || !String(item.unitPrice).trim() ||
          !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) {
        throw new Error("Invalid Staff order item");
      }
      return {
        id: String(item.id), name: item.productName, quantity: item.quantity,
        price: item.unitPrice, concordiaProductId: canonicalProductId(product),
      };
    }),
  };
}
