import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SubmissionOrder {
  orderType: string;
  status: string | null;
  pharmFlowSubmitted: boolean | null;
  pharmFlowSubmissionStatus?: string | null;
}

export function RefillSubmissionStatus({ order }: { order: SubmissionOrder }) {
  const { t } = useTranslation();
  if (order.orderType !== "rx_refill" || order.pharmFlowSubmitted ||
    !["pending", "processing", "failed"].includes(order.pharmFlowSubmissionStatus ?? "") ||
    ["cancelled", "picked_up", "delivered"].includes(order.status ?? "")) return null;
  const failed = order.pharmFlowSubmissionStatus === "failed";
  return (
    <Card data-testid="card-pharmacy-submission-pending" role="status">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {failed ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            : <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <div className="space-y-1">
            <p className="font-semibold">{t(failed ? "orders.submissionFailed" : "orders.submissionPending")}</p>
            <p className="text-sm text-muted-foreground">
              {t(failed ? "orders.submissionFailedDescription" : "orders.submissionPendingDescription")}
            </p>
            {failed && <a href="tel:7183282833" className="text-sm underline">{t("common.callPharmacy")}</a>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
