import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface CancellationOrder {
  status: string | null;
  pharmFlowCancellationStatus?: string | null;
  pharmFlowCancellationConfirmedAt?: Date | string | null;
}

export function OrderCancellationStatus({ order }: { order: CancellationOrder }) {
  const { t, i18n } = useTranslation();
  if (order.status !== "cancelled") return null;
  const state = order.pharmFlowCancellationStatus;
  const confirmed = state === "confirmed";
  const pending = state === "pending";
  const key = confirmed ? "confirmed" : pending ? "pending" : state === "failed" ? "failed" : "unknown";
  return (
    <Card role="status" data-testid={`card-cancellation-${key}`}>
      <CardContent className="p-4 flex items-start gap-3">
        {confirmed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          : pending ? <Clock className="h-5 w-5 shrink-0" />
          : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
        <div className="space-y-2">
          <p className="font-semibold">{t(`orderDetail.cancellation.${key}Title`)}</p>
          <p className="text-sm text-muted-foreground">{t(`orderDetail.cancellation.${key}Description`)}</p>
          {confirmed && order.pharmFlowCancellationConfirmedAt && (
            <p className="text-sm text-muted-foreground">{t("orderDetail.cancellation.confirmedAt", {
              time: new Date(order.pharmFlowCancellationConfirmedAt).toLocaleString(i18n.language),
            })}</p>
          )}
          {!confirmed && <a href="tel:7183282833" className="text-sm underline">{t("common.callPharmacy")}</a>}
        </div>
      </CardContent>
    </Card>
  );
}
