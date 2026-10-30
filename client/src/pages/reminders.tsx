import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  BellRing,
  Pill,
  Package,
  ShoppingCart,
  Calendar,
  Plus,
  Trash2,
  Clock,
  RefreshCw,
  Check,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";
import { BellReminder } from "@/components/illustrations";
import { useNotifications } from "@/hooks/use-notifications";
import { useLocation } from "wouter";
import type { Reminder, Notification } from "@shared/schema";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const REMINDER_TYPE_KEYS = [
  { value: "medication", labelKey: "reminders.medication", icon: Pill },
  { value: "refill_alert", labelKey: "reminders.refillAlert", icon: Package },
  { value: "pickup", labelKey: "reminders.pickupReminder", icon: ShoppingCart },
  { value: "doctor_visit", labelKey: "reminders.doctorVisit", icon: Calendar },
] as const;

function typeIcon(type: string) {
  switch (type) {
    case "medication":
      return <Pill className="h-5 w-5" />;
    case "refill_alert":
      return <Package className="h-5 w-5" />;
    case "pickup":
      return <ShoppingCart className="h-5 w-5" />;
    case "doctor_visit":
      return <Calendar className="h-5 w-5" />;
    case "pharmacy_alert":
      return <AlertTriangle className="h-5 w-5" />;
    default:
      return <Bell className="h-5 w-5" />;
  }
}

function typeBadgeVariant(type: string): "default" | "secondary" | "outline" | "destructive" {
  switch (type) {
    case "medication":
      return "default";
    case "refill_alert":
      return "destructive";
    case "pickup":
      return "secondary";
    case "doctor_visit":
      return "outline";
    default:
      return "secondary";
  }
}

function timeAgo(dateStr: string | Date | null, t: (key: string) => string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t("reminders.justNow");
  if (diffMins < 60) return `${diffMins}${t("reminders.mAgo")}`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}${t("reminders.hAgo")}`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}${t("reminders.dAgo")}`;
}

function expiryInfo(
  createdAt: string | Date | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  retentionDays: number = 7
): { label: string; urgent: boolean; absoluteDate: string; expired: boolean } | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  const expiresAt = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const msLeft = expiresAt.getTime() - now.getTime();
  const absoluteDate = expiresAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  if (msLeft <= 0) return { label: t("reminders.expiredToday"), urgent: true, absoluteDate, expired: true };
  const hoursLeft = msLeft / (1000 * 60 * 60);
  if (hoursLeft < 24) return { label: t("reminders.expiresToday"), urgent: true, absoluteDate, expired: false };
  const daysLeft = Math.ceil(hoursLeft / 24);
  if (daysLeft === 1) return { label: t("reminders.expiresInOneDay"), urgent: true, absoluteDate, expired: false };
  return { label: t("reminders.expiresInDays", { count: daysLeft }), urgent: daysLeft <= 2, absoluteDate, expired: false };
}

function notifNavigation(notif: Notification): { target: string; labelKey: string } | null {
  if (notif.actionUrl) return { target: notif.actionUrl, labelKey: "reminders.viewDetails" };
  if (notif.relatedOrderId) return { target: `/orders/${notif.relatedOrderId}`, labelKey: "reminders.viewOrderDetails" };
  if (notif.relatedMedicationId) return { target: `/medications?med=${notif.relatedMedicationId}`, labelKey: "reminders.viewMedication" };
  return null;
}

export default function Reminders() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedExpiry, setExpandedExpiry] = useState<Set<number>>(() => {
    try {
      const stored = sessionStorage.getItem("reminders-expanded-expiry");
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>();
    } catch { return new Set<number>(); }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState("medication");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTime, setNewTime] = useState("08:00");
  const [newDays, setNewDays] = useState<string[]>([]);

  const { data: reminders, isLoading: isRemindersLoading } = useQuery<Reminder[]>({
    queryKey: [pUrl("/api/reminders")],
  });

  const { data: notifications, isLoading: isNotificationsLoading } = useQuery<Notification[]>({
    queryKey: [pUrl("/api/notifications")],
  });

  type SeverityConfig = { vibratePattern: number[]; requireInteraction: boolean };
  const { data: pushConfig } = useQuery<{
    pharmacyAlert: { urgent: SeverityConfig; high: SeverityConfig; info: SeverityConfig; retentionDays: number };
    notificationRetentionHours: number;
    isAdmin: boolean;
  }>({
    queryKey: ["/api/push-config"],
  });

  const [editingUrgency, setEditingUrgency] = useState(false);
  const [draftPatterns, setDraftPatterns] = useState({ urgent: "", high: "", info: "" });
  const [draftRequireInteractions, setDraftRequireInteractions] = useState({ urgent: true, high: true, info: false });

  const saveUrgencyMutation = useMutation({
    mutationFn: async (data: { urgent: SeverityConfig; high: SeverityConfig; info: SeverityConfig }) => {
      await apiRequest("PUT", "/api/push-config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push-config"] });
      setEditingUrgency(false);
      toast({ title: t("reminders.urgencySettingsSaved"), description: t("reminders.urgencySettingsSavedDesc") });
    },
    onError: () => {
      toast({ title: t("reminders.urgencySettingsError"), variant: "destructive" });
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: async (data: {
      type: string;
      title: string;
      description?: string;
      scheduledTime: string;
      scheduledDays: string[];
    }) => {
      await apiRequest("POST", pUrl("/api/reminders"), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/reminders")] });
      toast({ title: t("reminders.reminderCreated"), description: t("reminders.reminderCreatedDesc") });
      setShowAddForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewTime("08:00");
      setNewDays([]);
      setNewType("medication");
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("reminders.failedCreateReminder"), variant: "destructive" });
    },
  });

  const toggleReminderMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", pUrl(`/api/reminders/${id}`), { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/reminders")] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || "We could not update this reminder. Please try again.", variant: "destructive" });
    },
  });

  const deleteReminderMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", pUrl(`/api/reminders/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/reminders")] });
      toast({ title: t("reminders.deleted"), description: t("reminders.reminderRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || "We could not remove this reminder. Please try again.", variant: "destructive" });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", pUrl("/api/notifications/read-all"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
      toast({ title: t("common.done"), description: t("reminders.allMarkedRead") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || "We could not mark these notifications as read. Please try again.", variant: "destructive" });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", pUrl(`/api/notifications/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || "We could not remove this notification. Please try again.", variant: "destructive" });
    },
  });

  const clearAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", pUrl("/api/notifications"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
      toast({ title: t("common.done"), description: t("reminders.allCleared", "All notifications cleared") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || "We could not clear your notifications. Please try again.", variant: "destructive" });
    },
  });

  const pharmacySyncMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", pUrl("/api/pharmacy/sync"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/notifications")] });
      toast({ title: t("reminders.pharmacySynced"), description: t("reminders.pharmacySyncedDesc") });
    },
    onError: () => {
      toast({ title: t("reminders.syncFailed"), description: t("reminders.syncFailedDesc"), variant: "destructive" });
    },
  });

  const filteredReminders = activeCategory
    ? reminders?.filter((r) => r.type === activeCategory)
    : reminders;

  const toggleDay = (day: string) => {
    setNewDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveReminder = () => {
    if (createReminderMutation.isPending) return;
    if (!newTitle.trim()) {
      toast({ title: t("reminders.missingTitle"), description: t("reminders.missingTitleDesc"), variant: "destructive" });
      return;
    }
    createReminderMutation.mutate({
      type: newType,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      scheduledTime: newTime,
      scheduledDays: newDays,
    });
  };

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  const { supported: notifSupported, permission: notifPermission, requestPermission } = useNotifications();

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      toast({
        title: t("reminders.notificationsPermissionGranted"),
        description: t("reminders.notificationsPermissionGrantedDesc"),
      });
    }
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto space-y-6">

      {notifSupported && notifPermission === "default" && (
        <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10 animate-drift-up" data-testid="card-enable-notifications">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <BellRing className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">{t("reminders.enableNotifications")}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{t("reminders.enableNotificationsDesc")}</p>
              <Button
                type="button"
                size="lg"
                className="mt-3"
                onClick={handleEnableNotifications}
                data-testid="button-enable-notifications"
              >
                <BellRing className="h-4 w-4 mr-2" />
                {t("reminders.enableNotificationsButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notifSupported && notifPermission === "granted" && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1" data-testid="text-notifications-enabled">
          <CheckCircle2 className="h-4 w-4" />
          <span>{t("reminders.notificationsEnabled")}</span>
        </div>
      )}

      {notifSupported && notifPermission === "denied" && (
        <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30" data-testid="card-notifications-denied">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-semibold text-orange-700 dark:text-orange-400">{t("reminders.notificationsDenied")}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{t("reminders.notificationsDeniedDesc")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!notifSupported && (
        <Card className="border-muted" data-testid="card-notifications-unsupported">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-base font-semibold">{t("reminders.notificationsNotSupported")}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{t("reminders.notificationsNotSupportedDesc")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <section data-testid="section-reminder-categories">
        <div className="flex gap-2 flex-wrap">
          {REMINDER_TYPE_KEYS.map((cat) => (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? "default" : "outline"}
              className="text-lg toggle-elevate"
              onClick={() =>
                setActiveCategory(activeCategory === cat.value ? null : cat.value)
              }
              data-testid={`button-category-${cat.value}`}
            >
              <cat.icon className="h-5 w-5" />
              {t(cat.labelKey)}
            </Button>
          ))}
        </div>
      </section>

      <section data-testid="section-active-reminders">
        <h2 className="text-xl font-semibold mb-4">{t("reminders.activeReminders")}</h2>
        {isRemindersLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : !filteredReminders || filteredReminders.length === 0 ? (
          <Card data-testid="card-no-reminders" className="animate-fade-in">
            <CardContent className="p-6 text-center space-y-3">
              <BellReminder className="w-16 h-16 mx-auto" />
              <p className="text-lg text-muted-foreground">{t("reminders.noRemindersFound")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredReminders.map((reminder) => (
              <Card
                key={reminder.id}
                className={`glass-card ${!reminder.isActive ? "opacity-60" : ""}`}
                data-testid={`card-reminder-${reminder.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-lg font-bold"
                          data-testid={`text-reminder-title-${reminder.id}`}
                        >
                          {reminder.title}
                        </span>
                        <Badge
                          variant={typeBadgeVariant(reminder.type)}
                          data-testid={`badge-reminder-type-${reminder.id}`}
                        >
                          {reminder.type.replace("_", " ")}
                        </Badge>
                      </div>
                      {reminder.description && (
                        <p
                          className="text-base text-muted-foreground"
                          data-testid={`text-reminder-desc-${reminder.id}`}
                        >
                          {reminder.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!reminder.isActive}
                        onCheckedChange={(checked) =>
                          toggleReminderMutation.mutate({
                            id: reminder.id,
                            isActive: checked,
                          })
                        }
                        disabled={toggleReminderMutation.isPending || deleteReminderMutation.isPending}
                        data-testid={`switch-reminder-active-${reminder.id}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(t("reminders.confirmDeleteReminder", "Delete this reminder?"))) {
                            deleteReminderMutation.mutate(reminder.id);
                          }
                        }}
                        disabled={deleteReminderMutation.isPending || toggleReminderMutation.isPending}
                        data-testid={`button-delete-reminder-${reminder.id}`}
                        aria-label={t("reminders.deleteReminder", "Delete reminder")}
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-base text-muted-foreground flex-wrap">
                    {reminder.scheduledTime && (
                      <span
                        className="flex items-center gap-1"
                        data-testid={`text-reminder-time-${reminder.id}`}
                      >
                        <Clock className="h-4 w-4" />
                        {reminder.scheduledTime}
                      </span>
                    )}
                    {reminder.scheduledDays && reminder.scheduledDays.length > 0 && (
                      <span data-testid={`text-reminder-days-${reminder.id}`}>
                        {reminder.scheduledDays.map((d) => t(`reminders.${d}`)).join(", ")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section data-testid="section-add-reminder">
        <Button
          type="button"
          variant="outline"
          className="w-full text-lg"
          onClick={() => setShowAddForm(!showAddForm)}
          data-testid="button-toggle-add-form"
        >
          <Plus className="h-5 w-5" />
          {showAddForm ? t("reminders.closeForm") : t("reminders.addNewReminder")}
        </Button>

        {showAddForm && (
          <Card className="mt-4 glass-card" data-testid="card-add-reminder-form">
            <CardHeader>
              <CardTitle className="text-xl">{t("reminders.newReminder")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-base font-medium mb-2 block">{t("reminders.type")}</label>
                <div className="flex gap-2 flex-wrap">
                  {REMINDER_TYPE_KEYS.map((rt) => (
                    <Button
                      type="button"
                      key={rt.value}
                      variant={newType === rt.value ? "default" : "outline"}
                      className="toggle-elevate"
                      onClick={() => setNewType(rt.value)}
                      data-testid={`button-type-${rt.value}`}
                    >
                      <rt.icon className="h-4 w-4" />
                      {t(rt.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-base font-medium mb-2 block" htmlFor="reminder-title">
                  {t("reminders.title")}
                </label>
                <Input
                  id="reminder-title"
                  placeholder={t("reminders.titlePlaceholder")}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="text-lg"
                  data-testid="input-reminder-title"
                />
              </div>

              <div>
                <label className="text-base font-medium mb-2 block" htmlFor="reminder-description">
                  {t("reminders.descriptionOptional")}
                </label>
                <Input
                  id="reminder-description"
                  placeholder={t("reminders.descriptionPlaceholder")}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="text-lg"
                  data-testid="input-reminder-description"
                />
              </div>

              <div>
                <label className="text-base font-medium mb-2 block" htmlFor="reminder-time">
                  {t("reminders.time")}
                </label>
                <Input
                  id="reminder-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="text-lg"
                  data-testid="input-reminder-time"
                />
              </div>

              <div>
                <label className="text-base font-medium mb-2 block">{t("reminders.daysLabel")}</label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_KEYS.map((dayKey) => {
                    const dayLabel = t(`reminders.${dayKey}`);
                    return (
                      <Button
                        type="button"
                        key={dayKey}
                        variant={newDays.includes(dayKey) ? "default" : "outline"}
                        className="toggle-elevate"
                        onClick={() => toggleDay(dayKey)}
                        data-testid={`button-day-${dayKey}`}
                      >
                        {dayLabel}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button
                type="button"
                className="w-full text-lg min-h-[48px]"
                onClick={handleSaveReminder}
                disabled={createReminderMutation.isPending}
                data-testid="button-save-reminder"
              >
                {createReminderMutation.isPending ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                {t("reminders.saveReminder")}
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section data-testid="section-notifications">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="text-xl font-semibold">{t("reminders.notifications")}</h2>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[48px] text-base"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <Check className="h-4 w-4" />
                {t("reminders.markAllRead")}
              </Button>
            )}
            {notifications && notifications.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[48px] text-base text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm(t("reminders.confirmClearAll", "Clear all notifications? This cannot be undone."))) {
                    clearAllNotificationsMutation.mutate();
                  }
                }}
                disabled={clearAllNotificationsMutation.isPending}
                data-testid="button-clear-all-notifications"
              >
                <Trash2 className="h-4 w-4" />
                {t("reminders.clearAll", "Clear All")}
              </Button>
            )}
          </div>
        </div>

        {isNotificationsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <Card data-testid="card-no-notifications" className="animate-fade-in">
            <CardContent className="p-6 text-center space-y-3">
              <BellReminder className="w-14 h-14 mx-auto" />
              <p className="text-lg text-muted-foreground">{t("reminders.noNotifications")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const isPharmacyAlert = notif.type === "pharmacy_alert";
              const nav = notifNavigation(notif);
              const navTarget = nav?.target ?? null;
              const isNavigable = !!nav;
              return (
                <Card
                  key={notif.id}
                  className={`glass-card transition-colors ${
                    isPharmacyAlert
                      ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30"
                      : !notif.isRead
                      ? "border-primary/50"
                      : ""
                  } ${isNavigable ? "cursor-pointer hover:bg-muted/50 active:bg-muted/70" : ""}`}
                  data-testid={`card-notification-${notif.id}`}
                  onClick={nav ? () => navigate(nav.target) : undefined}
                  role={isNavigable ? "button" : undefined}
                  tabIndex={isNavigable ? 0 : undefined}
                  onKeyDown={nav ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(nav.target); } } : undefined}
                  aria-label={isNavigable ? `${notif.title} — tap to view details` : undefined}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`mt-0.5 ${isPharmacyAlert ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
                      {typeIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-lg ${!notif.isRead ? "font-bold" : "font-medium"}`}
                          data-testid={`text-notification-title-${notif.id}`}
                        >
                          {notif.title}
                        </span>
                        {isPharmacyAlert && (
                          <Badge
                            className="bg-amber-500 hover:bg-amber-500 text-white"
                            data-testid={`badge-pharmacy-alert-${notif.id}`}
                          >
                            {t("reminders.pharmacyAlert", "Pharmacy Alert")}
                          </Badge>
                        )}
                        {!notif.isRead && (
                          <Badge variant="default" data-testid={`badge-unread-${notif.id}`}>
                            {t("reminders.new")}
                          </Badge>
                        )}
                      </div>
                      <p
                        className="text-base text-muted-foreground"
                        data-testid={`text-notification-message-${notif.id}`}
                      >
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className="text-sm text-muted-foreground"
                          data-testid={`text-notification-time-${notif.id}`}
                        >
                          {timeAgo(notif.createdAt, t)}
                        </span>
                        {isPharmacyAlert && (() => {
                          const expiry = expiryInfo(notif.createdAt, t, pushConfig?.pharmacyAlert?.retentionDays ?? 7);
                          if (!expiry) return null;
                          const isDateExpanded = expandedExpiry.has(notif.id);
                          const colorClass = expiry.urgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
                          return (
                            <button
                              type="button"
                              title={t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate })}
                              aria-label={`${expiry.label} — ${t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate })}`}
                              className={`text-sm font-medium ${colorClass} cursor-pointer underline decoration-dotted underline-offset-2 focus:outline-none`}
                              data-testid={`text-notification-expiry-${notif.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedExpiry((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(notif.id)) next.delete(notif.id);
                                  else next.add(notif.id);
                                  try { sessionStorage.setItem("reminders-expanded-expiry", JSON.stringify(Array.from(next))); } catch {}
                                  return next;
                                });
                              }}
                            >
                              · {isDateExpanded ? t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate }) : expiry.label}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                      {isNavigable && (
                        <div
                          className="flex flex-col items-center gap-0.5"
                          data-testid={`nav-hint-${notif.id}`}
                        >
                          <ChevronRight
                            className="h-5 w-5 text-muted-foreground"
                            data-testid={`icon-notification-link-${notif.id}`}
                          />
                          <span
                            className="text-xs text-muted-foreground whitespace-nowrap"
                            data-testid={`text-notification-dest-${notif.id}`}
                          >
                            {nav && t(nav.labelKey)}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label={t("reminders.dismissNotification", "Dismiss notification")}
                        className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        disabled={deleteNotificationMutation.isPending || clearAllNotificationsMutation.isPending}
                        data-testid={`button-dismiss-notification-${notif.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotificationMutation.mutate(notif.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {pushConfig && (
        <section data-testid="section-pharmacy-alert-urgency">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  {t("reminders.pharmacyAlertUrgencySettings")}
                </CardTitle>
                {pushConfig.isAdmin && !editingUrgency && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraftPatterns({
                        urgent: pushConfig.pharmacyAlert.urgent.vibratePattern.join(", "),
                        high: pushConfig.pharmacyAlert.high.vibratePattern.join(", "),
                        info: pushConfig.pharmacyAlert.info.vibratePattern.join(", "),
                      });
                      setDraftRequireInteractions({
                        urgent: pushConfig.pharmacyAlert.urgent.requireInteraction,
                        high: pushConfig.pharmacyAlert.high.requireInteraction,
                        info: pushConfig.pharmacyAlert.info.requireInteraction,
                      });
                      setEditingUrgency(true);
                    }}
                    data-testid="button-edit-urgency-settings"
                  >
                    {t("reminders.editSettings")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground" data-testid="text-urgency-settings-desc">
                {t("reminders.pharmacyAlertUrgencySettingsDesc")}
              </p>
              {editingUrgency && pushConfig.isAdmin ? (
                <div className="space-y-6" data-testid="form-urgency-settings">
                  {(["urgent", "high", "info"] as const).map((level) => (
                    <div key={level} className="space-y-3 rounded-lg border border-border p-4" data-testid={`section-severity-${level}`}>
                      <div>
                        <span className="text-base font-semibold">{t(`reminders.severityLevel.${level}`)}</span>
                        <p className="text-sm text-muted-foreground">{t(`reminders.severityLevelDesc.${level}`)}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`input-vibrate-pattern-${level}`}>
                          {t("reminders.vibratePattern")}
                        </label>
                        <p className="text-xs text-muted-foreground">{t("reminders.vibratePatternHelp")}</p>
                        <Input
                          id={`input-vibrate-pattern-${level}`}
                          value={draftPatterns[level]}
                          onChange={(e) => setDraftPatterns((prev) => ({ ...prev, [level]: e.target.value }))}
                          placeholder="300, 100, 300"
                          className="font-mono"
                          data-testid={`input-vibrate-pattern-${level}`}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3" data-testid={`row-require-interaction-toggle-${level}`}>
                        <div>
                          <span className="text-sm font-medium">{t("reminders.requireInteraction")}</span>
                          <p className="text-xs text-muted-foreground">{t("reminders.requireInteractionHelp")}</p>
                        </div>
                        <Switch
                          checked={draftRequireInteractions[level]}
                          onCheckedChange={(v) => setDraftRequireInteractions((prev) => ({ ...prev, [level]: v }))}
                          data-testid={`switch-require-interaction-${level}`}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <Button
                      size="lg"
                      className="flex-1"
                      disabled={saveUrgencyMutation.isPending}
                      onClick={() => {
                        const parsed: Record<string, number[]> = {};
                        for (const level of ["urgent", "high", "info"] as const) {
                          const parts = draftPatterns[level].split(",").map((s) => parseInt(s.trim(), 10));
                          if (parts.length === 0 || parts.some(isNaN) || parts.some((n) => n < 0 || n > 10000) || parts.length > 20) {
                            toast({ title: t("reminders.vibratePatternInvalidForLevel", { level: t(`reminders.severityLevel.${level}`) }), variant: "destructive" });
                            return;
                          }
                          parsed[level] = parts;
                        }
                        saveUrgencyMutation.mutate({
                          urgent: { vibratePattern: parsed.urgent, requireInteraction: draftRequireInteractions.urgent },
                          high: { vibratePattern: parsed.high, requireInteraction: draftRequireInteractions.high },
                          info: { vibratePattern: parsed.info, requireInteraction: draftRequireInteractions.info },
                        });
                      }}
                      data-testid="button-save-urgency-settings"
                    >
                      {saveUrgencyMutation.isPending ? t("reminders.saving") : t("reminders.saveSettings")}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setEditingUrgency(false)}
                      data-testid="button-cancel-urgency-settings"
                    >
                      {t("reminders.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {(["urgent", "high", "info"] as const).map((level) => (
                    <div key={level} className="space-y-2 rounded-lg border border-border p-3" data-testid={`row-severity-${level}`}>
                      <span className="text-sm font-semibold">{t(`reminders.severityLevel.${level}`)}</span>
                      <div className="flex items-start justify-between gap-3 flex-wrap" data-testid={`row-vibrate-pattern-${level}`}>
                        <span className="text-sm text-muted-foreground">{t("reminders.vibratePattern")}</span>
                        <div className="flex flex-wrap gap-1 justify-end" data-testid={`text-vibrate-pattern-value-${level}`}>
                          {pushConfig.pharmacyAlert[level].vibratePattern.map((ms, i) => (
                            <Badge key={i} variant="outline" className="font-mono text-xs">
                              {ms}{t("reminders.vibratePatternMs")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap" data-testid={`row-require-interaction-${level}`}>
                        <span className="text-sm text-muted-foreground">{t("reminders.requireInteraction")}</span>
                        <span
                          className={`text-xs font-medium ${pushConfig.pharmacyAlert[level].requireInteraction ? "text-primary" : "text-muted-foreground"}`}
                          data-testid={`text-require-interaction-value-${level}`}
                        >
                          {pushConfig.pharmacyAlert[level].requireInteraction
                            ? t("reminders.requireInteractionOn")
                            : t("reminders.requireInteractionOff")}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg border border-border p-3 space-y-2" data-testid="section-retention-settings">
                    <span className="text-sm font-semibold">{t("reminders.retentionSettings")}</span>
                    <p className="text-xs text-muted-foreground">{t("reminders.retentionSettingsDesc")}</p>
                    <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="row-pharmacy-alert-retention">
                      <span className="text-sm text-muted-foreground">{t("reminders.pharmacyAlertRetention")}</span>
                      <Badge variant="outline" className="font-mono text-xs" data-testid="text-pharmacy-alert-retention-value">
                        {t("reminders.retentionDaysValue", { count: pushConfig.pharmacyAlert.retentionDays })}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="row-notification-retention">
                      <span className="text-sm text-muted-foreground">{t("reminders.notificationRetention")}</span>
                      <Badge variant="outline" className="font-mono text-xs" data-testid="text-notification-retention-value">
                        {t("reminders.retentionHoursValue", { count: pushConfig.notificationRetentionHours })}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section data-testid="section-pharmacy-sync">
        <Button
          variant="outline"
          size="lg"
          className="w-full text-lg"
          onClick={() => pharmacySyncMutation.mutate()}
          disabled={pharmacySyncMutation.isPending}
          data-testid="button-pharmacy-sync"
        >
          {pharmacySyncMutation.isPending ? (
            <RefreshCw className="h-6 w-6 animate-spin" />
          ) : (
            <RefreshCw className="h-6 w-6" />
          )}
          {t("reminders.syncWithPharmacy")}
        </Button>
      </section>
    </div>
  );
}
