export type { PharmacyAlertItem } from "@/lib/pharmacy-alerts";
export { severityBadgeClass } from "@/lib/pharmacy-alerts";

import { type PharmacyAlertItem, severityBadgeClass } from "@/lib/pharmacy-alerts";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface MissedAlertsDialogProps {
  open: boolean;
  alerts: PharmacyAlertItem[];
  onDismiss: () => void;
}

export function MissedAlertsDialog({ open, alerts, onDismiss }: MissedAlertsDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-missed-alerts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t("profile.missedAlertsTitle", "Alerts While You Were Away")}
          </DialogTitle>
          <DialogDescription>
            {t("profile.missedAlertsDesc", "These pharmacy alerts were active while your notifications were off. Please review them.")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72 pr-1">
          <div className="space-y-3 py-1">
            {alerts.map((alert, idx) => (
              <div
                key={alert.id ?? idx}
                className="rounded-md border bg-muted/30 p-3 space-y-1"
                data-testid={`missed-alert-item-${alert.id ?? idx}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug" data-testid={`missed-alert-title-${alert.id ?? idx}`}>
                    {alert.title || t("profile.missedAlertDefaultTitle", "Pharmacy Alert")}
                  </p>
                  {alert.severity && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${severityBadgeClass(alert.severity)}`}
                      data-testid={`missed-alert-severity-${alert.id ?? idx}`}
                    >
                      {alert.severity}
                    </span>
                  )}
                </div>
                {(alert.message || alert.body) && (
                  <p className="text-sm text-muted-foreground" data-testid={`missed-alert-message-${alert.id ?? idx}`}>
                    {alert.message || alert.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button
            onClick={onDismiss}
            className="w-full"
            data-testid="button-dismiss-missed-alerts"
          >
            {t("profile.missedAlertsDismiss", "Got it")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
