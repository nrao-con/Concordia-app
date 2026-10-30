import { useState, useEffect } from "react";
import { StaffSubmissionStatus } from "@/components/staff-submission-status";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, clearIdempotencyKey, getIdempotencyKey, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/utils";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Package,
  Store,
  Truck,
  QrCode,
  X,
  MapPin,
  ClipboardCheck,
  ShieldCheck,
  CircleDot,
  Timer,
  AlertTriangle,
  PackageCheck,
  Phone,
  Ban,
  FileCheck,
  Share2,
  Sparkles,
  Check,
  ShoppingCart,
  Pill,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { SignatureModal } from "@/components/signature-modal";
import { RefillSubmissionStatus } from "@/components/refill-submission-status";
import { OrderCancellationStatus } from "@/components/order-cancellation-status";
import type { SignatureConfirmData } from "@/components/signature-modal";
import type { Order, OrderItem } from "@shared/schema";

type OrderWithItems = Order & {
  items: OrderItem[];
  pharmFlowSubmissionStatus?: string | null;
  staffCheckoutStatus?: "pending" | "confirmed" | "rejected" | "unconfirmed" | null;
  staffCheckoutError?: string | null;
  staffPanelOrderNumber?: string | null;
};

const STAFF_CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: "There was not enough stock to accept this order.",
  PRODUCT_UNAVAILABLE: "One or more items were unavailable, so the order was not accepted.",
  PRICE_CHANGED: "The price changed before the order could be accepted. No new price was agreed to.",
  PRICE_UNAVAILABLE: "A current price could not be confirmed, so the order was not accepted.",
  INVALID_ADDRESS: "The delivery address could not be accepted.",
  INVALID_SOURCE_KEY: "The order request could not be verified by the pharmacy.",
  SOURCE_NOT_AUTHORIZED: "The order request was not authorized by the pharmacy.",
};

function getPipelineSteps(deliveryMethod: string | null, t: (key: string) => string, orderType?: string | null) {
  const isDelivery = deliveryMethod === "delivery";
  const isOtc = orderType === "otc";
  return [
    {
      key: "pending",
      label: t("orderDetail.orderReceived"),
      description: t("orderDetail.orderReceivedDesc"),
      icon: ClipboardCheck,
    },
    {
      key: "preparing",
      label: t("orderDetail.preparingLabel"),
      description: isOtc ? t("orderDetail.preparingDescOtc") : t("orderDetail.preparingDesc"),
      icon: Package,
    },
    {
      key: "verified",
      label: t("orderDetail.verifiedLabel"),
      description: isOtc ? t("orderDetail.verifiedDescOtc") : t("orderDetail.verifiedDesc"),
      icon: ShieldCheck,
    },
    {
      key: "ready",
      label: t("orderDetail.readyLabel"),
      description: isDelivery
        ? t("orderDetail.readyDescDelivery")
        : t("orderDetail.readyDescPickup"),
      icon: CheckCircle2,
    },
    {
      key: isDelivery ? "delivered" : "picked_up",
      label: isDelivery ? t("orderDetail.deliveredLabel") : t("orderDetail.pickedUpLabel"),
      description: isDelivery
        ? t("orderDetail.deliveredDesc")
        : t("orderDetail.pickedUpDesc"),
      icon: PackageCheck,
    },
  ] as const;
}

function getStepIndex(status: string | null, deliveryMethod: string | null, t: (key: string) => string, orderType?: string | null): number {
  if (!status) return 0;
  if (status === "pending" || status === "received") return 0;
  const steps = getPipelineSteps(deliveryMethod, t, orderType);
  const idx = steps.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  return 0;
}

function friendlyOrderType(type: string | null, t: (key: string) => string): string {
  switch (type) {
    case "otc": return t("orderDetail.otcOrder");
    case "rx_refill": return t("orderDetail.rxRefillOrder");
    case "blister_pack": return t("orderDetail.blisterPackOrder");
    default: return type?.replace(/_/g, " ") || t("orderDetail.orderDetails");
  }
}

function CelebrationBanner({ status, deliveryMethod }: { status: string; deliveryMethod?: string | null }) {
  const { t } = useTranslation();
  const isReady = status === "ready";
  const isDelivery = deliveryMethod === "delivery";
  const label = isReady
    ? t("orderDetail.yourOrderIsReady")
    : status === "delivered"
      ? t("orderDetail.orderDelivered")
      : t("orderDetail.orderPickedUp");

  return (
    <div
      className="relative rounded-md p-5 flex items-center gap-4 animate-celebration overflow-visible"
      style={{
        background: isReady
          ? "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--status-success) / 0.2))"
          : "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--status-success) / 0.2))",
      }}
      data-testid="banner-celebration"
    >
      <div className="absolute -top-1 -right-1 opacity-60">
        <Sparkles className="h-5 w-5 text-primary animate-confetti" style={{ animationDelay: "0.1s" }} />
      </div>
      <div className="absolute -top-2 right-8 opacity-40">
        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-confetti" style={{ animationDelay: "0.3s" }} />
      </div>
      <div className="absolute -top-1 right-16 opacity-50">
        <Sparkles className="h-3 w-3 text-green-600 dark:text-green-400 animate-confetti" style={{ animationDelay: "0.5s" }} />
      </div>
      <div className="absolute -top-2 right-24 opacity-55">
        <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400 animate-confetti-wide" style={{ animationDelay: "0.2s" }} />
      </div>
      <div className="absolute -top-1 right-32 opacity-45">
        <Sparkles className="h-3 w-3 text-primary animate-confetti-drift" style={{ animationDelay: "0.4s" }} />
      </div>
      <div className="absolute -top-2 left-4 opacity-35">
        <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400 animate-confetti-wide" style={{ animationDelay: "0.6s" }} />
      </div>
      <div className="absolute -top-1 left-12 opacity-50">
        <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400 animate-confetti-drift" style={{ animationDelay: "0.8s" }} />
      </div>
      <div className="absolute -top-2 left-20 opacity-40">
        <Sparkles className="h-5 w-5 text-orange-600 dark:text-orange-400 animate-confetti" style={{ animationDelay: "0.7s" }} />
      </div>

      <div className="w-14 h-14 rounded-full bg-green-100/50 dark:bg-green-900/20 flex items-center justify-center shrink-0 animate-scale-in">
        {isReady ? (
          <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
        ) : (
          <PackageCheck className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        )}
      </div>
      <div>
        <p className="text-xl font-bold" data-testid="text-celebration-label">{label}</p>
        <p className="text-base text-muted-foreground">
          {isReady
            ? isDelivery
              ? t("orderDetail.headToDelivery")
              : t("orderDetail.headToPharmacy")
            : t("orderDetail.thankYou")}
        </p>
      </div>
    </div>
  );
}

function VerticalTimeline({
  status,
  createdAt,
  deliveryMethod,
  statusHistory,
  orderType,
}: {
  status: string | null;
  createdAt: string | Date | null;
  deliveryMethod: string | null;
  statusHistory?: Array<{ status: string; timestamp: string }> | null;
  orderType?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const steps = getPipelineSteps(deliveryMethod, t, orderType);
  const currentIdx = getStepIndex(status, deliveryMethod, t, orderType);
  const isTerminal = status === "picked_up" || status === "delivered";
  const isCancelled = status === "cancelled";
  const showCelebration = status === "ready" || isTerminal;

  const orderTime = createdAt ? new Date(createdAt) : null;
  const progressPercent = isTerminal ? 100 : (currentIdx / (steps.length - 1)) * 100;

  if (isCancelled) {
    return (
      <Card data-testid="card-pipeline-status">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-5">{t("orderDetail.orderStatus")}</h2>
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300" data-testid="text-order-cancelled">
              {t("orderDetail.orderCancelled")}
            </p>
            <p className="text-lg text-muted-foreground text-center">
              {t("orderDetail.orderCancelledDesc")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-pipeline-status">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h2 className="text-xl font-semibold">{t("orderDetail.orderProgress")}</h2>
          {status && (
            <Badge
              variant={isTerminal ? "secondary" : status === "ready" ? "default" : "secondary"}
              className="text-base"
              data-testid="badge-current-status"
            >
              {isTerminal
                ? (status === "delivered" ? t("orderDetail.deliveredLabel") : status === "picked_up" ? t("orderDetail.pickedUpLabel") : t("orderDetail.complete"))
                : steps.find((s) => s.key === status)?.label || status}
            </Badge>
          )}
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-sm text-muted-foreground">
              {t("orderDetail.stepOf", { current: Math.min(currentIdx + 1, steps.length), total: steps.length })}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" data-testid="progress-bar-track">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPercent}%`,
                background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--status-success)))",
              }}
              data-testid="progress-bar-fill"
            />
          </div>
        </div>

        {showCelebration && (
          <div className="mb-6">
            <CelebrationBanner status={status!} deliveryMethod={deliveryMethod} />
          </div>
        )}

        <div className="relative pl-12 space-y-2" data-testid="pipeline-steps">
          {steps.map((step, idx) => {
            const isActive = idx === currentIdx && !isTerminal;
            const isCompleted = isTerminal ? true : idx < currentIdx;
            const isFuture = !isTerminal && idx > currentIdx;
            const StepIcon = step.icon;

            const glassClass = isActive
              ? "glass-timeline-step glass-timeline-step--active"
              : isCompleted
                ? "glass-timeline-step glass-timeline-step--completed"
                : "glass-timeline-step glass-timeline-step--future";

            let stepTime: string | null = null;
            if (isCompleted || isActive) {
              const historyEntry = statusHistory?.find((h) => h.status === step.key);
              if (historyEntry?.timestamp) {
                const d = new Date(historyEntry.timestamp);
                stepTime = d.toLocaleTimeString(getDateLocale(i18n.language), { hour: "numeric", minute: "2-digit" });
              } else if (orderTime && isCompleted && idx === 0) {
                stepTime = orderTime.toLocaleTimeString(getDateLocale(i18n.language), { hour: "numeric", minute: "2-digit" });
              }
            }

            return (
              <div key={step.key} className="relative" data-testid={`pipeline-step-${step.key}`}>
                <div
                  className={`absolute -left-12 top-0 w-12 flex justify-center ${
                    idx === steps.length - 1 ? "" : "h-full"
                  }`}
                >
                  <div className="relative flex flex-col items-center">
                    {isCompleted ? (
                      <div
                        className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500"
                        style={{
                          background: "linear-gradient(135deg, hsl(var(--status-success)), hsl(var(--primary)))",
                        }}
                      >
                        <Check className="h-5 w-5 text-white" strokeWidth={3} />
                      </div>
                    ) : isActive ? (
                      <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground animate-timeline-ring transition-all duration-500">
                        <StepIcon className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 border-muted-foreground/20 bg-background text-muted-foreground transition-all duration-500">
                        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                </div>

                {idx < steps.length - 1 && (
                  <div className="absolute -left-12 top-10 w-12 flex justify-center" style={{ height: "calc(100% - 2.5rem)" }}>
                    <div
                      className={`w-0.5 h-full rounded-full transition-all duration-700 ${isActive ? "animate-connector-shimmer" : ""}`}
                      style={{
                        background: isCompleted
                          ? "linear-gradient(180deg, hsl(var(--status-success)), hsl(var(--primary)))"
                          : isActive
                            ? "linear-gradient(180deg, hsl(var(--primary) / 0.4), hsl(var(--muted-foreground) / 0.15))"
                            : "hsl(var(--muted-foreground) / 0.15)",
                      }}
                    />
                  </div>
                )}

                <div className={glassClass}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-lg font-semibold transition-colors duration-300 ${
                      isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {step.label}
                    </p>
                    {isActive && (
                      <Badge variant="default" className="text-sm animate-pulse-gentle" data-testid="badge-current-step">
                        {t("orderDetail.inProgress")}
                      </Badge>
                    )}
                    {isCompleted && idx === steps.length - 1 && isTerminal && (
                      <Badge variant="secondary" className="text-sm" data-testid="badge-complete-step">
                        {t("common.done")}
                      </Badge>
                    )}
                  </div>
                  <p className={`text-base mt-1 ${isCompleted || isActive ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    {step.description}
                  </p>
                  {stepTime && (
                    <p className="text-sm text-muted-foreground/80 mt-1.5 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {stepTime}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function QRPickupScreen({
  order,
  patientName,
  onClose,
}: {
  order: OrderWithItems;
  patientName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="modal-qr-pickup"
    >
      <Card className="w-full max-w-md">
        <CardContent className="p-6 flex flex-col items-center gap-5">
          <div className="flex items-center justify-between gap-2 w-full flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <QrCode className="h-6 w-6 text-primary" />
              {t("orderDetail.pickupQRCode")}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              data-testid="button-close-qr"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="bg-white p-4 rounded-md" data-testid="qr-container">
            {order.qrCode && (
              <img
                src={order.qrCode}
                alt={t("orderDetail.pickupQRCode")}
                className="w-64 h-64"
                data-testid="img-pickup-qr"
              />
            )}
          </div>

          <div className="text-center space-y-2 w-full">
            <p className="text-2xl font-bold" data-testid="text-qr-patient-name">
              {patientName}
            </p>
            {order.pickupSlot && (
              <Badge variant="secondary" className="text-lg px-4 py-1" data-testid="badge-qr-slot">
                {order.pickupSlot}
              </Badge>
            )}
          </div>

          <div className="bg-muted/50 rounded-md p-4 w-full text-center">
            <p className="text-lg text-muted-foreground">
              {t("orderDetail.showQRCodeDesc")}
            </p>
          </div>

          <Badge variant="outline" className="text-base" data-testid="badge-order-id">
            {`${t("orderDetail.orderDetails").split(" ")[0]} #${order.id}`}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}

const PHARMACY_PHONE = "(718) 328-2833";

function CancelConfirmationModal({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", pUrl(`/api/orders/${orderId}/cancel`));
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders"), orderId] });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
      toast(data.pharmFlowCancellationStatus === "confirmed"
        ? { title: t("orderDetail.cancellation.confirmedTitle"), description: t("orderDetail.cancellation.confirmedDescription") }
        : { title: t("orderDetail.orderCancelledToast"), description: t("orderDetail.orderCancelledToastDesc") });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: t("orderDetail.cannotCancel"), description: error.message, variant: "destructive" });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="modal-cancel-confirm">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <Ban className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">{t("orderDetail.cancelOrderConfirm")}</h2>
            <p className="text-lg text-muted-foreground">
              {t("orderDetail.cancelOrderDesc", { id: orderId })}
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <Button
              variant="destructive"
              size="lg"
              className="w-full text-lg"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? t("common.cancelling") : t("orderDetail.yesCancelOrder")}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full text-lg"
              onClick={onClose}
              disabled={cancelMutation.isPending}
              data-testid="button-keep-order"
            >
              {t("orderDetail.noKeepOrder")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptViewModal({
  receiptData,
  onClose,
}: {
  receiptData: { label: string; imageData: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isPdf = receiptData.imageData.startsWith("data:application/pdf");

  const handleDownload = () => {
    const ext = isPdf ? "pdf" : "svg";
    const mimeType = isPdf ? "application/pdf" : "image/svg+xml";
    const base64Data = receiptData.imageData.split(",")[1];
    if (!base64Data) return;
    const byteChars = atob(base64Data);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${receiptData.label.replace(/[^a-z0-9_\-. ]/gi, "_")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    const ext = isPdf ? "pdf" : "svg";
    const mimeType = isPdf ? "application/pdf" : "image/svg+xml";
    if (navigator.share) {
      try {
        const response = await fetch(receiptData.imageData);
        const blob = await response.blob();
        const file = new File([blob], `receipt.${ext}`, { type: mimeType });
        await navigator.share({ title: receiptData.label, files: [file] });
        return;
      } catch {
        // fall through to download
      }
    }
    handleDownload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="modal-receipt-view">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col">
        <CardContent className="p-5 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{t("orderDetail.receipt")}</h2>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-receipt">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{receiptData.label}</p>
          {isPdf ? (
            <div className="flex flex-col gap-3">
              <p className="text-base text-muted-foreground">
                Your signed delivery receipt PDF is ready. Use the button below to download it.
              </p>
              <Button
                onClick={handleDownload}
                className="w-full text-lg"
                data-testid="button-download-receipt"
              >
                <Check className="h-5 w-5 mr-2" />
                Download PDF Receipt
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-md p-2 overflow-auto">
              <img
                src={receiptData.imageData}
                alt={t("orderDetail.receipt")}
                className="w-full"
                data-testid="img-receipt"
              />
            </div>
          )}
          <Button onClick={handleShare} variant={isPdf ? "outline" : "default"} className="w-full text-lg" data-testid="button-share-receipt">
            <Share2 className="h-5 w-5 mr-2" />
            {t("orderDetail.shareReceipt")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OrderDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const [showQR, setShowQR] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [receiptResult, setReceiptResult] = useState<{ label: string; imageData: string } | null>(null);
  const [readyElapsed, setReadyElapsed] = useState(false);

  const { data: orderData, isLoading, isError } = useQuery<OrderWithItems>({
    queryKey: [pUrl("/api/orders"), orderId],
    queryFn: async () => {
      const res = await fetch(pUrl(`/api/orders/${orderId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!orderId && !!user,
    refetchInterval: 10000,
  });

  const {
    data: staffTracking,
    refetch: refetchStaff,
    isFetching: isStaffFetching,
    isLoading: isStaffLoading,
    dataUpdatedAt: staffUpdatedAt,
  } = useQuery<{
    available: boolean;
    status?: string;
    statusLabel?: string;
    fulfillmentType?: string;
    collectAmount?: number;
    finalBill?: number | null;
  }>({
    queryKey: [pUrl("/api/orders"), orderId, "staff-tracking"],
    queryFn: async () => {
      const res = await fetch(pUrl(`/api/orders/${orderId}/staff-tracking`), { credentials: "include" });
      if (!res.ok) return { available: false };
      return res.json();
    },
    enabled: !!orderId && !!user && orderData?.orderType === "otc",
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const {
    data: pharmflowTracking,
    refetch: refetchPharmflow,
    isFetching: isPharmflowFetching,
    isLoading: isPharmflowLoading,
  } = useQuery<{
    available: boolean;
    status?: string;
    statusLabel?: string;
    lastUpdated?: string;
  }>({
    queryKey: [pUrl("/api/orders"), orderId, "pharmflow-tracking"],
    queryFn: async () => {
      const res = await fetch(pUrl(`/api/orders/${orderId}/pharmflow-tracking`), { credentials: "include" });
      if (!res.ok) return { available: false };
      return res.json();
    },
    enabled: !!orderId && !!user && (orderData?.orderType === "rx_refill" || orderData?.orderType === "blister_pack"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: allOrders } = useQuery<Order[]>({
    queryKey: [pUrl("/api/orders")],
    enabled: !!user,
    staleTime: 10000,
  });

  const { data: documents = [] } = useQuery<Array<{ id: number; type: string; label: string; imageData: string }>>({
    queryKey: [pUrl("/api/documents")],
    enabled: !!user,
  });

  const hasDeliveryReceipt = orderId != null && documents.some(
    (doc) => doc.type === "receipt" && doc.label.includes(`Order #${orderId}`)
  );

  const confirmReceiptMutation = useMutation({
    mutationFn: async (data: SignatureConfirmData) => {
      const res = await apiRequest("POST", pUrl(`/api/orders/${orderId}/confirm-receipt`), {
        signatureData: data.signatureData,
        ...(data.recipientName && { recipientName: data.recipientName }),
        ...(data.recipientRelationship && { recipientRelationship: data.recipientRelationship }),
      }, { "Idempotency-Key": getIdempotencyKey(`order-confirm-receipt:${orderId}`) });
      return res.json();
    },
    onSuccess: (data: any) => {
      clearIdempotencyKey(`order-confirm-receipt:${orderId}`);
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders"), orderId] });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/documents")] });
      setShowSignature(false);
      if (data.receipt) {
        setReceiptResult({ label: data.receipt.label, imageData: data.receipt.imageData });
      }
      toast({
        title: t("orderDetail.packageReceived"),
        description: t("orderDetail.receiptSaved"),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!orderData || orderData.status !== "ready") {
      setReadyElapsed(false);
      return;
    }

    const readySince = orderData.updatedAt
      ? new Date(orderData.updatedAt).getTime()
      : Date.now();

    const elapsed = Date.now() - readySince;
    const twentyMin = 20 * 60 * 1000;

    if (elapsed >= twentyMin) {
      setReadyElapsed(true);
    } else {
      const timer = setTimeout(() => setReadyElapsed(true), twentyMin - elapsed);
      return () => clearTimeout(timer);
    }
  }, [orderData?.status, orderId, orderData?.updatedAt]);

  const patientName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || t("profile.patient")
    : t("profile.patient");

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" asChild data-testid="button-back-orders">
            <Link href="/orders">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{t("orderDetail.orderDetails")}</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-orange-600 dark:text-orange-400" />
            <p className="text-xl font-semibold">{t("orderDetail.unableToLoadOrder")}</p>
            <p className="text-lg text-muted-foreground">
              {t("orderDetail.orderNotFoundDesc")}
            </p>
            <Button size="lg" className="text-lg" asChild data-testid="button-go-back">
              <Link href="/orders">{t("orderDetail.goBackToOrders")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !orderData) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const isPickup = orderData.deliveryMethod !== "delivery";
  const isOtcOrder = orderData.orderType === "otc";
  const staffCheckoutStatus = orderData.staffCheckoutStatus ?? null;
  const hasLegacyStaffIntakeReference = isOtcOrder && !staffCheckoutStatus && !!orderData.staffPanelOrderNumber;
  const staffCheckoutNeedsManualReview = isOtcOrder && (
    staffCheckoutStatus === "pending" ||
    staffCheckoutStatus === "unconfirmed" ||
    staffCheckoutStatus === "rejected" ||
    hasLegacyStaffIntakeReference
  );
  const isReady = orderData.status === "ready" && !staffCheckoutNeedsManualReview;
  const isDelivered = !staffCheckoutNeedsManualReview && !isPickup && orderData.status === "delivered";
  const isComplete = !staffCheckoutNeedsManualReview && orderData.status === "picked_up";

  const CROSS_ACTIVE = ["pending", "received", "preparing", "verified", "ready"];
  const relatedActiveOrders = (allOrders ?? []).filter((o) => {
    if (o.id === orderId) return false;
    if (!o.status || !CROSS_ACTIVE.includes(o.status)) return false;
    const currentIsOtc = orderData.orderType === "otc";
    const otherIsOtc = o.orderType === "otc";
    return currentIsOtc !== otherIsOtc;
  });
  const relatedCount = relatedActiveOrders.length;
  const relatedTypeLabel = relatedCount > 0
    ? (relatedActiveOrders[0].orderType === "otc" ? "OTC" : "prescription")
    : "";

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" asChild data-testid="button-back-orders">
          <Link href="/orders">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold" data-testid="text-order-detail-title">
            {(orderData as any).orderNumber
              ? (orderData as any).orderNumber
              : `${t("orderDetail.orderDetails").split(" ")[0]} #${orderData.id}`}
          </h1>
          {(orderData as any).staffPanelOrderNumber && (
            <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-staff-order-number">
              {t("orderDetail.pharmacyRef")} <span className="font-medium">{(orderData as any).staffPanelOrderNumber}</span>
            </p>
          )}
          <p className="text-base text-muted-foreground" data-testid="text-order-type-friendly">
            {friendlyOrderType(orderData.orderType, t)}
          </p>
        </div>
      </div>

      {isOtcOrder && staffCheckoutStatus && (
        <Card
          className={staffCheckoutStatus === "confirmed"
            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/25"
            : staffCheckoutStatus === "rejected"
              ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/25"
              : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/25"
          }
          data-testid="card-staff-checkout-state"
          role="status"
        >
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-3">
              {staffCheckoutStatus === "confirmed"
                ? <CheckCircle2 className="h-6 w-6 shrink-0 text-green-700 dark:text-green-400" />
                : <AlertTriangle className="h-6 w-6 shrink-0 text-amber-700 dark:text-amber-400" />}
              <h2 className="text-lg font-semibold" data-testid="text-staff-checkout-state">
                {staffCheckoutStatus === "confirmed" ? "Order received; stock reserved."
                  : staffCheckoutStatus === "pending" ? "Order saved — delivery is retrying"
                      : staffCheckoutStatus === "unconfirmed"
                        ? orderData.staffPanelOrderNumber
                          ? "Order reference received — reservation unverified"
                          : "Checkout status unconfirmed"
                      : "Staff did not accept this order"}
              </h2>
            </div>
            {staffCheckoutStatus === "confirmed" ? (
              <p className="text-sm text-muted-foreground">
                This confirms stock reservation only. It is not pharmacist approval or a promised pickup or delivery time. Payment has not been collected in this app; the pharmacy will confirm payment arrangements.
              </p>
            ) : staffCheckoutStatus === "pending" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This order is saved while Staff retries delivery. Stock reservation is not confirmed. Do not submit it again.
                </p>
                <p className="text-sm text-muted-foreground">
                  Any cancellation, refund, or restocking outcome is unconfirmed; contact the pharmacy for help.
                </p>
              </>
            ) : staffCheckoutStatus === "unconfirmed" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {orderData.staffPanelOrderNumber
                    ? "The pharmacy received a reference, but stock reservation could not be verified. Manual confirmation is needed. Do not submit it again."
                    : "Checkout is unconfirmed. Stock reservation could not be verified, so manual confirmation is needed. Do not submit it again."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cancellation, refund, and restocking are not confirmed; contact the pharmacy before relying on any of those outcomes.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No stock was reserved. {STAFF_CHECKOUT_ERROR_MESSAGES[orderData.staffCheckoutError ?? ""] ?? "The pharmacy could not accept this request."}
                </p>
                <p className="text-sm text-muted-foreground">
                  No payment was collected in this app. Contact the pharmacy if you need help with cancellation or stock questions.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {hasLegacyStaffIntakeReference && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/25" data-testid="card-legacy-staff-intake">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-lg font-semibold">Pharmacy intake reference received</h2>
            <p className="text-sm text-muted-foreground">
              This legacy reference confirms intake only; stock was not confirmed or reserved. Contact the pharmacy for a manual update. Do not assume cancellation, refund, or restocking has been completed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* OTC: Staff App live status */}
      {orderData.orderType === "otc" && !staffCheckoutNeedsManualReview && (
        isStaffLoading ? (
          <Card data-testid="skeleton-staff-status">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="w-14 h-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-6 w-40" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : staffTracking?.available && staffTracking.statusLabel ? (
          <Card className="border-green-200 dark:border-green-800" data-testid="card-staff-panel-status">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-green-100/50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                  <CircleDot className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="text-staff-status-label-heading">
                    {t("orderDetail.livePharmacyStatus")}
                  </p>
                  <p className="text-lg font-semibold text-green-700 dark:text-green-300 leading-tight" data-testid="text-staff-status-label">
                    {staffTracking.statusLabel}
                  </p>
                  {staffUpdatedAt > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-staff-last-synced">
                      Synced {new Date(staffUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  )}
                  {staffTracking.finalBill != null && (
                    <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-staff-final-bill">
                      Total: ${Number(staffTracking.finalBill).toFixed(2)}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => refetchStaff()}
                  disabled={isStaffFetching}
                  data-testid="button-refresh-staff"
                >
                  <RefreshCw className={`h-4 w-4 ${isStaffFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : staffTracking && !staffTracking.available ? (
          <Card className="border-muted" data-testid="card-staff-unavailable">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 text-muted-foreground">
                <CircleDot className="h-5 w-5 shrink-0" />
                <p className="text-sm flex-1">Live pharmacy status unavailable</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => refetchStaff()}
                  disabled={isStaffFetching}
                  data-testid="button-refresh-staff-unavailable"
                >
                  <RefreshCw className={`h-4 w-4 ${isStaffFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null
      )}

      {/* RX/Blister: pharmacy submission confirmation */}
      <OrderCancellationStatus order={orderData} />
      <RefillSubmissionStatus order={orderData} />
      <StaffSubmissionStatus order={orderData} />
      {(orderData.orderType === "rx_refill" || orderData.orderType === "blister_pack") && (orderData as any).pharmFlowSubmitted && (
        <Card className="border-green-200 dark:border-green-800" data-testid="card-sent-to-pharmacy">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100/60 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400" data-testid="text-sent-to-pharmacy-label">
                  {t("orders.sentToPharmacy")}
                </p>
                {(orderData as any).pharmFlowSubmittedAt && (
                  <p className="text-xs text-muted-foreground" data-testid="text-sent-to-pharmacy-time">
                    {t("orders.pharmFlowSubmittedAt", {
                      time: new Date((orderData as any).pharmFlowSubmittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                    })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RX/Blister: PharmFlow live status */}
      {(orderData.orderType === "rx_refill" || orderData.orderType === "blister_pack") && (
        isPharmflowLoading ? (
          <Card data-testid="skeleton-pharmflow-status">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="w-14 h-14 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-6 w-40" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : pharmflowTracking?.available && pharmflowTracking.statusLabel ? (
          <Card className="border-purple-200 dark:border-purple-800" data-testid="card-pharmflow-status">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-100/50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                  <Pill className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="text-pharmflow-status-heading">
                    Live Pharmacy Status
                  </p>
                  <p className="text-lg font-semibold text-purple-700 dark:text-purple-300 leading-tight" data-testid="text-pharmflow-status-label">
                    {pharmflowTracking.statusLabel}
                  </p>
                  {pharmflowTracking.lastUpdated && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Synced {new Date(pharmflowTracking.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => refetchPharmflow()}
                  disabled={isPharmflowFetching}
                  data-testid="button-refresh-pharmflow"
                >
                  <RefreshCw className={`h-4 w-4 ${isPharmflowFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : pharmflowTracking && !pharmflowTracking.available ? (
          <Card className="border-muted" data-testid="card-pharmflow-unavailable">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Pill className="h-5 w-5 shrink-0" />
                <p className="text-sm flex-1">Pharmacy status unavailable</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => refetchPharmflow()}
                  disabled={isPharmflowFetching}
                  data-testid="button-refresh-pharmflow-unavailable"
                >
                  <RefreshCw className={`h-4 w-4 ${isPharmflowFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null
      )}

      {!isComplete && !isDelivered && orderData.estimatedReadyTime &&
        !(isOtcOrder && (staffCheckoutStatus !== null || hasLegacyStaffIntakeReference)) && (
        <Card className="border-primary/20" data-testid="card-estimated-time">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 animate-pulse-gentle"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.2))",
                }}
              >
                <Timer className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {isPickup ? t("orderDetail.estimatedReady") : t("orderDetail.estimatedDelivery")}
                </p>
                <p className="text-3xl font-bold text-primary tracking-tight" data-testid="text-estimated-time">
                  {orderData.estimatedReadyTime}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/20" data-testid="card-order-complete-banner">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              <PackageCheck className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-order-complete">
                {t("orderDetail.orderPickedUp")}
              </p>
              <p className="text-base text-muted-foreground">
                {t("orderDetail.pickedUpThankYou")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isDelivered && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" data-testid="card-delivery-arrived-banner">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Truck className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300" data-testid="text-delivery-arrived">
                Package Arrived
              </p>
              <p className="text-base text-muted-foreground">
                Please confirm receipt with your signature to complete the delivery.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!(isOtcOrder && (staffCheckoutStatus !== null || hasLegacyStaffIntakeReference)) && (
        <VerticalTimeline
          status={orderData.status}
          createdAt={orderData.createdAt}
          deliveryMethod={orderData.deliveryMethod}
          statusHistory={orderData.statusHistory as Array<{ status: string; timestamp: string }> | null}
          orderType={orderData.orderType}
        />
      )}

      {orderData.verificationStatus && orderData.verificationStatus !== "verified" && !isComplete && (
        <Card
          className={orderData.verificationStatus === "rejected"
            ? "border-red-300 bg-red-50 dark:bg-red-900/20"
            : "border-amber-300 bg-amber-50 dark:bg-amber-900/20"
          }
          data-testid="card-verification-status"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              orderData.verificationStatus === "rejected"
                ? "bg-red-100 dark:bg-red-900/40"
                : "bg-amber-100 dark:bg-amber-900/40"
            }`}>
              {orderData.verificationStatus === "rejected" ? (
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              ) : (
                <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold" data-testid="text-verification-title">
                {orderData.verificationStatus === "rejected"
                  ? t("orderDetail.prescriptionIssue")
                  : t("orderDetail.verificationInProgress")}
              </p>
              <p className="text-base text-muted-foreground" data-testid="text-verification-desc">
                {orderData.verificationStatus === "rejected"
                  ? t("orderDetail.prescriptionIssueDesc")
                  : t("orderDetail.verificationInProgressDesc")}
              </p>
              {orderData.verificationStatus === "rejected" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  asChild
                  data-testid="link-contact-pharmacy-verification"
                >
                  <Link href="/pharmacy-chat">{t("orderDetail.messagePharmacy")}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-order-info">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">{t("orderDetail.orderDetails")}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
              {isPickup ? (
                <Store className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Truck className="h-5 w-5 text-primary shrink-0" />
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t("orderDetail.method")}</p>
                <p className="text-lg font-medium" data-testid="text-delivery-method">
                  {isPickup ? t("orderDetail.pharmacyPickup") : t("orderDetail.homeDelivery")}
                </p>
              </div>
            </div>

            {isPickup && orderData.pickupSlot &&
              !(isOtcOrder && (staffCheckoutStatus !== null || hasLegacyStaffIntakeReference)) && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("orderDetail.pickupLocation")}</p>
                  <p className="text-lg font-medium" data-testid="text-pickup-slot">
                    {orderData.pickupSlot}
                  </p>
                </div>
              </div>
            )}

            {isPickup && (orderData as any).scheduledPickupTime &&
              !(isOtcOrder && (staffCheckoutStatus !== null || hasLegacyStaffIntakeReference)) && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-primary/5 dark:bg-primary/10">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Pickup</p>
                  <p className="text-lg font-bold text-primary" data-testid="text-scheduled-pickup-time">
                    {(orderData as any).scheduledPickupTime}
                  </p>
                </div>
              </div>
            )}

            {orderData.contactPhone && (
              <div className="p-3 rounded-md bg-muted/30 sm:col-span-2">
                <p className="text-sm text-muted-foreground">Pharmacy callback number</p>
                <p className="text-lg font-medium" data-testid="text-order-contact-phone">{orderData.contactPhone}</p>
              </div>
            )}

            {!isPickup && orderData.deliveryAddress && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 sm:col-span-2">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("orderDetail.deliveryAddress")}</p>
                  <p className="text-lg font-medium" data-testid="text-delivery-address">
                    {orderData.deliveryAddress}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
              <Package className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t("orderDetail.orderItems")}</p>
                <p className="text-lg font-medium" data-testid="text-total-items">
                  {orderData.totalItems} {(orderData.totalItems ?? 1) === 1 ? t("common.item") : t("common.items")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm text-muted-foreground">{t("orderDetail.placed")}</p>
                <p className="text-lg font-medium" data-testid="text-order-date">
                  {orderData.createdAt
                    ? new Date(orderData.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : t("home.unknown")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {orderData.items && orderData.items.length > 0 && (
        <Card data-testid="card-order-items">
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-semibold">{t("orderDetail.orderItems")}</h2>
            {orderData.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center justify-between gap-3 p-4 rounded-md bg-muted/30 flex-wrap"
                data-testid={`row-order-item-${item.id || idx}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">{item.productName}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {item.productType === "otc" ? t("orderDetail.overTheCounter") : item.productType === "prescription" ? t("orderDetail.prescription") : item.productType?.replace("_", " ")}
                      {item.isBlisterPack ? ` - ${t("orderDetail.blisterPackLabel")}` : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" data-testid={`badge-qty-${item.id || idx}`}>
                  {t("orderDetail.qty")}: {item.quantity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {relatedCount > 0 && (
        <Card className="border-amber-200 dark:border-amber-800" data-testid="card-related-orders">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                {relatedActiveOrders[0].orderType === "otc" ? (
                  <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Pill className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
              </div>
              <p className="text-base font-semibold" data-testid="text-related-orders-heading">
                You also have {relatedCount} active {relatedTypeLabel} {relatedCount === 1 ? "order" : "orders"} being prepared
              </p>
            </div>
            <div className="space-y-2">
              {relatedActiveOrders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    data-testid={`link-related-order-${o.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {o.orderType === "otc" ? (
                        <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <Pill className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {o.orderType === "otc" ? "OTC Order" : o.orderType === "blister_pack" ? "Blister Pack" : "Prescription Refill"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono" data-testid={`text-related-order-number-${o.id}`}>
                          {(o as any).orderNumber || `#${o.id}`}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-related-orders-note">
              The pharmacy will prepare both orders and hand them off together.
            </p>
          </CardContent>
        </Card>
      )}

      {isPickup && isReady && (
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full text-xl"
            onClick={() => setShowQR(true)}
            data-testid="button-show-pickup-qr"
          >
            <QrCode className="h-6 w-6 mr-3" />
            {t("orderDetail.showQRCode")}
          </Button>

          {readyElapsed && (
            <Button
              size="lg"
              variant="outline"
              className="w-full text-xl border-blue-200 dark:border-blue-800"
              onClick={() => setShowSignature(true)}
              data-testid="button-package-received"
            >
              <FileCheck className="h-6 w-6 mr-3" />
              {t("orderDetail.confirmReceipt")}
            </Button>
          )}
        </div>
      )}

      {isDelivered && !hasDeliveryReceipt && (
        <Button
          size="lg"
          className="w-full text-xl"
          onClick={() => setShowSignature(true)}
          disabled={confirmReceiptMutation.isPending}
          data-testid="button-confirm-delivery-receipt"
        >
          <FileCheck className="h-6 w-6 mr-3" />
          Confirm Delivery Receipt
        </Button>
      )}

      {isPickup && !isReady && !isComplete &&
        !(isOtcOrder && (staffCheckoutStatus !== null || hasLegacyStaffIntakeReference)) && (
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-5 text-center">
            <Clock className="h-8 w-8 mx-auto text-primary mb-3" />
            <p className="text-lg font-medium mb-1">{t("orderDetail.orderBeingProcessed")}</p>
            <p className="text-base text-muted-foreground" data-testid="text-preparing-note">
              {t("orderDetail.qrAvailableWhenReady")}
            </p>
          </CardContent>
        </Card>
      )}

      {!isComplete && orderData.status !== "cancelled" && (
        <Card data-testid="card-order-actions">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-xl font-semibold">{t("orderDetail.needHelp")}</h2>
            {isOtcOrder && staffCheckoutStatus && (
              <p className="text-sm text-muted-foreground" data-testid="text-staff-checkout-contact-guidance">
                In-app cancellation is not available for this pharmacy checkout state. Contact the pharmacy to request or confirm any cancellation, stock release, or restocking.
                {staffCheckoutStatus === "rejected"
                  ? " This order was not accepted and has no reserved stock. Review your cart in the shop and submit a new request if you choose."
                  : ""}
              </p>
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-full text-base"
              asChild
              data-testid="button-call-pharmacy"
            >
              <a href={`tel:${PHARMACY_PHONE.replace(/[^\d]/g, "")}`}>
                <Phone className="h-5 w-5 mr-2 shrink-0" />
                <span className="truncate">{t("orderDetail.callPharmacy")} {PHARMACY_PHONE}</span>
              </a>
            </Button>
            {!(isOtcOrder && staffCheckoutStatus !== null) &&
              orderData.status &&
              ["pending", "preparing", "received"].includes(orderData.status) && (
              <Button
                variant="outline"
                size="lg"
                className="w-full text-lg text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                onClick={() => setShowCancelConfirm(true)}
                data-testid="button-cancel-order"
              >
                <Ban className="h-5 w-5 mr-2" />
                {t("orderDetail.cancelOrder")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {orderData.status === "cancelled" && (
        <Button
          variant="outline"
          size="lg"
          className="w-full text-base"
          asChild
          data-testid="button-call-pharmacy-cancelled"
        >
          <a href={`tel:${PHARMACY_PHONE.replace(/[^\d]/g, "")}`}>
            <Phone className="h-5 w-5 mr-2 shrink-0" />
            <span className="truncate">{t("orderDetail.callPharmacy")} {PHARMACY_PHONE}</span>
          </a>
        </Button>
      )}

      {showQR && (
        <QRPickupScreen
          order={orderData}
          patientName={patientName}
          onClose={() => setShowQR(false)}
        />
      )}

      {showCancelConfirm && orderId && (
        <CancelConfirmationModal
          orderId={orderId}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}

      {showSignature && (
        <SignatureModal
          onConfirm={(data) => confirmReceiptMutation.mutate(data)}
          onCancel={() => setShowSignature(false)}
          isPending={confirmReceiptMutation.isPending}
          isDelivery={isDelivered}
          patientName={patientName}
        />
      )}

      {receiptResult && (
        <ReceiptViewModal
          receiptData={receiptResult}
          onClose={() => setReceiptResult(null)}
        />
      )}
    </div>
  );
}
