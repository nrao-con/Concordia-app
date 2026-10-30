import type { Order } from "@shared/schema";

export function StaffSubmissionStatus({ order }: { order: Pick<Order, "orderType" | "staffPanelOrderNumber" | "status"> }) {
  if (order.orderType !== "otc") return null;
  return <div role="status" className="rounded-lg border p-3 text-sm" data-testid="staff-submission-status">
    {order.staffPanelOrderNumber
      ? `Staff receipt: ${order.staffPanelOrderNumber}. A receipt confirms intake, not payment or stock reservation.`
      : "Staff delivery is unconfirmed. Your request may still be waiting or need pharmacy help; do not submit it again."}
    {order.status === "cancelled" && " Cancellation is recorded in the app. Contact the pharmacy to confirm cancellation or any refund; automatic restocking is not confirmed."}
  </div>;
}
