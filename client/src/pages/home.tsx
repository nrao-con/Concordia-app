import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/utils";
import {
  Pill,
  ShoppingCart,
  Package,
  Bell,
  BellOff,
  Heart,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Store,
  Truck,
  Timer,
  MessageCircle,
  Lightbulb,
  Phone,
  Clock,
  CalendarDays,
  Flame,
  RotateCw,
  Sparkles,
  Users,
  UserPlus,
  ChevronDown,
  X,
} from "lucide-react";

const NEAR_EXPIRY_THRESHOLD_DAYS = 2;

function isPharmacyAlertNearExpiry(createdAt: string | Date | null | undefined, retentionDays: number): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const expiresAt = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const msLeft = expiresAt.getTime() - now.getTime();
  if (msLeft <= 0) return true;
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  return daysLeft <= NEAR_EXPIRY_THRESHOLD_DAYS;
}

function alertExpiryLabel(
  createdAt: string | Date | null | undefined,
  retentionDays: number,
  t: (key: string, opts?: Record<string, unknown>) => string
): { label: string; expired: boolean; absoluteDate: string } | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  const expiresAt = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const msLeft = expiresAt.getTime() - now.getTime();
  const absoluteDate = expiresAt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  if (msLeft <= 0) return { label: t("reminders.expiredToday"), expired: true, absoluteDate };
  const hoursLeft = msLeft / (1000 * 60 * 60);
  if (hoursLeft < 24) return { label: t("reminders.expiresToday"), expired: false, absoluteDate };
  const daysLeft = Math.ceil(hoursLeft / 24);
  if (daysLeft > NEAR_EXPIRY_THRESHOLD_DAYS) return null;
  if (daysLeft === 1) return { label: t("reminders.expiresInOneDay"), expired: false, absoluteDate };
  return { label: t("reminders.expiresInDays", { count: daysLeft }), expired: false, absoluteDate };
}

interface PharmacyAlert {
  id: string | number;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  severity?: string;
}

interface PatientInsightItem {
  type?: string;
  title?: string;
  message?: string;
  body?: string;
}

interface PatientInsightsData {
  insights?: PatientInsightItem[];
  tips?: PatientInsightItem[];
  adherenceScore?: number;
  atRiskMedications?: string[];
}
import type { Medication, Order, Notification } from "@shared/schema";
import { OrderStatusPill } from "@/components/order-status-pill";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function friendlyOrderType(type: string | null, t: (key: string) => string): string {
  switch (type) {
    case "otc": return t("home.otcOrderType");
    case "rx_refill": return t("home.rxRefillType");
    case "blister_pack": return t("home.blisterPackType");
    default: return type?.replace(/_/g, " ") || t("home.orderType");
  }
}

function statusLabel(status: string | null, t: (key: string) => string): string {
  switch (status) {
    case "pending":
    case "received": return t("home.received");
    case "preparing": return t("home.preparing");
    case "verified": return t("home.verified");
    case "ready": return t("home.ready");
    case "picked_up": return t("home.pickedUp");
    case "delivered": return t("home.delivered");
    case "cancelled": return t("home.cancelled");
    default: return status || t("home.unknown");
  }
}

function statusColor(status: string | null): string {
  switch (status) {
    case "ready": return "bg-green-100/50 dark:bg-green-900/20 text-green-600 dark:text-green-400";
    case "verified": return "bg-primary/15 text-primary";
    case "preparing": return "bg-orange-100/50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400";
    case "picked_up":
    case "delivered": return "bg-muted text-muted-foreground";
    case "cancelled": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.goodMorning");
  if (hour < 17) return t("home.goodAfternoon");
  return t("home.goodEvening");
}

function getTimeOfDayGradient(): string {
  return "animate-mesh-gradient";
}

function getDailyTip(t: (key: string, options?: any) => any): string {
  const tips = t("home.healthTips", { returnObjects: true }) as string[];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return tips[dayOfYear % tips.length];
}

function getAdherenceStreak(medications: Medication[]): number {
  if (!medications || medications.length === 0) return 0;
  const confirmed = medications.filter(
    (m) => m.isActive && m.lastFilledDate
  );
  if (confirmed.length === 0) return 0;
  let streak = 0;
  const now = new Date();
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - dayOffset);
    const dateStr = checkDate.toISOString().split("T")[0];
    const hasConfirm = confirmed.some((m) => {
      if (!m.lastFilledDate) return false;
      const filled = new Date(m.lastFilledDate).toISOString().split("T")[0];
      return filled === dateStr;
    });
    if (hasConfirm) {
      streak++;
    } else if (dayOffset > 0) {
      break;
    }
  }
  return streak;
}

function getUpcomingRefills(medications: Medication[]): Medication[] {
  if (!medications) return [];
  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  return medications
    .filter((m) => {
      if (!m.isActive || !m.nextRefillDate) return false;
      const refillDate = new Date(m.nextRefillDate);
      return refillDate <= weekFromNow;
    })
    .sort((a, b) => {
      const dateA = new Date(a.nextRefillDate!).getTime();
      const dateB = new Date(b.nextRefillDate!).getTime();
      return dateA - dateB;
    })
    .slice(0, 3);
}

function getDaysUntil(dateStr: string | Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function getPharmacyStatus(t: (key: string) => string): { isOpen: boolean; label: string } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  if (day === 0) return { isOpen: false, label: t("home.closedOpensMon9") };
  if (day === 6) {
    if (timeInMinutes >= 600 && timeInMinutes < 960) return { isOpen: true, label: t("home.openUntil4") };
    if (timeInMinutes < 600) return { isOpen: false, label: t("home.opensAt10") };
    return { isOpen: false, label: t("home.closedOpensMon9") };
  }
  if (timeInMinutes >= 540 && timeInMinutes < 1140) return { isOpen: true, label: t("home.openUntil7") };
  if (timeInMinutes < 540) return { isOpen: false, label: t("home.opensAt9") };
  return { isOpen: false, label: t("home.closedOpensTomorrow9") };
}

function getQuickActions(t: (key: string) => string, hasPharmacyRecords: boolean) {
  return [
    {
      label: t("home.rxRefill"),
      href: hasPharmacyRecords ? "/medications" : "/records",
      icon: Pill,
      description: hasPharmacyRecords ? t("home.prescriptionRefills") : t("home.connectToRefill"),
      testId: "tile-rx-refill",
      gradient: "from-blue-500/90 to-sky-400/90",
      iconBg: "bg-white/20",
    },
    {
      label: hasPharmacyRecords ? t("home.otcOrder") : t("home.browseOtc"),
      href: "/shop",
      icon: ShoppingCart,
      description: hasPharmacyRecords ? t("home.overTheCounter") : t("home.connectToOrder"),
      testId: "tile-otc-order",
      gradient: "from-blue-600/90 to-blue-400/90",
      iconBg: "bg-white/20",
    },
    {
      label: t("home.blisterPacks"),
      href: "/blister-packs",
      icon: Package,
      description: t("home.managePacks"),
      testId: "tile-blister-packs",
      gradient: "from-violet-500/90 to-purple-400/90",
      iconBg: "bg-white/20",
    },
    {
      label: t("home.healthChat"),
      href: "/inquiry",
      icon: MessageCircle,
      description: t("home.askQuestions"),
      testId: "tile-health-assistant",
      gradient: "from-orange-500/90 to-amber-400/90",
      iconBg: "bg-white/20",
    },
  ];
}

function AdherenceRing({ streak }: { streak: number }) {
  const maxDays = 30;
  const percentage = Math.min((streak / maxDays) * 100, 100);
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-[72px] h-[72px] flex items-center justify-center shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32" cy="32" r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/30"
        />
        <circle
          cx="32" cy="32" r="28"
          fill="none"
          stroke="url(#streakGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="streakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(23, 79%, 81%)" />
            <stop offset="100%" stopColor="hsl(15, 90%, 65%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className="h-4 w-4 text-orange-500 animate-breathe" />
        <span className="text-sm font-bold leading-none mt-0.5">{streak}</span>
      </div>
    </div>
  );
}

function useScrollProgress() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const container = scrollRef.current;
    const el = container?.closest("main");
    if (!el || !container) return;
    const onScroll = () => {
      if (reducedMotion) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const p = Math.min(el.scrollTop / 80, 1);
        container.style.setProperty("--sp", String(p));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { scrollRef };
}

interface LinkedPatient {
  linkId: number;
  patientId: string;
  firstName: string | null;
  lastName: string | null;
  relationship: string | null;
}

function PatientLinkForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [dob, setDob] = useState("");
  const [zip, setZip] = useState("");

  const linkMutation = useMutation({
    mutationFn: async (data: { patientName: string; dob: string; zip: string }) => {
      const res = await apiRequest("POST", "/api/caregiver/link-patient", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t("home.linkRequestSent"),
        description: t("home.linkRequestSentDesc"),
      });
      setShowAddForm(false);
      setPatientName("");
      setDob("");
      setZip("");
      queryClient.invalidateQueries({ queryKey: ["/api/caregiver/patients"] });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message.includes("404")
          ? t("home.noMatchingPatient")
          : error.message.includes("409")
          ? t("home.alreadyLinked")
          : t("home.failedToSendLink"),
        variant: "destructive",
      });
    },
  });

  const handleSubmitLink = () => {
    if (!patientName.trim() || !dob.trim()) return;
    linkMutation.mutate({ patientName: patientName.trim(), dob: dob.trim(), zip: zip.trim() });
  };

  if (!showAddForm) {
    return (
      <section data-testid="section-patient-link" className="animate-drift-up">
        <Card className="rounded-lg glass-card border-0 shadow-sm">
          <CardContent className="p-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAddForm(true)}
              data-testid="button-add-patient"
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              {t("home.addNewPatient")}
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="section-patient-link" className="animate-drift-up">
      <Card className="rounded-lg glass-card border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("home.linkAPatient")}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAddForm(false)}
              data-testid="button-cancel-add-patient"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <div>
              <Label htmlFor="patient-name" className="text-sm">
                {t("home.patientFullName")}
              </Label>
              <Input
                id="patient-name"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. John Smith"
                data-testid="input-patient-name"
              />
            </div>
            <div>
              <Label htmlFor="patient-dob" className="text-sm">
                {t("onboarding.dateOfBirth")}
              </Label>
              <Input
                id="patient-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                data-testid="input-patient-dob"
              />
            </div>
            <div>
              <Label htmlFor="patient-zip" className="text-sm">
                {t("home.zipCode")}
              </Label>
              <Input
                id="patient-zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="e.g. 11235"
                data-testid="input-patient-zip"
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleSubmitLink}
            disabled={!patientName.trim() || !dob.trim() || linkMutation.isPending}
            data-testid="button-submit-link-patient"
          >
            {linkMutation.isPending ? t("common.sending") : t("home.sendLinkRequest")}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { scrollRef } = useScrollProgress();
  const { isProxy, activePatientId } = usePatientContext();
  const isCaregiver = user?.userRole === "caregiver";
  const hasPharmacyRecords = !!user && user.pharmacyAccess !== false;
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);

  const { data: medications, isLoading: isMedsLoading } = useQuery<Medication[]>({
    queryKey: [pUrl("/api/medications")],
    enabled: hasPharmacyRecords,
    refetchInterval: 5000,
  });

  const { data: orders, isLoading: isOrdersLoading } = useQuery<Order[]>({
    queryKey: [pUrl("/api/orders")],
    enabled: hasPharmacyRecords,
    refetchInterval: 10000,
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: [pUrl("/api/notifications")],
    enabled: hasPharmacyRecords,
    refetchInterval: 10000,
  });

  const { data: pharmacyAlerts } = useQuery<PharmacyAlert[]>({
    queryKey: ["/api/pharmacy-alerts"],
    enabled: hasPharmacyRecords,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const { data: pushConfig } = useQuery<{
    pharmacyAlert: { vibratePattern: number[]; requireInteraction: boolean; retentionDays: number };
  }>({
    queryKey: ["/api/push-config"],
    enabled: hasPharmacyRecords,
    staleTime: 5 * 60 * 1000,
  });

  const { data: patientInsights } = useQuery<PatientInsightsData | null>({
    queryKey: [pUrl("/api/patient-insights")],
    enabled: hasPharmacyRecords,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  const { data: notifPrefs } = useQuery<{
    pharmacyAlertsEnabled: boolean;
    pharmacyAlertMinSeverity: string;
    snoozeUntilAt: string | null;
  }>({
    queryKey: ["/api/notification-preferences"],
    enabled: hasPharmacyRecords,
    refetchInterval: (query) => {
      const snoozeUntilAt = query.state.data?.snoozeUntilAt ?? null;
      const isSnoozed = !!snoozeUntilAt && new Date(snoozeUntilAt) > new Date();
      return isSnoozed ? 30_000 : false;
    },
  });

  const isSnoozed = !!notifPrefs?.snoozeUntilAt && new Date(notifPrefs.snoozeUntilAt) > new Date();

  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string | number>>(() => {
    try {
      const stored = sessionStorage.getItem("dismissed-pharmacy-alerts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [pendingDismissKey, setPendingDismissKey] = useState<string | number | null>(null);
  const [expandedExpiry, setExpandedExpiry] = useState<Set<string | number>>(() => {
    try {
      const stored = sessionStorage.getItem("home-expanded-expiry");
      return stored ? new Set<string | number>(JSON.parse(stored)) : new Set<string | number>();
    } catch { return new Set<string | number>(); }
  });

  const dismissAlert = useCallback((id: string | number) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { sessionStorage.setItem("dismissed-pharmacy-alerts", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);

  const handleDismissClick = useCallback((alert: PharmacyAlert & { _key: string | number }) => {
    const alertMessage = alert.message ?? alert.body ?? alert.title ?? "New pharmacy alert";
    const matchingNotif = (notifications ?? []).find(
      (n) => n.type === "pharmacy_alert" && n.message === alertMessage
    );
    const retentionDays = pushConfig?.pharmacyAlert?.retentionDays ?? 7;
    const isNearExpiry = matchingNotif ? isPharmacyAlertNearExpiry(matchingNotif.createdAt, retentionDays) : false;
    if (isNearExpiry) {
      setPendingDismissKey(alert._key);
    } else {
      dismissAlert(alert._key);
    }
  }, [notifications, dismissAlert, pushConfig]);

  const alertKey = (a: PharmacyAlert, idx: number): string | number =>
    a.id != null ? a.id : `${a.title ?? ""}-${a.message ?? a.body ?? ""}`;
  const visibleAlerts = (pharmacyAlerts ?? [])
    .map((a, idx) => ({ ...a, _key: alertKey(a, idx) }))
    .filter((a) => !dismissedAlerts.has(a._key));
  const insightItems: PatientInsightItem[] = [
    ...(patientInsights?.insights ?? []),
    ...(patientInsights?.tips ?? []),
  ].slice(0, 3);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;
  const userName = user?.firstName ?? "there";
  const greetingText = getGreeting(t);
  const tip = getDailyTip(t);
  const timeGradient = getTimeOfDayGradient();
  const activeMeds = medications?.filter((m) => m.isActive) ?? [];
  const needsRefill = activeMeds.filter((m) => (m.refillsRemaining ?? 0) <= 1);
  const allGood = needsRefill.length === 0 && activeMeds.length > 0;
  const recentOrders = (orders ?? []).slice(0, 3);
  const adherenceStreak = getAdherenceStreak(activeMeds);
  const upcomingRefills = getUpcomingRefills(activeMeds);
  const pharmacyStatus = getPharmacyStatus(t);
  const quickActions = getQuickActions(t, hasPharmacyRecords);
  const activeOrderStatuses = ["pending", "preparing", "verified", "ready"];
  const lastOtcOrder = orders?.find((o) => o.orderType === "otc" && o.status != null && activeOrderStatuses.includes(o.status));

  if (isAuthLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 animate-landing-gradient -z-10 pointer-events-none" aria-hidden="true" />
    <div ref={scrollRef} className="max-w-3xl mx-auto p-4 pb-4 space-y-5 scroll-host" data-testid="page-home">
      <header
        className="relative overflow-hidden rounded-lg animate-drift-up scroll-header bg-gradient-to-br from-blue-700 to-blue-500 dark:from-blue-800 dark:to-blue-600"
        data-testid="section-header"
      >
        <div className={`absolute inset-0 ${timeGradient}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none scroll-compact-title">
          <p className="text-base font-semibold text-white tracking-tight" data-testid="text-compact-title">
            {greetingText}, {userName}
          </p>
        </div>

        <div className="relative p-5 pb-4 scroll-title-scale">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-white/80 mb-0.5 scroll-detail-fade">
                {greetingText}
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-greeting">
                {userName}
              </h1>
              <p className="text-sm text-white/70 mt-1 scroll-detail-fade">
                {t("home.howCanWeHelp")}
              </p>
            </div>
            <div className="flex items-center gap-2 scroll-detail-fade">
              {adherenceStreak > 0 && (
                <div data-testid="badge-adherence-streak">
                  <AdherenceRing streak={adherenceStreak} />
                </div>
              )}
              <div className="relative">
                <Link href="/reminders">
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid="button-notifications"
                    className="relative text-white hover:bg-white/20"
                    aria-label={isSnoozed ? "Notifications (snoozed)" : "Notifications"}
                  >
                    {isSnoozed ? (
                      <BellOff className="h-5 w-5 opacity-80" aria-hidden="true" />
                    ) : (
                      <Bell className="h-5 w-5" aria-hidden="true" />
                    )}
                    {!isSnoozed && unreadCount > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[11px] font-semibold px-1 animate-scale-in"
                        data-testid="badge-notification-count"
                      >
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </Link>
                {isSnoozed && (
                  <Link href="/settings#notifications">
                    <span
                      className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-slate-600 dark:bg-slate-500 text-white text-[9px] font-bold px-1 cursor-pointer animate-scale-in leading-none"
                      data-testid="badge-snooze-indicator"
                      aria-label="Alerts snoozed — tap to manage"
                    >
                      ZZZ
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isCaregiver && <PatientLinkForm />}

      {visibleAlerts.length > 0 && (
        <section data-testid="section-pharmacy-alerts" className="space-y-2 animate-drift-up">
          {visibleAlerts.map((alert, idx) => (
            <div
              key={String(alert._key)}
              className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/40 px-4 py-3"
              data-testid={`card-pharmacy-alert-${idx}`}
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {alert.title && (
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                    {alert.title}
                  </p>
                )}
                {(alert.message ?? alert.body) && (
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5 leading-snug">
                    {alert.message ?? alert.body}
                  </p>
                )}
                {(() => {
                  const alertMsg = alert.message ?? alert.body ?? alert.title ?? "";
                  const matchingNotif = (notifications ?? []).find(
                    (n) => n.type === "pharmacy_alert" && n.message === alertMsg
                  );
                  const retentionDays = pushConfig?.pharmacyAlert?.retentionDays ?? 7;
                  const expiry = alertExpiryLabel(matchingNotif?.createdAt, retentionDays, t);
                  if (!expiry) return null;
                  const isDateExpanded = expandedExpiry.has(alert._key);
                  const colorClass = expiry.expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-500";
                  return (
                    <button
                      type="button"
                      title={t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate })}
                      aria-label={`${expiry.label} — ${t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate })}`}
                      className={`text-xs font-medium mt-1 ${colorClass} cursor-pointer underline decoration-dotted underline-offset-2 focus:outline-none`}
                      data-testid={`text-alert-expiry-${idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedExpiry((prev) => {
                          const next = new Set(prev);
                          if (next.has(alert._key)) next.delete(alert._key);
                          else next.add(alert._key);
                          try { sessionStorage.setItem("home-expanded-expiry", JSON.stringify(Array.from(next))); } catch {}
                          return next;
                        });
                      }}
                    >
                      {isDateExpanded ? t(expiry.expired ? "reminders.expiredOn" : "reminders.expiresOn", { date: expiry.absoluteDate }) : expiry.label}
                    </button>
                  );
                })()}
              </div>
              <button
                onClick={() => handleDismissClick(alert)}
                aria-label="Dismiss alert"
                data-testid={`button-dismiss-alert-${idx}`}
                className="shrink-0 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      )}

      {insightItems.length > 0 && (
        <section data-testid="card-patient-insights" className="animate-drift-up">
          <Card className="rounded-lg glass-card border-0 shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {t("home.pharmacyInsights")}
                </p>
              </div>
              <div className="space-y-2.5">
                {insightItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      {item.title && (
                        <p className="text-sm font-semibold leading-snug" data-testid={`text-insight-title-${idx}`}>
                          {item.title}
                        </p>
                      )}
                      {(item.message ?? item.body) && (
                        <p className="text-sm text-muted-foreground leading-snug mt-0.5" data-testid={`text-insight-body-${idx}`}>
                          {item.message ?? item.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section data-testid="section-quick-actions" className="animate-drift-up-1">
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <Link key={action.testId} href={action.href}>
              <div
                className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${action.gradient} p-4 min-h-[100px] flex flex-col justify-between hover-elevate active-elevate-2 cursor-pointer transition-all animate-drift-up-${i + 1}`}
                data-testid={action.testId}
              >
                <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-white/10" />
                <div className="absolute -right-1 -bottom-4 w-10 h-10 rounded-full bg-white/5" />
                <div className={`w-9 h-9 rounded-xl ${action.iconBg} flex items-center justify-center`} aria-hidden="true">
                  <action.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-white block leading-tight">{action.label}</span>
                  <span className="text-xs text-white/85 block mt-0.5">{action.description}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Card className="overflow-hidden rounded-lg animate-drift-up-2 glass-card border-0 shadow-sm" data-testid="card-health-tip">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400/20 to-sky-300/20 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-0.5 uppercase tracking-wider">{t("home.dailyTip")}</p>
            <p className="text-[15px] text-foreground leading-relaxed" data-testid="text-health-tip">{tip}</p>
          </div>
        </CardContent>
      </Card>

      {upcomingRefills.length > 0 && (
        <section data-testid="section-upcoming-refills" className="animate-drift-up-2">
          <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("home.upcomingRefills")}
          </h2>
          <div className="space-y-2">
            {upcomingRefills.map((med) => {
              const days = getDaysUntil(med.nextRefillDate!);
              const isOverdue = days <= 0;
              return (
                <Card key={med.id} className={`rounded-lg overflow-hidden ${isOverdue ? "border-l-4 border-l-orange-400" : "border-l-4 border-l-blue-400/50"}`} data-testid={`card-upcoming-refill-${med.id}`}>
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isOverdue ? "bg-orange-100 dark:bg-orange-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`} aria-hidden="true">
                      <Pill className={`h-4 w-4 ${isOverdue ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold truncate">{med.name}</p>
                      <p className={`text-sm ${isOverdue ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}>
                        {isOverdue ? t("home.overdue") : days === 0 ? t("home.today") : `${days} ${days !== 1 ? t("home.daysLeft") : t("home.dayLeft")}`}
                      </p>
                    </div>
                    <Link href="/medications">
                      <Button size="sm" variant={isOverdue ? "default" : "outline"} className="h-9 text-sm" data-testid={`button-refill-upcoming-${med.id}`}>
                        {t("home.rxRefill")}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section data-testid="status-medication-card" className="animate-drift-up-3">
        <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Pill className="h-3.5 w-3.5" />
          {t("home.medicationStatus")}
        </h2>
        {!hasPharmacyRecords ? (
          <Card className="rounded-lg glass-card border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("home.medicationRecordsNotConnected")}</p>
              <Link href="/records">
                <Button size="sm" variant="outline">{t("home.connectRecords")}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : isMedsLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <Card className="rounded-lg glass-card border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center justify-center w-16 h-16 rounded-lg bg-primary/8">
                  <span className="text-3xl font-bold text-primary leading-none" data-testid="text-active-meds-count">
                    {activeMeds.length}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">{t("medications.active")}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {allGood ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                      <span className="text-[15px] text-muted-foreground" data-testid="text-status-good">
                        {t("home.allOnTrack")}
                      </span>
                    </div>
                  ) : activeMeds.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="text-[15px] text-muted-foreground">{t("home.viewMedications")}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
                      <span className="text-[15px]" data-testid="text-refill-needed-count">
                        <strong className="text-orange-600 dark:text-orange-400">{needsRefill.length}</strong>{" "}
                        <span className="text-muted-foreground">{t("home.lowRefills")}</span>
                      </span>
                    </div>
                  )}
                </div>

                {needsRefill.length > 0 && (
                  <Link href="/medications">
                    <Button size="sm" className="h-9" data-testid="button-refill-now">
                      {t("home.rxRefill")}
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {lastOtcOrder && (
        <section data-testid="section-quick-reorder" className="animate-drift-up-3">
          <Card className="rounded-lg glass-card border-0 shadow-sm">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0" aria-hidden="true">
                <RotateCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold">{t("home.otcOrderType")}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {lastOtcOrder.totalItems} {(lastOtcOrder.totalItems ?? 0) !== 1 ? t("common.items") : t("common.item")}
                  {lastOtcOrder.createdAt && (
                    <> &middot; {new Date(lastOtcOrder.createdAt).toLocaleDateString(getDateLocale(i18n.language), { month: "short", day: "numeric" })}</>
                  )}
                </p>
              </div>
              <Link href="/orders">
                <Button size="sm" variant="outline" className="h-9 text-sm" data-testid="button-reorder">
                  {t("home.placeOrder")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      {(isOrdersLoading || recentOrders.length > 0) && (
      <section data-testid="section-recent-orders" className="animate-drift-up-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Package className="h-3.5 w-3.5" />
            {t("home.recentOrders")}
          </h2>
          {recentOrders.length > 0 && (
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid="button-view-all-orders">
                {t("home.viewAll")}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          )}
        </div>
        {isOrdersLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-18 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => {
              const isActive = order.status && ["pending", "preparing", "verified", "ready"].includes(order.status);
              return (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <Card
                    className="hover-elevate active-elevate-2 cursor-pointer rounded-lg glass-card border-0 shadow-sm"
                    data-testid={`card-order-${order.id}`}
                  >
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isActive ? "bg-primary/10" : "bg-muted/50"
                          }`}>
                            {order.deliveryMethod === "delivery" ? (
                              <Truck className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            ) : (
                              <Store className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold truncate" data-testid={`text-order-type-${order.id}`}>
                              {friendlyOrderType(order.orderType, t)}
                            </p>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <span>{order.totalItems} {(order.totalItems ?? 0) !== 1 ? t("common.items") : t("common.item")}</span>
                              {order.createdAt && (
                                <>
                                  <span className="text-border">&middot;</span>
                                  <span>
                                    {new Date(order.createdAt).toLocaleDateString(getDateLocale(i18n.language), {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                </>
                              )}
                              {isActive && order.estimatedReadyTime && (
                                <>
                                  <span className="text-border">&middot;</span>
                                  <span className="flex items-center gap-0.5">
                                    <Timer className="h-3 w-3" />
                                    {order.estimatedReadyTime}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColor(order.status)}`}
                            data-testid={`badge-order-status-${order.id}`}
                          >
                            {statusLabel(order.status, t)}
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      )}

      <section data-testid="section-pharmacy-info" className="animate-drift-up-5">
        <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Heart className="h-3.5 w-3.5" />
          {t("home.pharmacyStatus")}
        </h2>
        <Card className="rounded-lg glass-card border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-primary/20 to-blue-400/10 flex items-center justify-center shrink-0" aria-hidden="true">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold" data-testid="text-pharmacy-name">{t("common.concordiaPharmacy")}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-2 h-2 rounded-full ${pharmacyStatus.isOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                  <span className={`text-sm ${pharmacyStatus.isOpen ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"}`} data-testid="text-pharmacy-status">
                    {pharmacyStatus.label}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <a href="tel:7183282833" className="flex-1">
                <Button variant="outline" size="sm" className="w-full h-9" data-testid="button-call-pharmacy-home">
                  <Phone className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {t("home.callPharmacy")}
                </Button>
              </a>
              <Link href="/pharmacy-chat" className="flex-1">
                <Button variant="outline" size="sm" className="w-full h-9" data-testid="button-message-pharmacy-home">
                  <MessageCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {t("nav.pharmacyMessages")}
                </Button>
              </Link>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs" data-testid="text-pharmacy-hours">
                <span>Mon-Fri 9-7 &middot; Sat 10-4 &middot; Sun Closed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <OrderStatusPill />

    </div>

    <AlertDialog open={pendingDismissKey !== null} onOpenChange={(open) => { if (!open) setPendingDismissKey(null); }}>
      <AlertDialogContent data-testid="dialog-dismiss-expiry-warning">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("home.dismissAlertTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("home.dismissAlertDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-dismiss-expiry-cancel">{t("home.dismissAlertCancel")}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-dismiss-expiry-confirm"
            onClick={() => {
              if (pendingDismissKey !== null) {
                dismissAlert(pendingDismissKey);
                setPendingDismissKey(null);
              }
            }}
          >
            {t("home.dismissAlertConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
