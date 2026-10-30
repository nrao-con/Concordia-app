import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Order } from "@shared/schema";

function triggerVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
}

const DISMISSED_KEY = (userId: string, patientId: string | null) =>
  `order-pill-dismissed-${userId}-${patientId ?? "self"}`;

function loadDismissed(userId: string, patientId: string | null): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY(userId, patientId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(userId: string, patientId: string | null, ids: Set<number>) {
  try {
    localStorage.setItem(DISMISSED_KEY(userId, patientId), JSON.stringify(Array.from(ids)));
  } catch {}
}

export function OrderStatusPill() {
  const { user } = useAuth();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);

  const [dismissed, setDismissed] = useState<Set<number>>(() =>
    user ? loadDismissed(user.id, activePatientId) : new Set()
  );
  const vibratedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    setDismissed(loadDismissed(user.id, activePatientId));
  }, [user?.id, activePatientId]);

  const ordersUrl = pUrl("/api/orders");
  const { data: orders } = useQuery<Order[]>({
    queryKey: [ordersUrl],
    refetchInterval: 15000,
    enabled: !!user,
  });

  const activeStatuses = ["pending", "preparing", "verified", "ready"];
  const activePickupOrders = (orders ?? []).filter(
    (o) =>
      o.status &&
      activeStatuses.includes(o.status) &&
      !dismissed.has(o.id) &&
      o.deliveryMethod !== "delivery"
  );

  useEffect(() => {
    if (!activePickupOrders.length) return;
    for (const order of activePickupOrders) {
      if (order.status === "ready" && !vibratedRef.current.has(order.id)) {
        vibratedRef.current.add(order.id);
        triggerVibration();
      }
    }
  }, [activePickupOrders]);

  if (activePickupOrders.length === 0) return null;

  const latestOrder = activePickupOrders[0];
  const isReady = latestOrder.status === "ready";

  const handleDismiss = (orderId: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      if (user) saveDismissed(user.id, activePatientId, next);
      return next;
    });
  };

  return (
    <div
      className="fixed bottom-[10.5rem] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md"
      data-testid="pill-order-status"
    >
      <div
          className={`flex items-center gap-3 rounded-md px-4 py-3 shadow-lg border cursor-pointer transition-all ${
            isReady
              ? "bg-green-100/50 dark:bg-green-900/20 text-foreground border-green-200 dark:border-green-800"
              : "bg-card text-card-foreground border-border"
          }`}
          data-testid="pill-order-status-inner"
        >
          <Link href={`/orders/${latestOrder.id}`} className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            isReady ? "bg-white/20" : "bg-primary/10"
          }`}>
            {isReady ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Store className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-base font-semibold truncate" data-testid="text-order-pill-status">
              {isReady
                ? "Order Ready for Pickup!"
                : `Order #${latestOrder.orderNumber ?? latestOrder.id} - ${
                    latestOrder.status === "verified"
                      ? "Verified"
                      : latestOrder.status === "pending"
                        ? "Order Accepted"
                        : "Preparing"
                  }`}
            </span>
            <span className={`text-sm truncate ${isReady ? "text-white/80" : "text-muted-foreground"}`} data-testid="text-order-pill-detail">
              {isReady
                ? `Pickup at ${latestOrder.pickupSlot || "counter"}`
                : latestOrder.estimatedReadyTime
                  ? `Est. ready in ${latestOrder.estimatedReadyTime}`
                  : "Getting your order ready"}
            </span>
          </div>
          {activePickupOrders.length > 1 && (
            <Badge variant="secondary" className="shrink-0 no-default-hover-elevate" data-testid="badge-order-count">
              +{activePickupOrders.length - 1}
            </Badge>
          )}
          <ArrowRight className={`h-4 w-4 shrink-0 ${isReady ? "text-white/70" : "text-muted-foreground"}`} />
          </Link>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={(e) => {
              handleDismiss(latestOrder.id);
            }}
            data-testid="button-dismiss-order-pill"
            aria-label="Dismiss order status"
          >
            <X className="h-4 w-4" />
          </Button>
      </div>
    </div>
  );
}
