import { useState, useEffect, useRef, useCallback } from "react";
import { useInventoryState } from "@/hooks/use-staff-panel-sse";
import { requestInventoryRefresh } from "@/lib/inventory-sync";
import { validateShopFulfillment } from "@shared/shop-checkout";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, clearIdempotencyKey, getIdempotencyKey, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  MapPin,
  Store,
  Truck,
  Check,
  ArrowLeft,
  ShoppingBag,
  Phone,
  Wallet,
  Gift,
  ChevronRight,
  Shield,
  Clock,
  Hash,
  BadgeCheck,
  Pill,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { OtcProduct, Order, Medication } from "@shared/schema";

type DeliveryMethod = "pickup" | "delivery";
type CheckoutStep = "cart" | "delivery" | "payment";
type StaffCheckoutErrorCode =
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "PRICE_UNAVAILABLE"
  | "INVALID_ADDRESS"
  | "INVALID_SOURCE_KEY"
  | "SOURCE_NOT_AUTHORIZED";
type StaffCheckoutOrder = Order & {
  staffCheckoutStatus?: "pending" | "confirmed" | "rejected" | "unconfirmed" | null;
  staffCheckoutError?: StaffCheckoutErrorCode | null;
};

const STAFF_CHECKOUT_ERROR_MESSAGES: Record<StaffCheckoutErrorCode, string> = {
  INSUFFICIENT_STOCK: "There is not enough stock for one or more items. Review availability before submitting again.",
  PRODUCT_UNAVAILABLE: "One or more items are no longer available. Review your cart before submitting again.",
  PRICE_CHANGED: "The pharmacy price changed. We refreshed the catalog; review the current prices and confirm your order again. Nothing was automatically repriced or resubmitted.",
  PRICE_UNAVAILABLE: "A current price could not be confirmed. Review the catalog and try again when prices are available.",
  INVALID_ADDRESS: "The delivery address could not be accepted. Update the address before submitting again.",
  INVALID_SOURCE_KEY: "The pharmacy could not verify this order request. Contact the pharmacy before trying again.",
  SOURCE_NOT_AUTHORIZED: "The pharmacy could not authorize this order request. Contact the pharmacy before trying again.",
};

function parseStaffCheckoutError(error: unknown): { code: StaffCheckoutErrorCode; order?: StaffCheckoutOrder } | null {
  if (!(error instanceof Error)) return null;
  const jsonStart = error.message.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const body = JSON.parse(error.message.slice(jsonStart)) as {
      error?: unknown;
      order?: StaffCheckoutOrder;
    };
    const codes = Object.keys(STAFF_CHECKOUT_ERROR_MESSAGES) as StaffCheckoutErrorCode[];
    return typeof body.error === "string" && codes.includes(body.error as StaffCheckoutErrorCode)
      ? { code: body.error as StaffCheckoutErrorCode, order: body.order }
      : null;
  } catch {
    return null;
  }
}

const CATEGORY_COMPLEMENTS: Record<string, string[]> = {
  "Pain Relief": ["Digestive Health", "Sleep Aid", "Vitamins"],
  "Allergy": ["Cough & Cold", "Sleep Aid", "Vitamins"],
  "Digestive Health": ["Vitamins", "Pain Relief"],
  "Vitamins": ["Heart Health", "Joint Health"],
  "Cough & Cold": ["Allergy", "Pain Relief", "Sleep Aid"],
  "Heart Health": ["Vitamins", "Joint Health"],
  "Joint Health": ["Pain Relief", "Vitamins"],
  "Sleep Aid": ["Vitamins", "Allergy"],
};

export default function CartPage() {
  const inventory = useInventoryState();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = useCallback((base: string) => proxyUrl(base, activePatientId, isProxy), [activePatientId, isProxy]);
  const {
    cart, isLoading: cartLoading, isMutating: cartIsMutating, updateQuantity, removeFromCart, clearCart, addToCart,
    totalItems, totalPrice, wellnessCredits, creditsApplied, applyCredits, amountDue,
  } = useCart();
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("cart");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const contactPhoneEdited = useRef(false);
  const [scheduledPickupTime, setScheduledPickupTime] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [checkoutErrorCode, setCheckoutErrorCode] = useState<StaffCheckoutErrorCode | null>(null);
  const [checkoutErrorText, setCheckoutErrorText] = useState<string | null>(null);
  const [priceChangedNeedsReview, setPriceChangedNeedsReview] = useState(false);
  const orderScopeRef = useRef<string | null>(null);

  const { data: products } = useQuery<OtcProduct[]>({
    queryKey: ["/api/otc/products"],
  });

  const { data: userProfile } = useQuery<{ id?: string; deliveryAddress?: string; phone?: string }>({
    queryKey: [pUrl("/api/auth/user")],
  });

  const { data: medications = [] } = useQuery<Medication[]>({
    queryKey: [pUrl("/api/medications")],
    staleTime: 60_000,
  });

  const [selectedRefillIds, setSelectedRefillIds] = useState<Set<number>>(new Set());
  const refillsInitializedRef = useRef(false);

  const isRefillDue = (med: Medication): boolean => {
    if (!med.nextRefillDate) return false;
    const daysUntil = Math.ceil(
      (new Date(med.nextRefillDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntil <= 0) return true;
    return (med.refillsRemaining ?? 0) > 0 && daysUntil <= 7;
  };

  const activeMedications = medications.filter((m) => m.isActive !== false);

  useEffect(() => {
    if (!refillsInitializedRef.current && activeMedications.length > 0) {
      refillsInitializedRef.current = true;
      setSelectedRefillIds(new Set(activeMedications.filter(isRefillDue).map((m) => m.id)));
    }
  }, [activeMedications.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderMutation = useMutation({
    mutationFn: async () => {
      const normalizedPhone = validateShopFulfillment({ contactPhone, deliveryMethod, deliveryAddress, scheduledPickupTime });
      const scope = `otc-order:${activePatientId ?? userProfile?.id ?? "self"}:${JSON.stringify(cart.map(i => [i.otcProductId, i.quantity]))}:${deliveryMethod}:${deliveryAddress}:${scheduledPickupTime}:${normalizedPhone}`;
      orderScopeRef.current = scope;
      const res = await apiRequest("POST", pUrl("/api/orders"), {
        orderType: "otc",
        totalItems: cart.reduce((sum, item) => sum + item.quantity, 0),
        pickupMethod: deliveryMethod === "pickup" ? "counter" : "delivery",
        deliveryMethod: deliveryMethod,
        contactPhone: normalizedPhone,
        deliveryAddress: deliveryMethod === "delivery" ? deliveryAddress : null,
        scheduledPickupTime: deliveryMethod === "pickup" ? scheduledPickupTime : null,
        bagReady: false,
        items: cart.map((item) => {
          const product = products?.find((p) => p.id === item.otcProductId);
          return {
            productName: item.productName,
            productType: "otc",
            quantity: item.quantity,
            otcProductId: item.otcProductId,
            unitPrice: product?.price ?? item.price ?? undefined,
          };
        }),
      }, { "Idempotency-Key": getIdempotencyKey(scope) });
      const order = await res.json() as StaffCheckoutOrder;
      if (order.staffCheckoutStatus === "rejected") {
        const rejected = new Error(`409: ${JSON.stringify({
          error: order.staffCheckoutError ?? "PRODUCT_UNAVAILABLE",
          order,
        })}`);
        throw rejected;
      }
      return order;
    },
    onSettled: () => requestInventoryRefresh(),
    onSuccess: (order: StaffCheckoutOrder) => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      if (order.staffCheckoutStatus === "confirmed") clearCart();
      setConfirmedOrder(order);
      setCheckoutErrorCode(null);
      setCheckoutErrorText(null);
      setPriceChangedNeedsReview(false);

      const selectedMeds = activeMedications.filter((m) => selectedRefillIds.has(m.id));
      if (selectedMeds.length > 0) {
        Promise.all(
          selectedMeds.map((med) => {
            const scope = `rx-order:${med.id}:${deliveryMethod}:${deliveryMethod === "delivery" ? deliveryAddress : ""}`;
            return apiRequest("POST", pUrl("/api/orders"), {
              orderType: "rx_refill",
              deliveryMethod: deliveryMethod,
              deliveryAddress: deliveryMethod === "delivery" ? deliveryAddress : null,
              totalItems: 1,
              items: [{ medicationId: med.id, productName: med.name, productType: "rx", quantity: 1 }],
            }, { "Idempotency-Key": getIdempotencyKey(scope) })
              .then((response) => {
                clearIdempotencyKey(scope);
                return response;
              });
          })
        )
          .then(() => {
            queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
            toast({
              title: `OTC order placed + ${selectedMeds.length} refill${selectedMeds.length > 1 ? "s" : ""} requested`,
              description:
                selectedMeds.length === 1
                  ? `Your OTC order and ${selectedMeds[0].name} refill are being prepared.`
                  : `Your OTC order and ${selectedMeds.length} prescription refills are being prepared.`,
            });
          })
          .catch(() => {
            toast({
              title: "Refill requests may not have sent",
              description:
                "Your OTC order was placed. Please request any refills manually from the Medications page.",
              variant: "destructive",
            });
          });
      }
    },
    onError: (error: Error) => {
      const staffCheckoutError = parseStaffCheckoutError(error);
      if (staffCheckoutError) {
        const scope = orderScopeRef.current;
        if (scope) clearIdempotencyKey(scope);
        setCheckoutErrorCode(staffCheckoutError.code);
        setCheckoutErrorText(STAFF_CHECKOUT_ERROR_MESSAGES[staffCheckoutError.code]);
        if (staffCheckoutError.code === "PRICE_CHANGED") {
          setPriceChangedNeedsReview(true);
          setCheckoutStep("cart");
          queryClient.invalidateQueries({ queryKey: ["/api/otc/products"] });
          requestInventoryRefresh();
        }
        toast({
          title: staffCheckoutError.code === "PRICE_CHANGED" ? "Price changed — review required" : "Order not accepted",
          description: STAFF_CHECKOUT_ERROR_MESSAGES[staffCheckoutError.code],
          variant: "destructive",
        });
        return;
      }
      if (error.message.startsWith("409:")) {
        let description = t("cart.itemsUnavailableDesc");
        try {
          const body = JSON.parse(error.message.slice(4).trim());
          if (body.message) description = body.message;
        } catch {}
        queryClient.invalidateQueries({ queryKey: [pUrl("/api/cart")] });
        toast({
          title: t("cart.itemsUnavailable"),
          description,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("cart.orderFailed"),
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const checkoutStatus = (confirmedOrder as StaffCheckoutOrder | null)?.staffCheckoutStatus;
  const shouldPollCheckoutOrder = !!confirmedOrder?.id &&
    (checkoutStatus === "pending" || checkoutStatus === "unconfirmed");
  const { data: polledCheckoutOrder } = useQuery<StaffCheckoutOrder>({
    queryKey: [pUrl("/api/orders"), confirmedOrder?.id, "checkout-confirmation"],
    queryFn: async () => {
      const response = await fetch(pUrl(`/api/orders/${confirmedOrder!.id}`), { credentials: "include" });
      if (!response.ok) throw new Error("Unable to check the saved order status");
      return response.json();
    },
    enabled: shouldPollCheckoutOrder,
    refetchInterval: (query) => {
      const status = (query.state.data as StaffCheckoutOrder | undefined)?.staffCheckoutStatus;
      return shouldPollCheckoutOrder && status !== "confirmed" && status !== "rejected" ? 5000 : false;
    },
  });
  const resolvedCheckoutOrderRef = useRef<number | null>(null);

  useEffect(() => {
    if (!polledCheckoutOrder || !confirmedOrder) return;
    if (polledCheckoutOrder.staffCheckoutStatus === "confirmed") {
      if (resolvedCheckoutOrderRef.current === polledCheckoutOrder.id) return;
      resolvedCheckoutOrderRef.current = polledCheckoutOrder.id;
      clearCart();
      setConfirmedOrder(polledCheckoutOrder);
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      return;
    }
    if (polledCheckoutOrder.staffCheckoutStatus === "rejected") {
      if (resolvedCheckoutOrderRef.current === polledCheckoutOrder.id) return;
      resolvedCheckoutOrderRef.current = polledCheckoutOrder.id;
      if (orderScopeRef.current) clearIdempotencyKey(orderScopeRef.current);
      const rejectedCode = polledCheckoutOrder.staffCheckoutError;
      const codes = Object.keys(STAFF_CHECKOUT_ERROR_MESSAGES) as StaffCheckoutErrorCode[];
      const safeCode = rejectedCode && codes.includes(rejectedCode as StaffCheckoutErrorCode)
        ? rejectedCode as StaffCheckoutErrorCode
        : null;
      setCheckoutErrorCode(safeCode);
      setCheckoutErrorText(safeCode
        ? STAFF_CHECKOUT_ERROR_MESSAGES[safeCode]
        : "Staff did not accept this order. Review your cart before making any new submission.");
      setConfirmedOrder(null);
      setCheckoutStep("cart");
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      if (safeCode === "PRICE_CHANGED") {
        setPriceChangedNeedsReview(true);
        queryClient.invalidateQueries({ queryKey: ["/api/otc/products"] });
        requestInventoryRefresh();
      }
      toast({
        title: safeCode === "PRICE_CHANGED" ? "Price changed — review required" : "Order not accepted",
        description: safeCode
          ? STAFF_CHECKOUT_ERROR_MESSAGES[safeCode]
          : "Staff did not accept this order. Review your cart before making any new submission.",
        variant: "destructive",
      });
    }
  }, [polledCheckoutOrder, confirmedOrder, clearCart, toast, pUrl]);

  const upsellProducts = getUpsellProducts(cart, products);

  // Pre-fill saved delivery address when user switches to delivery
  const profileAddress = userProfile?.deliveryAddress ?? "";
  useEffect(() => {
    contactPhoneEdited.current = false;
    setContactPhone("");
  }, [activePatientId]);
  useEffect(() => {
    if (!contactPhoneEdited.current) setContactPhone(userProfile?.phone ?? "");
  }, [userProfile?.phone, activePatientId]);
  useEffect(() => {
    if (deliveryMethod === "delivery" && deliveryAddress === "" && profileAddress) {
      setDeliveryAddress(profileAddress);
    }
  }, [deliveryMethod, profileAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlaceOrder = () => {
    if (!canProceedToPayment || cart.length === 0) return;
    orderMutation.mutate();
  };

  let contactError: string | null = null;
  try { validateShopFulfillment({ contactPhone, deliveryMethod, deliveryAddress, scheduledPickupTime }); }
  catch (error) { contactError = (error as Error).message; }
  const canProceedToPayment = contactError === null;

  const proceedHint = !deliveryMethod
    ? "Select a pickup or delivery option above to continue."
    : deliveryMethod === "pickup" && !scheduledPickupTime.trim()
      ? "Choose a pickup time above to continue."
      : deliveryMethod === "delivery" && !deliveryAddress.trim()
        ? "Enter your delivery address above to continue."
        : contactError;

  const staleCartItems = cart.filter((item) => {
    const product = products?.find((p) => p.id === item.otcProductId);
    return product && (product as any).syncSource === "concordia_backend";
  });
  const reviewedCartTotal = priceChangedNeedsReview
    ? cart.reduce((sum, item) => {
        const refreshedPrice = products?.find((product) => product.id === item.otcProductId)?.price;
        return sum + Number(refreshedPrice ?? item.price ?? 0) * item.quantity;
      }, 0)
    : totalPrice;
  const reviewedAmountDue = priceChangedNeedsReview
    ? Math.max(0, reviewedCartTotal - creditsApplied)
    : amountDue;
  const priceForCartItem = (item: (typeof cart)[number]) =>
    priceChangedNeedsReview
      ? products?.find((product) => product.id === item.otcProductId)?.price ?? item.price
      : item.price;

  if (confirmedOrder) {
    const isDelivery = confirmedOrder.deliveryMethod === "delivery";
    const checkoutStatus = (confirmedOrder as StaffCheckoutOrder).staffCheckoutStatus ?? null;
    const isStockConfirmed = checkoutStatus === "confirmed";
    const confirmationMessage = isStockConfirmed
      ? "Order received; stock reserved. This is not pharmacist approval or a promised pickup or delivery time. Payment remains unpaid; the pharmacy will confirm payment arrangements."
      : checkoutStatus === "pending"
        ? "Your order is saved and Staff is retrying delivery. Do not submit it again."
        : checkoutStatus === "unconfirmed"
          ? confirmedOrder.staffPanelOrderNumber
            ? "The pharmacy received an order reference, but stock reservation is unverified. Manual confirmation is needed; do not submit again."
            : "Checkout is unconfirmed. Stock reservation could not be verified, so manual confirmation is needed. Do not submit again."
          : checkoutStatus === "rejected"
            ? "The pharmacy did not accept or reserve this order. Your cart has been kept so you can review it before any new submission."
            : confirmedOrder.staffPanelOrderNumber
              ? "The pharmacy received this request for intake only. Stock is not confirmed or reserved."
              : "Your order request was saved, but the pharmacy has not confirmed stock or fulfillment. Do not submit it again.";
    return (
      <div className="max-w-3xl mx-auto p-4 pb-24">
        <div className="flex flex-col items-center gap-6 py-8 animate-drift-up">
          <div className="w-20 h-20 rounded-full bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center">
            <Check className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold" data-testid="text-order-confirmed">{isStockConfirmed ? "Order received" : "Order request saved"}</h2>
            <p role="status" className="text-sm text-muted-foreground">
              {confirmationMessage}
            </p>
            {confirmedOrder.contactPhone && (
              <p className="text-sm text-muted-foreground" data-testid="text-confirmed-contact-phone">
                Pharmacy callback number: {confirmedOrder.contactPhone}
              </p>
            )}
            {confirmedOrder.orderNumber && (
              <p className="text-base font-mono text-primary font-semibold" data-testid="text-order-number">
                {confirmedOrder.orderNumber}
              </p>
            )}
          </div>
          <Badge className="text-base px-4 py-1" variant="secondary">
            {isDelivery ? (
              <span className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                {t("cart.delivery")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                {t("orders.pickup")}
              </span>
            )}
          </Badge>
          {isDelivery && confirmedOrder.deliveryAddress && (
            <div className="text-center bg-muted/40 rounded-xl p-4 w-full" data-testid="text-delivery-address-confirm">
              <p className="text-base text-muted-foreground flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4" />
                Delivering to
              </p>
              <p className="text-base font-semibold mt-1">{confirmedOrder.deliveryAddress}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 w-full pt-2">
            <Button
              className="w-full text-lg"
              size="lg"
              onClick={() => setLocation(`/orders/${confirmedOrder.id}`)}
              data-testid="button-view-order-detail"
            >
              {t("cart.viewOrderStatus")}
            </Button>
            <Button
              variant="outline"
              className="w-full text-lg"
              size="lg"
              onClick={() => {
                setConfirmedOrder(null);
                setLocation("/orders");
              }}
              data-testid="button-continue-shopping"
            >
              {t("cart.continueShopping")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-5">
      {(inventory.stale || !inventory.connected || inventory.revisionAvailable === false) && (
        <p role="status" className="rounded-lg border p-3 text-sm" data-testid="cart-inventory-status">
          {inventory.stale ? "Current availability cannot be checked. Checkout is paused until Staff inventory reconnects."
            : inventory.revisionAvailable === false ? "Staff live revision updates are unavailable. Availability will be checked again before your order request is saved."
              : "Live connection interrupted. Checking Staff inventory every second while this page is open."}
        </p>
      )}
      {checkoutErrorText && (
        <Card
          className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          data-testid="banner-staff-checkout-rejected"
          role="alert"
        >
          <CardContent className="p-4">
            <p className="font-semibold">
              {checkoutErrorCode === "PRICE_CHANGED" ? "Review the updated catalog before agreeing again" : "Order not accepted"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {checkoutErrorText}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center gap-3 animate-drift-up">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (checkoutStep === "payment") {
              setCheckoutStep("delivery");
            } else if (checkoutStep === "delivery") {
              setCheckoutStep("cart");
            } else {
              setLocation("/orders");
            }
          }}
          data-testid="button-back-to-store"
          aria-label={checkoutStep === "cart" ? t("cart.backToStore") : t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-cart-heading">
            {checkoutStep === "cart" && t("cart.yourCart")}
            {checkoutStep === "delivery" && t("cart.delivery")}
            {checkoutStep === "payment" && "Review request"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {checkoutStep === "cart" && `${totalItems} ${totalItems === 1 ? t("common.item") : t("common.items")}`}
            {checkoutStep === "delivery" && t("cart.chooseDeliveryMethod")}
            {checkoutStep === "payment" && "Confirm your contact and fulfillment details"}
          </p>
        </div>
        {checkoutStep === "cart" && cart.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={clearCart}
            data-testid="button-clear-cart"
          >
            {t("cart.clearAll")}
          </Button>
        )}
      </div>

      {checkoutStep !== "cart" && (
        <div className="flex items-center gap-2 animate-drift-up" data-testid="checkout-progress">
          <StepDot active={checkoutStep === "delivery"} completed={checkoutStep === "payment"} label={t("cart.delivery")} stepNumber={1} />
          <div className={`flex-1 h-0.5 rounded ${checkoutStep === "payment" ? "bg-primary" : "bg-muted"}`} />
          <StepDot active={checkoutStep === "payment"} completed={false} label="Review" stepNumber={2} />
        </div>
      )}

      {checkoutStep === "cart" && (
        <>
          {cartLoading ? (
            <div className="space-y-3 animate-drift-up-1" data-testid="section-cart-loading">
              {[1, 2, 3].map((n) => (
                <Card key={n} className="glass-card">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <Skeleton className="h-9 w-32" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : cart.length === 0 ? (
            <Card className="glass-card animate-drift-up-1" data-testid="card-empty-cart">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <p className="text-xl font-medium">{t("cart.emptyCart")}</p>
                <p className="text-base text-muted-foreground text-center">
                  {t("cart.browseAndAdd")}
                </p>
                <Link href="/shop">
                  <Button size="lg" className="text-base" data-testid="button-browse-store">
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    {t("cart.browseStore")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {priceChangedNeedsReview && (
                <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" data-testid="banner-price-changed-review">
                  <CardContent className="p-4">
                    <p className="font-semibold">A new price needs your agreement</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      We refreshed the product catalog. Review the updated prices and total below, then continue through checkout to submit a new request. Nothing was repriced or resubmitted automatically.
                    </p>
                  </CardContent>
                </Card>
              )}
              {staleCartItems.length > 0 && (
                <Card className="glass-card border-amber-300 dark:border-amber-700 animate-drift-up-1" data-testid="banner-stale-cart-items">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Some items in your cart may no longer be available in our current catalog. Remove them before checking out if you see an error.
                    </p>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-3" data-testid="section-cart-items">
                {cart.map((item, i) => {
                  const isOutOfStock = item.isAvailable === false || (item.stockCount != null && item.stockCount <= 0);
                  return (
                  <Card
                    key={item.otcProductId}
                    className={`glass-card animate-drift-up-${Math.min(i + 1, 8)} ${isOutOfStock ? "border-red-300 dark:border-red-800" : ""}`}
                    data-testid={`cart-item-${item.otcProductId}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isOutOfStock ? "bg-red-100/60 dark:bg-red-900/20" : "bg-primary/10"}`}>
                          <ShoppingBag className={`h-5 w-5 ${isOutOfStock ? "text-red-500 dark:text-red-400" : "text-primary"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold truncate" data-testid={`text-cart-item-name-${item.otcProductId}`}>
                            {item.productName}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {priceForCartItem(item) && !isOutOfStock && (
                              <p className="text-sm text-muted-foreground">
                                ${parseFloat(priceForCartItem(item)!).toFixed(2)} {t("cart.each")}
                              </p>
                            )}
                            {isOutOfStock && (
                              <span
                                className="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 leading-none"
                                data-testid={`badge-out-of-stock-${item.otcProductId}`}
                              >
                                {t("cart.outOfStock")}
                              </span>
                            )}
                            {!isOutOfStock && products?.find((p) => p.id === item.otcProductId)?.fsaEligible && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 leading-none"
                                data-testid={`badge-cart-fsa-${item.otcProductId}`}
                                aria-label="FSA/HSA eligible"
                              >
                                <BadgeCheck className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                FSA/HSA
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground"
                          onClick={() => removeFromCart(item.otcProductId)}
                          disabled={cartIsMutating}
                          data-testid={`button-cart-remove-${item.otcProductId}`}
                          aria-label={`Remove ${item.productName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {isOutOfStock ? (
                        <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full h-10 text-sm font-semibold"
                            onClick={() => removeFromCart(item.otcProductId)}
                            disabled={cartIsMutating}
                            data-testid={`button-remove-out-of-stock-${item.otcProductId}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t("cart.removeOutOfStock")}
                          </Button>
                        </div>
                      ) : (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => updateQuantity(item.otcProductId, item.quantity - 1)}
                            disabled={cartIsMutating}
                            data-testid={`button-cart-minus-${item.otcProductId}`}
                            aria-label={`Decrease ${item.productName} quantity`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span
                            className="text-lg font-semibold w-8 text-center"
                            data-testid={`text-cart-qty-${item.otcProductId}`}
                          >
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => updateQuantity(item.otcProductId, item.quantity + 1)}
                            disabled={cartIsMutating || item.quantity >= 10}
                            data-testid={`button-cart-plus-${item.otcProductId}`}
                            aria-label={`Increase ${item.productName} quantity`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {priceForCartItem(item) && (
                          <p className="text-lg font-bold" data-testid={`text-cart-item-total-${item.otcProductId}`}>
                            ${(parseFloat(priceForCartItem(item)!) * item.quantity).toFixed(2)}
                          </p>
                        )}
                      </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>

              {upsellProducts.length > 0 && (
                <div className="space-y-3 animate-drift-up-3" data-testid="section-upsell">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("cart.youMightAlsoNeed")}
                    </h3>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
                    {upsellProducts.map((product) => (
                      <Card
                        key={product.id}
                        className="shrink-0 w-44 glass-card"
                        data-testid={`card-upsell-${product.id}`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <p className="text-sm font-semibold leading-tight line-clamp-2">{product.name}</p>
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                            {product.price && (
                              <span className="text-sm font-bold">${parseFloat(product.price).toFixed(2)}</span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => addToCart(product)}
                            data-testid={`button-upsell-add-${product.id}`}
                          >
                            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t("common.add")}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {activeMedications.length > 0 && (
                <Card
                  className="glass-card border-blue-200 dark:border-blue-800 animate-drift-up-3"
                  data-testid="section-refill-upsell"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <h3 className="text-base font-semibold">Also pick up your prescriptions?</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Check the ones you want refilled at the same time. Each refill will be placed as a
                      separate order.
                    </p>
                    <div className="space-y-1" data-testid="list-refill-meds">
                      {activeMedications.map((med) => {
                        const due = isRefillDue(med);
                        const daysUntil =
                          med.nextRefillDate
                            ? Math.ceil(
                                (new Date(med.nextRefillDate).getTime() - Date.now()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            : null;
                        return (
                          <div
                            key={med.id}
                            className="flex items-start gap-3 py-2"
                            data-testid={`section-refill-med-${med.id}`}
                          >
                            <Checkbox
                              id={`refill-med-${med.id}`}
                              checked={selectedRefillIds.has(med.id)}
                              onCheckedChange={(checked) => {
                                setSelectedRefillIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(med.id);
                                  else next.delete(med.id);
                                  return next;
                                });
                              }}
                              className="mt-0.5"
                              data-testid={`checkbox-refill-${med.id}`}
                            />
                            <label
                              htmlFor={`refill-med-${med.id}`}
                              className="flex-1 cursor-pointer min-w-0"
                            >
                              <span className="text-base font-medium block leading-tight">
                                {med.name}
                              </span>
                              {daysUntil !== null ? (
                                due ? (
                                  <span
                                    className="text-sm font-medium text-orange-600 dark:text-orange-400"
                                    data-testid={`text-refill-due-${med.id}`}
                                  >
                                    Refill due
                                  </span>
                                ) : (
                                  <span
                                    className="text-sm text-muted-foreground"
                                    data-testid={`text-refill-days-${med.id}`}
                                  >
                                    Refill in {daysUntil} day{daysUntil !== 1 ? "s" : ""}
                                  </span>
                                )
                              ) : null}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(() => {
                const fsaTotal = cart.reduce((sum, item) => {
                  const isFsa = products?.find((p) => p.id === item.otcProductId)?.fsaEligible;
                  if (!isFsa || !item.price) return sum;
                  return sum + parseFloat(priceForCartItem(item) ?? "0") * item.quantity;
                }, 0);
                return (
                  <Card className="glass-card sticky bottom-20 z-40 animate-drift-up-4" data-testid="section-cart-total">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-base text-muted-foreground">{t("cart.estimatedTotal")}</span>
                        <span className="text-2xl font-bold" data-testid="text-cart-total">
                          ${reviewedCartTotal.toFixed(2)}
                        </span>
                      </div>
                      {fsaTotal > 0 && (
                        <div className="space-y-1" data-testid="section-cart-fsa-total">
                          <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                            <span className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              FSA/HSA eligible
                            </span>
                            <span className="text-sm font-bold text-violet-700 dark:text-violet-300" data-testid="text-cart-fsa-total">
                              ${fsaTotal.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-xs text-violet-600 dark:text-violet-400 px-1" data-testid="text-cart-fsa-hint">
                            Up to ${fsaTotal.toFixed(2)} may be covered by your FSA/HSA benefit account.
                          </p>
                        </div>
                      )}
                      <Button
                        className="w-full text-lg"
                        size="lg"
                        disabled={inventory.stale || cart.some(i => i.isAvailable === false || (i.stockCount ?? 0) < i.quantity)}
                        onClick={() => setCheckoutStep("delivery")}
                        data-testid="button-place-order"
                      >
                        <Wallet className="mr-2 h-5 w-5" />
                        {t("cart.checkout")} - ${reviewedCartTotal.toFixed(2)}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })()}
            </>
          )}
        </>
      )}

      {checkoutStep === "delivery" && (
        <div className="space-y-4 animate-drift-up">
          <Card className="glass-card" data-testid="section-delivery-method">
            <CardContent className="p-5 space-y-4">
              <h2 className="text-xl font-bold">{t("orders.howReceiveOrder")}</h2>
              <div className="flex flex-col gap-3">
                <Button
                  variant={deliveryMethod === "pickup" ? "default" : "outline"}
                  size="lg"
                  className={`w-full justify-start gap-3 text-left h-auto py-4 toggle-elevate ${deliveryMethod === "pickup" ? "toggle-elevated" : ""}`}
                  onClick={() => setDeliveryMethod("pickup")}
                  data-testid="button-select-pickup"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-base font-semibold block">{t("cart.pharmacyPickup")}</span>
                    <span className="text-sm opacity-70 font-normal">{t("cart.readyIn15to30")}</span>
                  </div>
                  {deliveryMethod === "pickup" && <Check className="h-5 w-5 shrink-0" />}
                </Button>
                <Button
                  variant={deliveryMethod === "delivery" ? "default" : "outline"}
                  size="lg"
                  className={`w-full justify-start gap-3 text-left h-auto py-4 toggle-elevate ${deliveryMethod === "delivery" ? "toggle-elevated" : ""}`}
                  onClick={() => setDeliveryMethod("delivery")}
                  data-testid="button-select-delivery"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-base font-semibold block">{t("cart.homeDelivery")}</span>
                    <span className="text-sm opacity-70 font-normal">{t("cart.deliveredToYourDoor")}</span>
                  </div>
                  {deliveryMethod === "delivery" && <Check className="h-5 w-5 shrink-0" />}
                </Button>
              </div>

              {deliveryMethod === "pickup" && (
                <div className="space-y-3 animate-drift-up" data-testid="section-pickup-time">
                  <div className="rounded-xl bg-muted/50 p-4">
                    <p className="text-base text-muted-foreground">
                      {t("cart.pickupNote")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-lg font-medium flex items-center gap-2" htmlFor="cart-pickup-time">
                      <Clock className="h-5 w-5 text-primary" />
                      When will you pick up?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {["30 min", "1 hour", "2 hours", "3 hours", "4 hours", "Today 5 PM"].map((slot) => (
                        <Button
                          key={slot}
                          type="button"
                          variant={scheduledPickupTime === slot ? "default" : "outline"}
                          className={`text-sm min-h-[44px] ${scheduledPickupTime === slot ? "ring-2 ring-primary" : ""}`}
                          onClick={() => setScheduledPickupTime(slot)}
                          data-testid={`button-pickup-slot-${slot.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {slot}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-sm text-muted-foreground">or enter a time</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <Input
                      id="cart-pickup-time"
                      type="time"
                      value={scheduledPickupTime.includes(":") ? scheduledPickupTime : ""}
                      onChange={(e) => setScheduledPickupTime(e.target.value)}
                      className="text-lg min-h-[52px]"
                      data-testid="input-pickup-time"
                    />
                  </div>
                </div>
              )}

              {deliveryMethod === "delivery" && (
                <div className="space-y-2 animate-drift-up">
                  <label className="text-lg font-medium" htmlFor="cart-delivery-address">
                    {t("cart.deliveryAddress")}
                  </label>
                  <Input
                    id="cart-delivery-address"
                    placeholder={t("cart.enterDeliveryAddress")}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="text-lg min-h-[52px]"
                    data-testid="input-delivery-address"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="section-order-contact">
            <CardContent className="p-4 space-y-2">
              <label htmlFor="cart-contact-phone" className="text-lg font-medium">Phone number (required)</label>
              <Input id="cart-contact-phone" type="tel" inputMode="tel" autoComplete="tel"
                required maxLength={40} value={contactPhone} placeholder="(555) 123-4567"
                onChange={(event) => { contactPhoneEdited.current = true; setContactPhone(event.target.value); }}
                className="text-lg min-h-[52px]" data-testid="input-order-contact-phone" />
              <p className="text-sm text-muted-foreground">
                The pharmacy will use this number to confirm your pickup or delivery request. This does not change your profile phone number.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="section-delivery-summary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-base text-muted-foreground">
                  {totalItems} {totalItems === 1 ? t("common.item") : t("common.items")}
                </span>
                <span className="text-xl font-bold" data-testid="text-delivery-total">
                  ${reviewedCartTotal.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>

          {proceedHint && (
            <p className="text-sm text-muted-foreground text-center px-2" data-testid="text-proceed-hint">
              {proceedHint}
            </p>
          )}
          <Button
            className="w-full text-lg h-14"
            size="lg"
            disabled={!canProceedToPayment}
            onClick={() => setCheckoutStep("payment")}
            data-testid="button-continue-to-payment"
          >
            Review request
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}

      {checkoutStep === "payment" && (
        <div className="space-y-4 animate-drift-up">
          <Card className="glass-card" data-testid="section-order-summary">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{t("cart.orderSummary")}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-base">{t("cart.subtotal")} ({totalItems} {totalItems === 1 ? t("common.item") : t("common.items")})</span>
                  <span className="text-base font-semibold" data-testid="text-payment-subtotal">${reviewedCartTotal.toFixed(2)}</span>
                </div>
                {(() => {
                  const fsaTotal = cart.reduce((sum, item) => {
                    const isFsa = products?.find((p) => p.id === item.otcProductId)?.fsaEligible;
                    if (!isFsa || !item.price) return sum;
                    return sum + parseFloat(priceForCartItem(item) ?? "0") * item.quantity;
                  }, 0);
                  return fsaTotal > 0 ? (
                    <div className="space-y-1" data-testid="section-payment-fsa-total">
                      <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20">
                        <span className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          FSA/HSA eligible
                        </span>
                        <span className="text-sm font-bold text-violet-700 dark:text-violet-300" data-testid="text-payment-fsa-total">
                          ${fsaTotal.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-violet-600 dark:text-violet-400 px-1" data-testid="text-payment-fsa-hint">
                        Up to ${fsaTotal.toFixed(2)} may be covered by your FSA/HSA benefit account.
                      </p>
                    </div>
                  ) : null;
                })()}
                <div className="flex items-center justify-between">
                  <span className="text-base">
                    {deliveryMethod === "pickup" ? t("cart.pharmacyPickup") : t("cart.delivery")}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {t("common.free")}
                  </Badge>
                </div>
                {creditsApplied > 0 && (
                  <div className="flex items-center justify-between text-green-600 dark:text-green-400">
                    <span className="text-base flex items-center gap-1">
                      <Gift className="h-4 w-4" />
                      {t("cart.wellnessCredits")}
                    </span>
                    <span className="text-base font-semibold" data-testid="text-credits-discount">
                      -${creditsApplied.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t pt-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">{t("cart.totalDue")}</span>
                    <span className="text-2xl font-bold text-primary" data-testid="text-amount-due">
                      ${reviewedAmountDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {wellnessCredits > 0 && (
            <Card className="glass-card border-green-200 dark:border-green-800" data-testid="section-wellness-credits">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Gift className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-base font-semibold">{t("cart.wellnessCredits")}</p>
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium" data-testid="text-credits-balance">
                        ${wellnessCredits.toFixed(2)} {t("cart.creditsAvailable")}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground text-right">
                    Confirmed and applied by the pharmacy
                  </span>
                </div>
                {creditsApplied > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800 animate-drift-up">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("cart.creditsApplied")}</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        -${creditsApplied.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-muted-foreground">{t("cart.remainingBalance")}</span>
                      <span className="font-semibold">
                        ${reviewedAmountDue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {wellnessCredits === 0 && (
            <Card className="glass-card border-dashed" data-testid="section-no-credits">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Gift className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-base font-semibold">{t("cart.wellnessCredits")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("cart.noCreditsAvailable")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3" data-testid="section-payment-methods">
            <p className="text-base font-medium" data-testid="text-order-contact-phone">Contact phone: {contactPhone}</p>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Payment is collected by the pharmacy
            </p>

            <Card className="glass-card border-dashed" data-testid="section-card-payment">
              <CardContent className="p-5 flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Phone className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-base font-medium text-muted-foreground">
                  No payment will be charged in this app
                </p>
                <p className="text-sm text-muted-foreground/70">
                  Pickup or delivery requests only. The pharmacy will call to confirm availability, fulfillment and payment arrangements.
                </p>
              </CardContent>
            </Card>
          </div>

          <Button
            className="w-full text-lg h-14"
            size="lg"
            onClick={handlePlaceOrder}
            disabled={orderMutation.isPending || !canProceedToPayment || inventory.stale || cart.some(i => i.isAvailable === false || (i.stockCount ?? 0) < i.quantity)}
            data-testid="button-confirm-checkout"
          >
            {orderMutation.isPending ? t("cart.placingOrder") : `Submit order request — estimated $${reviewedAmountDue.toFixed(2)}`}
          </Button>

          <div className="flex items-center justify-center gap-4 pt-2 pb-4" data-testid="section-security-badges">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{t("cart.ssl256bit")}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{t("cart.hipaaCompliant")}</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{t("cart.pciDss")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDot({ active, completed, label, stepNumber }: { active: boolean; completed: boolean; label: string; stepNumber: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
          completed
            ? "bg-primary text-primary-foreground"
            : active
              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"
        }`}
        data-testid={`step-${stepNumber}`}
      >
        {completed ? <Check className="h-4 w-4" /> : stepNumber}
      </div>
      <span className={`text-xs font-medium ${active || completed ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function ApplePayIcon() {
  return (
    <svg width="50" height="21" viewBox="0 0 50 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9.34 2.76C8.58 3.66 7.4 4.36 6.22 4.26C6.08 3.08 6.64 1.82 7.34 1C8.1 0.08 9.38-0.56 10.44-0.62C10.56 0.62 10.1 1.84 9.34 2.76ZM10.42 4.46C8.7 4.36 7.22 5.38 6.4 5.38C5.56 5.38 4.3 4.52 2.92 4.54C1.16 4.58-0.44 5.5-1.32 7.02C-3.12 10.06-1.82 14.58-0.06 17.04C0.82 18.26 1.88 19.62 3.26 19.56C4.58 19.5 5.1 18.72 6.7 18.72C8.3 18.72 8.76 19.56 10.16 19.54C11.58 19.5 12.5 18.3 13.38 17.08C14.38 15.68 14.78 14.32 14.8 14.24C14.76 14.22 12.02 13.16 12 10.02C11.98 7.36 14.14 6.1 14.24 6.02C12.98 4.16 11.06 4.48 10.42 4.46Z" transform="translate(5 1)" fill="white"/>
      <text x="23" y="15" fill="white" fontSize="14" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="600">Pay</text>
    </svg>
  );
}

function GooglePayIcon() {
  return (
    <svg width="70" height="24" viewBox="0 0 70 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x="0" y="18" fill="#5F6368" fontSize="16" fontFamily="'Google Sans', Roboto, Arial, sans-serif" fontWeight="500" letterSpacing="-0.02em">
        <tspan fill="#4285F4">G</tspan>
        <tspan fill="#EA4335">o</tspan>
        <tspan fill="#FBBC04">o</tspan>
        <tspan fill="#4285F4">g</tspan>
        <tspan fill="#34A853">l</tspan>
        <tspan fill="#EA4335">e</tspan>
      </text>
      <text x="44" y="18" fill="#5F6368" fontSize="16" fontFamily="'Google Sans', Roboto, Arial, sans-serif" fontWeight="500">Pay</text>
    </svg>
  );
}

function getUpsellProducts(
  cart: { otcProductId: number }[],
  allProducts: OtcProduct[] | undefined
): OtcProduct[] {
  if (!allProducts || cart.length === 0) return [];
  const cartProductIds = new Set(cart.map((c) => c.otcProductId));
  const cartCategories = new Set(
    cart
      .map((c) => allProducts.find((p) => p.id === c.otcProductId)?.category)
      .filter(Boolean) as string[]
  );
  const suggestedCategories = new Set<string>();
  cartCategories.forEach((cat) => {
    const complements = CATEGORY_COMPLEMENTS[cat];
    if (complements) {
      complements.forEach((c) => {
        if (!cartCategories.has(c)) suggestedCategories.add(c);
      });
    }
  });
  return allProducts
    .filter(
      (p) =>
        !cartProductIds.has(p.id) &&
        p.isAvailable &&
        suggestedCategories.has(p.category ?? "")
    )
    .sort((a, b) => parseFloat(a.price ?? "0") - parseFloat(b.price ?? "0"))
    .slice(0, 4);
}
