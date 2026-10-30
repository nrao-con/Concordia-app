import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, clearIdempotencyKey, getIdempotencyKey, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { getDateLocale } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import {
  Package,
  Check,
  Clock,
  Store,
  Truck,
  Trash2,
  ShoppingCart,
  ChevronRight,
  Pill,
  X,
  History,
  CheckCheck,
} from "lucide-react";
import { PackageDelivery } from "@/components/illustrations";
import type { Order } from "@shared/schema";

const ACTIVE_STATUSES = ["pending", "received", "preparing", "verified", "ready"];
const TERMINAL_STATUSES = ["picked_up", "delivered", "cancelled"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function useFriendlyOrderType() {
  const { t } = useTranslation();
  return (type: string | null): string => {
    switch (type) {
      case "otc": return t("orders.otcOrder");
      case "rx_refill": return t("orders.rxRefill");
      case "blister_pack": return t("orders.blisterPack");
      default: return type?.replace(/_/g, " ") || t("orders.order");
    }
  };
}

function useStatusLabel() {
  const { t } = useTranslation();
  return (status: string | null): string => {
    switch (status) {
      case "pending":
      case "received": return t("orders.received");
      case "preparing": return t("orders.preparing");
      case "verified": return t("orders.verified");
      case "ready": return t("orders.ready");
      case "picked_up": return t("orders.pickedUp");
      case "delivered": return t("orders.delivered");
      case "cancelled": return t("orders.cancelled");
      default: return status || t("orders.unknown");
    }
  };
}

function statusColor(status: string | null): string {
  switch (status) {
    case "ready": return "bg-green-100/50 dark:bg-green-900/20 text-green-600 dark:text-green-400";
    case "verified": return "bg-primary/15 text-primary";
    case "preparing": return "bg-orange-100/50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400";
    case "pending":
    case "received": return "bg-muted text-muted-foreground";
    case "picked_up":
    case "delivered": return "bg-muted text-muted-foreground";
    case "cancelled": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

function TypeBadge({ type }: { type: string | null }) {
  if (type === "otc") {
    return (
      <Badge
        variant="outline"
        className="text-xs font-normal shrink-0 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
        data-testid="badge-order-type-otc"
      >
        OTC
      </Badge>
    );
  }
  if (type === "rx_refill") {
    return (
      <Badge
        variant="outline"
        className="text-xs font-normal shrink-0 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300"
        data-testid="badge-order-type-rx"
      >
        RX
      </Badge>
    );
  }
  if (type === "blister_pack") {
    return (
      <Badge
        variant="outline"
        className="text-xs font-normal shrink-0 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
        data-testid="badge-order-type-blister"
      >
        Blister
      </Badge>
    );
  }
  return null;
}

function CartSection() {
  const { t } = useTranslation();
  const { cart, totalItems, totalPrice, removeFromCart } = useCart();

  if (totalItems === 0) return null;

  return (
    <div data-testid="section-cart">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-border" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5" />
          {t("orders.cart") || "Cart"}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card className="glass-card" data-testid="card-cart-summary">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-2">
            {cart.map((item) => (
              <div
                key={item.otcProductId}
                className="flex items-center justify-between gap-3"
                data-testid={`row-cart-item-${item.otcProductId}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-cart-item-name-${item.otcProductId}`}>
                    {item.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {item.price ? `$${parseFloat(item.price).toFixed(2)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.price && (
                    <span className="text-sm font-semibold" data-testid={`text-cart-item-total-${item.otcProductId}`}>
                      ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => removeFromCart(item.otcProductId)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    data-testid={`button-remove-cart-item-${item.otcProductId}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 pt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{totalItems} {totalItems === 1 ? t("common.item") : t("common.items")}</p>
              <p className="text-base font-bold" data-testid="text-cart-total">${totalPrice.toFixed(2)}</p>
            </div>
            <Link href="/cart">
              <Button className="gap-2" data-testid="button-go-to-cart">
                <ShoppingCart className="h-4 w-4" />
                {t("orders.viewCart") || "View Cart"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActiveOrdersSection({ orders, pUrl }: { orders: Order[]; pUrl: (base: string) => string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const friendlyOrderType = useFriendlyOrderType();
  const statusLabel = useStatusLabel();
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  const [pickupConfirmId, setPickupConfirmId] = useState<number | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest("PATCH", pUrl(`/api/orders/${orderId}/status`), { status: "cancelled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      setCancelConfirmId(null);
      toast({ title: t("orders.orderCancelled") || "Order cancelled", description: t("orders.orderCancelledDesc") || "Your order has been cancelled." });
    },
    onError: (err: Error) => {
      setCancelConfirmId(null);
      const msg = err.message || t("orders.cancelFailed") || "Unable to cancel this order.";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    },
  });

  const markPickedUpMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest(
      "PATCH",
      pUrl(`/api/orders/${orderId}/status`),
      { status: "picked_up" },
      { "Idempotency-Key": getIdempotencyKey(`order-pickup-status:${orderId}`) },
    ),
    onSuccess: (_data, orderId) => {
      clearIdempotencyKey(`order-pickup-status:${orderId}`);
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      setPickupConfirmId(null);
      toast({
        title: t("orders.orderMarkedPickedUp") || "Order marked as picked up",
        description: t("orders.orderMarkedPickedUpDesc") || "Your order has been moved to past orders.",
      });
    },
    onError: (err: Error) => {
      setPickupConfirmId(null);
      const msg = err.message || t("orders.markPickedUpFailed") || "Unable to update this order.";
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
    },
  });

  const CANCELLABLE = ["pending", "received", "preparing"];
  const DISMISSABLE = ["ready"];

  if (orders.length === 0) return null;

  return (
    <div data-testid="section-active-orders">
      <div className="space-y-2">
        {orders.map((order, i) => {
          const canCancel = order.status ? CANCELLABLE.includes(order.status) : false;
          const canDismiss = order.status ? DISMISSABLE.includes(order.status) : false;
          const isConfirmingCancel = cancelConfirmId === order.id;
          const isConfirmingPickup = pickupConfirmId === order.id;
          const isTerminal = order.status ? TERMINAL_STATUSES.includes(order.status) : false;
          const showActions = canCancel || canDismiss;
          return (
            <Card
              key={order.id}
              className={`glass-card animate-drift-up-${Math.min(i + 1, 8)}`}
              data-testid={`card-active-order-${order.id}`}
            >
              <CardContent className="p-4 space-y-3">
                <Link href={`/orders/${order.id}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isTerminal ? "bg-muted/50" : "bg-primary/10"}`}>
                        {order.deliveryMethod === "delivery" ? (
                          <Truck className={`h-5 w-5 ${isTerminal ? "text-muted-foreground" : "text-primary"}`} />
                        ) : order.orderType === "rx_refill" || order.orderType === "blister_pack" ? (
                          <Pill className={`h-5 w-5 ${isTerminal ? "text-muted-foreground" : "text-primary"}`} />
                        ) : (
                          <Store className={`h-5 w-5 ${isTerminal ? "text-muted-foreground" : "text-primary"}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">
                            {friendlyOrderType(order.orderType)}
                          </p>
                          <TypeBadge type={order.orderType} />
                          {(order as any).pharmFlowSubmitted && (order.orderType === "rx_refill" || order.orderType === "blister_pack") && (
                            <Badge
                              variant="outline"
                              className="text-xs font-normal shrink-0 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                              data-testid={`badge-sent-to-pharmacy-${order.id}`}
                            >
                              {t("orders.sentToPharmacy")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono text-primary" data-testid={`text-order-number-${order.id}`}>
                            {(order as any).orderNumber || `#${order.id}`}
                          </span>
                          {" · "}{order.totalItems} {(order.totalItems ?? 0) !== 1 ? t("common.items") : t("common.item")}
                          {(order as any).scheduledPickupTime
                            ? ` · ${t("orders.pickup")}: ${(order as any).scheduledPickupTime}`
                            : order.estimatedReadyTime && !isTerminal
                            ? ` · ${t("orders.est")} ${order.estimatedReadyTime}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={statusColor(order.status)}>
                      {statusLabel(order.status)}
                    </Badge>
                  </div>
                </Link>

                {showActions && !isConfirmingCancel && !isConfirmingPickup && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
                    {canDismiss && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPickupConfirmId(order.id)}
                        data-testid={`button-mark-picked-up-${order.id}`}
                      >
                        <CheckCheck className="h-3 w-3 mr-1" />
                        {t("orders.markAsPickedUp") || "Mark as Picked Up"}
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCancelConfirmId(order.id)}
                        data-testid={`button-cancel-order-${order.id}`}
                      >
                        <X className="h-3 w-3 mr-1" />
                        {t("orders.cancelOrder") || "Cancel order"}
                      </Button>
                    )}
                  </div>
                )}

                {isConfirmingPickup && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <p className="text-sm font-medium">{t("orders.confirmMarkPickedUp") || "Mark this order as picked up?"}</p>
                    <p className="text-xs text-muted-foreground">{t("orders.confirmMarkPickedUpDesc") || "Use this if you collected your order in person and the app did not update automatically."}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs"
                        onClick={() => markPickedUpMutation.mutate(order.id)}
                        disabled={markPickedUpMutation.isPending}
                        data-testid={`button-confirm-mark-picked-up-${order.id}`}
                      >
                        <CheckCheck className="h-3 w-3 mr-1" />
                        {markPickedUpMutation.isPending ? t("common.loading") || "..." : t("orders.yesMarkPickedUp") || "Yes, Mark as Picked Up"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setPickupConfirmId(null)}
                        disabled={markPickedUpMutation.isPending}
                        data-testid={`button-cancel-mark-picked-up-${order.id}`}
                      >
                        {t("common.cancel") || "Cancel"}
                      </Button>
                    </div>
                  </div>
                )}

                {isConfirmingCancel && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <p className="text-sm text-muted-foreground flex-1">{t("orders.confirmCancel") || "Cancel this order?"}</p>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={() => cancelMutation.mutate(order.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`button-confirm-cancel-${order.id}`}
                    >
                      {cancelMutation.isPending ? t("common.loading") || "..." : t("orders.yesCancel") || "Yes, cancel"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setCancelConfirmId(null)}
                      disabled={cancelMutation.isPending}
                      data-testid={`button-keep-order-${order.id}`}
                    >
                      {t("orders.keepOrder") || "Keep"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PastOrdersSection({
  orders,
  onClear,
  isClearing,
}: {
  orders: Order[];
  onClear: () => Promise<void>;
  isClearing: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const friendlyOrderType = useFriendlyOrderType();
  const statusLabel = useStatusLabel();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (orders.length === 0) return null;

  return (
    <div data-testid="section-past-orders">
      <div className="space-y-2">
        {orders.slice(0, 10).map((order, i) => (
          <Link key={order.id} href={`/orders/${order.id}`}>
            <Card
              className={`glass-card hover-elevate active-elevate-2 cursor-pointer animate-drift-up-${Math.min(i + 1, 8)}`}
              data-testid={`card-past-order-${order.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {friendlyOrderType(order.orderType)}
                        </p>
                        <TypeBadge type={order.orderType} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
                          : ""}
                        {" · "}{order.totalItems} {(order.totalItems ?? 0) !== 1 ? t("common.items") : t("common.item")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={statusColor(order.status)}>
                    {statusLabel(order.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        {!showClearConfirm ? (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={isClearing}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            data-testid="button-clear-history"
          >
            <Trash2 className="h-3 w-3" />
            {t("orders.clearAll")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("orders.clearAllPastOrders")}</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-xs h-7 px-3"
              onClick={async () => {
                try {
                  await onClear();
                  setShowClearConfirm(false);
                } catch {
                  // The mutation displays a clear, senior-friendly error message.
                }
              }}
              disabled={isClearing}
              data-testid="button-confirm-clear-history"
            >
              {isClearing ? t("common.clearing") : t("orders.yesClearAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setShowClearConfirm(false)}
              disabled={isClearing}
              data-testid="button-cancel-clear-history"
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Orders() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const { totalItems: cartItems } = useCart();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);

  const [activeTab, setActiveTab] = useState<"active" | "past">(() => {
    try {
      return (sessionStorage.getItem("orders-tab") as "active" | "past") || "active";
    } catch {
      return "active";
    }
  });

  const handleTabChange = (tab: "active" | "past") => {
    setActiveTab(tab);
    try { sessionStorage.setItem("orders-tab", tab); } catch {}
  };

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: [pUrl("/api/orders")],
    refetchInterval: 10000,
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", pUrl("/api/orders/history")),
    onSuccess: async (res) => {
      const data = res.status === 204 ? null : await res.json();
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      toast({
        title: t("orders.historyCleared"),
        description: data && typeof data.deleted === "number"
          ? `${data.deleted} ${t("orders.pastOrdersRemoved")}`
          : t("orders.pastOrdersRemoved"),
      });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("orders.failedClearHistory"), variant: "destructive" });
    },
  });

  const now = Date.now();

  const activeOrders = (orders ?? []).filter((o) => {
    if (!o.status) return false;
    // Terminal orders (picked_up, delivered, cancelled) always go to Past immediately
    if (TERMINAL_STATUSES.includes(o.status)) return false;
    if (ACTIVE_STATUSES.includes(o.status)) {
      // Age out non-terminal orders stuck for more than 30 days
      const orderAge = now - new Date(o.updatedAt ?? o.createdAt ?? 0).getTime();
      return orderAge < THIRTY_DAYS_MS;
    }
    return false;
  });

  const pastOrders = (orders ?? []).filter((o) => {
    if (!o.status) return false;
    // Terminal orders always appear in Past
    if (TERMINAL_STATUSES.includes(o.status)) return true;
    // Non-terminal orders older than 30 days also move to Past
    const orderAge = now - new Date(o.updatedAt ?? o.createdAt ?? 0).getTime();
    return ACTIVE_STATUSES.includes(o.status) && orderAge >= THIRTY_DAYS_MS;
  });

  const hasAnyOrders = activeOrders.length > 0 || pastOrders.length > 0;
  const hasNothing = !isLoading && cartItems === 0 && !hasAnyOrders;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 flex flex-col h-full space-y-4" data-testid="orders-page">
      <CartSection />

      {!isLoading && hasAnyOrders && (
        <div className="flex border border-border/50 rounded-lg p-1 bg-muted/30" data-testid="tabs-orders">
          <button
            onClick={() => handleTabChange("active")}
            className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === "active"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-active-orders"
          >
            <span className="flex items-center justify-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Active
              {activeOrders.length > 0 && (
                <span className="bg-primary/15 text-primary text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {activeOrders.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => handleTabChange("past")}
            className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === "past"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-past-orders"
          >
            <span className="flex items-center justify-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Past Orders
              {pastOrders.length > 0 && (
                <span className="bg-muted text-muted-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {pastOrders.length}
                </span>
              )}
            </span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : hasAnyOrders ? (
        <div className="space-y-2">
          {activeTab === "active" ? (
            activeOrders.length > 0 ? (
              <ActiveOrdersSection orders={activeOrders} pUrl={pUrl} />
            ) : (
              <div className="py-10 text-center space-y-2" data-testid="empty-active-orders">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No active orders right now</p>
                {pastOrders.length > 0 && (
                  <button
                    onClick={() => handleTabChange("past")}
                    className="text-sm text-primary underline"
                    data-testid="button-switch-to-past"
                  >
                    View past orders
                  </button>
                )}
              </div>
            )
          ) : (
            pastOrders.length > 0 ? (
              <PastOrdersSection
                orders={pastOrders}
                onClear={async () => {
                  await clearHistoryMutation.mutateAsync();
                }}
                isClearing={clearHistoryMutation.isPending}
              />
            ) : (
              <div className="py-10 text-center space-y-2" data-testid="empty-past-orders">
                <Package className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No past orders older than 30 days</p>
              </div>
            )
          )}
        </div>
      ) : null}

      {hasNothing && (
        <div
          className="flex flex-col items-center justify-center space-y-4 animate-fade-in"
          style={{ height: "calc(100dvh - 8rem)" }}
          data-testid="card-empty-orders"
        >
          <PackageDelivery className="w-16 h-16 opacity-70" />
          <div className="text-center space-y-1">
            <p className="text-base font-semibold">{t("orders.noOrdersYet") || "No orders yet"}</p>
            <p className="text-sm text-muted-foreground">
              {t("orders.shopToPlaceOrder") || "Visit the Shop to place your first order."}
            </p>
          </div>
          <Link href="/shop">
            <Button variant="outline" className="gap-2" data-testid="button-go-to-shop">
              <Store className="h-4 w-4" />
              {t("orders.goToShop") || "Go to Shop"}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
