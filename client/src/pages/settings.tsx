import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { INACTIVITY_TIMEOUT_KEY } from "@/hooks/use-inactivity-logout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useNotifications } from "@/hooks/use-notifications";
import { useToast } from "@/hooks/use-toast";
import { MissedAlertsDialog, type PharmacyAlertItem } from "@/components/missed-alerts-dialog";
import { severityBadgeClass } from "@/lib/pharmacy-alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressFields } from "@/components/address-fields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Moon,
  Sun,
  Bell,
  BellRing,
  BellOff,
  Mail,
  Timer,
  Truck,
  Shield,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Save,
  Type,
} from "lucide-react";
import { useTextSize } from "@/hooks/use-text-size";

function alertMatchesSeverityThreshold(alert: PharmacyAlertItem, minSeverity: string): boolean {
  const s = (alert.severity ?? "unknown").toLowerCase();
  if (minSeverity === "all") return true;
  if (minSeverity === "urgent_only") return s === "urgent";
  return s === "high" || s === "urgent" || s === "unknown";
}

function formatSnoozeExpiry(snoozeUntilAt: string | null): string | null {
  if (!snoozeUntilAt) return null;
  const until = new Date(snoozeUntilAt);
  const now = new Date();
  if (isNaN(until.getTime()) || until <= now) return null;
  const timeStr = until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isToday =
    until.getFullYear() === now.getFullYear() &&
    until.getMonth() === now.getMonth() &&
    until.getDate() === now.getDate();
  if (isToday) return timeStr;
  const dateStr = until.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} at ${timeStr}`;
}

function AppPreferencesSection() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { size: textSize, setSize: setTextSize } = useTextSize();

  const handleLanguageChange = async (value: string) => {
    i18n.changeLanguage(value);
    try {
      await apiRequest("PATCH", "/api/profile", { language: value });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch {
      toast({ title: t("common.error"), description: t("settings.languageSaveFailed", "Could not save language preference."), variant: "destructive" });
    }
  };

  return (
    <Card data-testid="card-settings-app-preferences">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
          <Globe className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-xl">{t("settings.appPreferences")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-base font-medium text-muted-foreground">
            {t("settings.languageLabel")}
          </label>
          <Select
            value={i18n.language?.startsWith("es") ? "es" : "en"}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger className="text-lg min-h-[48px]" data-testid="select-settings-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en" data-testid="select-settings-language-en">{t("settings.english")}</SelectItem>
              <SelectItem value="es" data-testid="select-settings-language-es">{t("settings.spanish")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 min-h-[56px] py-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
              {theme === "dark" ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <p className="text-base font-medium">{t("settings.lightMode")}</p>
              <p className="text-sm text-muted-foreground">{t("settings.lightModeDesc")}</p>
            </div>
          </div>
          <div className="flex items-center min-h-[48px] px-1">
            <Switch
              checked={theme === "light"}
              onCheckedChange={toggleTheme}
              data-testid="switch-settings-theme"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
              <Type className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-base font-medium">{t("settings.textSize")}</p>
              <p className="text-sm text-muted-foreground">{t("settings.textSizeDesc")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(["normal", "large", "xl"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setTextSize(s)}
                className={`flex-1 min-h-[52px] rounded-lg border font-medium transition-colors ${
                  textSize === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-border"
                }`}
                data-testid={`button-text-size-${s}`}
              >
                {s === "normal"
                  ? t("settings.textSizeNormal")
                  : s === "large"
                  ? t("settings.textSizeLarge")
                  : t("settings.textSizeXL")}
              </button>
            ))}
          </div>
          <p
            className="text-muted-foreground rounded-md bg-muted/50 px-3 py-2 leading-snug"
            data-testid="text-settings-size-preview"
          >
            {t("settings.textSizePreview")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [missedAlerts, setMissedAlerts] = useState<PharmacyAlertItem[]>([]);
  const [showMissedDialog, setShowMissedDialog] = useState(false);
  const [wasReenabled, setWasReenabled] = useState(false);
  const [severityPreview, setSeverityPreview] = useState<{ filteredCount: number; severity: string; filteredAlerts: PharmacyAlertItem[] } | null>(null);
  const [severityPreviewExpanded, setSeverityPreviewExpanded] = useState(false);

  const { supported: notifSupported, permission: notifPermission, requestPermission } = useNotifications();

  const { data: prefs, isLoading } = useQuery<{
    pharmacyAlertsEnabled: boolean;
    emailNotificationsEnabled: boolean;
    pharmacyAlertMinSeverity: string;
    snoozeUntilAt: string | null;
    inactivityThresholdHours: number;
  }>({
    queryKey: ["/api/notification-preferences"],
    refetchInterval: (query) => {
      const snoozeUntilAt = query.state.data?.snoozeUntilAt ?? null;
      const isSnoozed = !!snoozeUntilAt && new Date(snoozeUntilAt) > new Date();
      return isSnoozed ? 30_000 : false;
    },
  });

  const { data: pharmacyAlerts = [] } = useQuery<PharmacyAlertItem[]>({
    queryKey: ["/api/pharmacy-alerts"],
  });

  useEffect(() => {
    if (!prefs || pharmacyAlerts.length === 0) return;
    const savedSeverity = prefs.pharmacyAlertMinSeverity ?? "high_and_urgent";
    if (savedSeverity === "all") {
      setSeverityPreview(null);
      return;
    }
    const filteredAlerts = pharmacyAlerts.filter((a) => !alertMatchesSeverityThreshold(a, savedSeverity));
    if (filteredAlerts.length === 0) {
      setSeverityPreview(null);
      return;
    }
    setSeverityPreview({ filteredCount: filteredAlerts.length, severity: savedSeverity, filteredAlerts });
  }, [prefs, pharmacyAlerts]);

  const updateMutation = useMutation({
    mutationFn: async (updates: { pharmacyAlertsEnabled: boolean; emailNotificationsEnabled?: boolean; pharmacyAlertMinSeverity: string; inactivityThresholdHours?: number }) => {
      const res = await apiRequest("PATCH", "/api/notification-preferences", updates);
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
      if (wasReenabled) {
        setWasReenabled(false);
        try {
          const res = await apiRequest("GET", "/api/pharmacy-alerts");
          const alerts = await res.json();
          if (Array.isArray(alerts) && alerts.length > 0) {
            setMissedAlerts(alerts);
            setShowMissedDialog(true);
          }
        } catch (err) {
          console.warn("[Settings] Could not fetch missed pharmacy alerts:", err instanceof Error ? err.message : err);
        }
      }
    },
    onError: () => {
      setWasReenabled(false);
      toast({ title: t("common.error"), description: t("settings.prefsSaveFailed", "Failed to save preferences."), variant: "destructive" });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (duration: "1h" | "4h" | "24h" | null) => {
      const res = await apiRequest("POST", "/api/notification-preferences/snooze", { duration });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-preferences"] });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.snoozeFailed", "Failed to update snooze setting."), variant: "destructive" });
    },
  });

  const enabled = prefs?.pharmacyAlertsEnabled ?? true;
  const emailEnabled = prefs?.emailNotificationsEnabled ?? false;
  const minSeverity = prefs?.pharmacyAlertMinSeverity ?? "high_and_urgent";
  const snoozeUntilAt = prefs?.snoozeUntilAt ?? null;
  const isSnoozed = !!snoozeUntilAt && new Date(snoozeUntilAt) > new Date();
  const snoozeExpiryTime = formatSnoozeExpiry(snoozeUntilAt);
  const inactivityThreshold = prefs?.inactivityThresholdHours ?? 24;

  const handleToggle = (checked: boolean) => {
    if (checked && !enabled) setWasReenabled(true);
    updateMutation.mutate({ pharmacyAlertsEnabled: checked, pharmacyAlertMinSeverity: minSeverity });
  };

  const handleSeverityChange = (value: string) => {
    const filteredAlerts = pharmacyAlerts.filter((a) => !alertMatchesSeverityThreshold(a, value));
    setSeverityPreview({ filteredCount: filteredAlerts.length, severity: value, filteredAlerts });
    setSeverityPreviewExpanded(false);
    updateMutation.mutate({ pharmacyAlertsEnabled: enabled, pharmacyAlertMinSeverity: value });
  };

  const handleThresholdChange = (value: string) => {
    const hours = parseInt(value, 10);
    updateMutation.mutate({ pharmacyAlertsEnabled: enabled, pharmacyAlertMinSeverity: minSeverity, inactivityThresholdHours: hours });
  };

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      toast({ title: t("settings.notificationsEnabled"), description: t("settings.notificationsEnabledDesc") });
    }
  };

  return (
    <>
      <Card id="notifications" data-testid="card-settings-notifications">
        <CardHeader className="flex flex-row items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-rose-100/50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          </div>
          <CardTitle className="text-xl">{t("settings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 min-h-[56px]">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="text-base font-medium">Email order updates</p>
                <p className="text-sm text-muted-foreground">Receive private, medication-free status notices by email.</p>
              </div>
            </div>
            <Switch
              checked={emailEnabled}
              onCheckedChange={(checked) => updateMutation.mutate({
                pharmacyAlertsEnabled: enabled,
                emailNotificationsEnabled: checked,
                pharmacyAlertMinSeverity: minSeverity,
              })}
              data-testid="switch-settings-email-notifications"
            />
          </div>
          <div>
            <p className="text-base font-medium text-muted-foreground mb-2">{t("settings.deviceNotifications")}</p>
            {!notifSupported && (
              <div
                className="flex items-start gap-3 rounded-md border bg-muted/30 p-3"
                data-testid="banner-settings-notif-unsupported"
              >
                <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-medium">{t("settings.notificationsNotSupported")}</p>
                  <p className="text-sm text-muted-foreground">{t("settings.notificationsNotSupportedDesc")}</p>
                </div>
              </div>
            )}
            {notifSupported && notifPermission === "denied" && (
              <div
                className="flex flex-col gap-3 rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3"
                data-testid="banner-settings-notif-denied"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-base font-semibold text-orange-700 dark:text-orange-400">{t("settings.notificationsDenied")}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{t("settings.notificationsDeniedDesc")}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="min-h-[48px] text-base border-orange-300 text-orange-800 dark:border-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                  onClick={() => toast({
                    title: t("settings.notificationsDeniedHowTo"),
                    description: t("settings.notificationsDeniedHowToDesc"),
                    duration: 9000,
                  })}
                  data-testid="button-settings-enable-notif-denied"
                >
                  {t("settings.notificationsDeniedAction")}
                </Button>
              </div>
            )}
            {notifSupported && notifPermission === "granted" && (
              <div
                className="flex items-center gap-2 text-green-600 dark:text-green-400"
                data-testid="banner-settings-notif-granted"
              >
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-base font-medium">{t("settings.notificationsGranted")}</p>
              </div>
            )}
            {notifSupported && notifPermission === "default" && (
              <div
                className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 dark:bg-primary/10 p-3"
                data-testid="banner-settings-notif-default"
              >
                <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <BellRing className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">{t("settings.enableNotifications")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("settings.enableNotificationsDesc")}</p>
                  <Button
                    size="lg"
                    className="mt-3"
                    onClick={handleEnableNotifications}
                    data-testid="button-settings-enable-notifications"
                  >
                    <BellRing className="h-4 w-4 mr-2" />
                    {t("settings.enableNotificationsButton")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-base font-medium text-muted-foreground">{t("settings.pharmacyAlertPrefs")}</p>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 min-h-[56px] py-1">
                  <div>
                    <p className="text-base font-medium">{t("settings.pharmacyAlerts")}</p>
                    <p className="text-sm text-muted-foreground">{t("settings.pharmacyAlertsDesc")}</p>
                  </div>
                  <div className="flex items-center min-h-[48px] px-1">
                    <Switch
                      checked={enabled}
                      onCheckedChange={handleToggle}
                      disabled={updateMutation.isPending}
                      data-testid="switch-settings-pharmacy-alerts"
                    />
                  </div>
                </div>

                {enabled && (
                  <>
                    {isSnoozed ? (
                      <div
                        className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-3 py-2.5"
                        data-testid="banner-settings-snooze-active"
                      >
                        <div className="flex items-center gap-2">
                          <BellOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div>
                            <p className="text-base font-medium text-amber-800 dark:text-amber-300">
                              {t("settings.snoozedLabel")}
                            </p>
                            {snoozeExpiryTime && (
                              <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="text-settings-snooze-expiry">
                                {t("settings.snoozedUntil", { time: snoozeExpiryTime })}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="min-h-[48px] border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/30"
                          onClick={() => snoozeMutation.mutate(null)}
                          disabled={snoozeMutation.isPending}
                          data-testid="button-settings-snooze-resume"
                        >
                          {t("settings.snoozeResume")}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-base font-medium flex items-center gap-1.5">
                          <Timer className="h-4 w-4 text-muted-foreground" />
                          {t("settings.snoozeAlerts")}
                        </p>
                        <div className="flex flex-wrap gap-2" data-testid="settings-snooze-options">
                          <Button
                            variant="outline"
                            className="min-h-[48px] text-base"
                            onClick={() => snoozeMutation.mutate("1h")}
                            disabled={snoozeMutation.isPending}
                            data-testid="button-settings-snooze-1h"
                          >
                            {t("settings.snooze1h")}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-[48px] text-base"
                            onClick={() => snoozeMutation.mutate("4h")}
                            disabled={snoozeMutation.isPending}
                            data-testid="button-settings-snooze-4h"
                          >
                            {t("settings.snooze4h")}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-[48px] text-base"
                            onClick={() => snoozeMutation.mutate("24h")}
                            disabled={snoozeMutation.isPending}
                            data-testid="button-settings-snooze-24h"
                          >
                            {t("settings.snooze24h")}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-base font-medium">{t("settings.alertSeverityLevel")}</p>
                      <Select value={minSeverity} onValueChange={handleSeverityChange} disabled={updateMutation.isPending}>
                        <SelectTrigger data-testid="select-settings-alert-severity" className="w-full min-h-[48px] text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" data-testid="select-item-severity-all">{t("settings.severityAll")}</SelectItem>
                          <SelectItem value="high_and_urgent" data-testid="select-item-severity-high-urgent">{t("settings.severityHighAndUrgent")}</SelectItem>
                          <SelectItem value="urgent_only" data-testid="select-item-severity-urgent">{t("settings.severityUrgentOnly")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {minSeverity === "all" && t("settings.severityAllDesc")}
                        {minSeverity === "high_and_urgent" && t("settings.severityHighAndUrgentDesc")}
                        {minSeverity === "urgent_only" && t("settings.severityUrgentOnlyDesc")}
                      </p>
                      {severityPreview && severityPreview.severity === minSeverity && severityPreview.filteredCount > 0 && (
                        <div
                          className="text-xs text-amber-600 dark:text-amber-400 space-y-1"
                          data-testid="text-settings-severity-preview"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Info className="h-3 w-3 shrink-0" />
                              {severityPreview.filteredCount === 1
                                ? t("settings.severityPreviewOne")
                                : t("settings.severityPreviewMany", { count: severityPreview.filteredCount })}
                            </span>
                            <button
                              type="button"
                              className="underline underline-offset-2 text-amber-600 dark:text-amber-400 font-medium"
                              onClick={() => setSeverityPreviewExpanded((v) => !v)}
                              data-testid="button-severity-preview-toggle"
                            >
                              {severityPreviewExpanded
                                ? t("settings.severityPreviewHide")
                                : t("settings.severityPreviewShow")}
                            </button>
                          </div>
                          {severityPreviewExpanded && (
                            <ul
                              className="mt-1 space-y-1 pl-1"
                              data-testid="list-severity-preview-alerts"
                            >
                              {severityPreview.filteredAlerts.slice(0, 5).map((alert, idx) => (
                                <li
                                  key={alert.id ?? idx}
                                  className="flex items-center gap-2"
                                  data-testid={`item-severity-preview-alert-${alert.id ?? idx}`}
                                >
                                  <Badge
                                    className={`text-xs px-1.5 py-0 capitalize shrink-0 ${severityBadgeClass(alert.severity)}`}
                                    data-testid={`badge-severity-preview-${alert.id ?? idx}`}
                                  >
                                    {alert.severity ?? t("settings.severityUnknown")}
                                  </Badge>
                                  <span className="truncate text-foreground/80">
                                    {alert.title || alert.message || alert.body || "—"}
                                  </span>
                                </li>
                              ))}
                              {severityPreview.filteredCount > 5 && (
                                <li
                                  className="text-amber-600/70 dark:text-amber-400/70 pl-1"
                                  data-testid="text-severity-preview-more"
                                >
                                  {t("settings.severityPreviewAndMore", { count: severityPreview.filteredCount - 5 })}
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-base font-medium">{t("settings.inactivityThreshold")}</p>
                      <p className="text-sm text-muted-foreground">{t("settings.inactivityThresholdDesc")}</p>
                      <Select value={String(inactivityThreshold)} onValueChange={handleThresholdChange} disabled={updateMutation.isPending}>
                        <SelectTrigger data-testid="select-settings-inactivity-threshold" className="w-full min-h-[48px] text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2" data-testid="select-item-threshold-2h">{t("settings.threshold2h")}</SelectItem>
                          <SelectItem value="4" data-testid="select-item-threshold-4h">{t("settings.threshold4h")}</SelectItem>
                          <SelectItem value="8" data-testid="select-item-threshold-8h">{t("settings.threshold8h")}</SelectItem>
                          <SelectItem value="12" data-testid="select-item-threshold-12h">{t("settings.threshold12h")}</SelectItem>
                          <SelectItem value="24" data-testid="select-item-threshold-24h">{t("settings.threshold24h")}</SelectItem>
                          <SelectItem value="48" data-testid="select-item-threshold-48h">{t("settings.threshold48h")}</SelectItem>
                          <SelectItem value="72" data-testid="select-item-threshold-72h">{t("settings.threshold72h")}</SelectItem>
                          <SelectItem value="168" data-testid="select-item-threshold-168h">{t("settings.threshold168h")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <MissedAlertsDialog
        open={showMissedDialog}
        alerts={missedAlerts}
        onDismiss={() => { setShowMissedDialog(false); setMissedAlerts([]); }}
      />
    </>
  );
}

function DeliveryPreferencesSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [address, setAddress] = useState(user?.deliveryAddress || "");
  const [method, setMethod] = useState(user?.preferredDeliveryMethod || "pickup");

  const saveMutation = useMutation({
    mutationFn: async (data: { deliveryAddress: string; preferredDeliveryMethod: string }) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: t("settings.deliverySaved"), description: t("settings.deliverySavedDesc") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.deliverySaveFailed"), variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-settings-delivery">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-green-100/50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
          <Truck className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-xl">{t("settings.deliveryPreferences")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <AddressFields
          value={address}
          onChange={setAddress}
          disabled={saveMutation.isPending}
        />
        <div className="space-y-1.5">
          <label className="text-base font-medium text-muted-foreground">
            {t("settings.preferredDeliveryMethod")}
          </label>
          <div className="flex gap-3">
            <Button
              variant={method === "pickup" ? "default" : "outline"}
              size="lg"
              className="flex-1 text-lg"
              onClick={() => setMethod("pickup")}
              data-testid="button-settings-pref-pickup"
            >
              {t("settings.pickup")}
            </Button>
            <Button
              variant={method === "delivery" ? "default" : "outline"}
              size="lg"
              className="flex-1 text-lg"
              onClick={() => setMethod("delivery")}
              data-testid="button-settings-pref-delivery"
            >
              {t("settings.delivery")}
            </Button>
          </div>
        </div>
        <Button
          className="w-full min-h-[48px] text-base"
          onClick={() => saveMutation.mutate({ deliveryAddress: address, preferredDeliveryMethod: method })}
          disabled={saveMutation.isPending}
          data-testid="button-settings-save-delivery"
        >
          <Save className="h-5 w-5 mr-2" />
          {saveMutation.isPending ? t("common.saving") : t("settings.saveDelivery")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
  const [timeoutMin, setTimeoutMin] = useState(() => {
    try {
      return localStorage.getItem(INACTIVITY_TIMEOUT_KEY) || "15";
    } catch {
      return "15";
    }
  });

  const handleTimeoutChange = (value: string) => {
    setTimeoutMin(value);
    try {
      localStorage.setItem(INACTIVITY_TIMEOUT_KEY, value);
    } catch {}
  };

  return (
    <Card data-testid="card-settings-privacy">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <CardTitle className="text-xl">{t("settings.privacyAndSecurity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="text-base font-medium">{t("settings.autoLogout")}</p>
          </div>
          <p className="text-base text-muted-foreground">{t("settings.autoLogoutTimeoutLabel")}</p>
          <Select value={timeoutMin} onValueChange={handleTimeoutChange}>
            <SelectTrigger className="min-h-[48px] text-base" data-testid="select-settings-auto-logout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5" data-testid="select-settings-timeout-5">{t("settings.autoLogoutShort")}</SelectItem>
              <SelectItem value="15" data-testid="select-settings-timeout-15">{t("settings.autoLogoutStandard")}</SelectItem>
              <SelectItem value="30" data-testid="select-settings-timeout-30">{t("settings.autoLogoutRelaxed")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("settings.autoLogoutDesc")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AboutSection() {
  const { t } = useTranslation();

  return (
    <Card data-testid="card-settings-about">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
          <Info className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-xl">{t("settings.aboutTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-base font-medium">{t("common.concordiaPharmacy")}</p>
          <p className="text-sm text-muted-foreground" data-testid="text-settings-pharmacy-address">
            {t("settings.pharmacyAddress")}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-settings-pharmacy-hours">
            {t("settings.pharmacyHours")}
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="w-full text-base min-h-[52px]"
          asChild
          data-testid="button-settings-call-pharmacy"
        >
          <a href="tel:7183282833">
            <Phone className="h-5 w-5 mr-2" />
            {t("settings.callPharmacy")} — 718-328-2833
          </a>
        </Button>
        <div className="pt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="text-settings-app-name">{t("settings.appNameVersion", { version: import.meta.env.VITE_APP_VERSION || "1.0" })}</span>
          <Badge variant="outline" className="text-xs" data-testid="badge-settings-hipaa">{t("settings.hipaaCompliant")}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { t } = useTranslation();

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto space-y-6">
      <AppPreferencesSection />
      <NotificationsSection />
      <DeliveryPreferencesSection />
      <PrivacySection />
      <AboutSection />
    </div>
  );
}
