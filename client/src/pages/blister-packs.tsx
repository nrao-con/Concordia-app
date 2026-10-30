import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Check, Pill, Clock, Trash2,
  Flame, ChevronDown, ChevronUp, X, SkipForward,
  User, AlertTriangle, Phone,
} from "lucide-react";
import { BlisterPackIllustration } from "@/components/illustrations";
import type { BlisterPack, BlisterDoseSlot } from "@shared/schema";
import { CompanionProductShelf } from "@/components/companion-product-shelf";

const TIME_SLOT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  Morning: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400", label: "AM" },
  Afternoon: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", label: "PM" },
  Evening: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400", label: "EVE" },
  Bedtime: { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-600 dark:text-sky-400", label: "BED" },
};

const TIME_SLOT_ORDER = ["Morning", "Afternoon", "Evening", "Bedtime"];

const STATUS_STYLES: Record<string, { cell: string; dot: string }> = {
  taken: { cell: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700", dot: "bg-green-500" },
  missed: { cell: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700", dot: "bg-red-500" },
  skipped: { cell: "bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600", dot: "bg-gray-400" },
  pending: { cell: "bg-white dark:bg-gray-900 border-border", dot: "bg-gray-300 dark:bg-gray-600" },
};

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getNextDose(doses: BlisterDoseSlot[]): BlisterDoseSlot | null {
  const now = new Date();
  const pending = doses
    .filter((d) => d.status === "pending" && new Date(d.plannedDate) >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime());
  return pending[0] || null;
}

function getAdherence(doses: BlisterDoseSlot[]): { percent: number; labelKey: string } {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const relevant = doses.filter((d) => {
    const dt = new Date(d.plannedDate);
    return dt >= weekAgo && dt <= now && (d.status === "taken" || d.status === "missed");
  });
  if (relevant.length === 0) return { percent: 100, labelKey: "noDataYet" };
  const taken = relevant.filter((d) => d.status === "taken").length;
  const pct = Math.round((taken / relevant.length) * 100);
  if (pct >= 90) return { percent: pct, labelKey: "onTrack" };
  if (pct >= 70) return { percent: pct, labelKey: "needsAttention" };
  return { percent: pct, labelKey: "fallingBehind" };
}

function getCountdownKey(date: Date): { key: string; days?: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return { key: "today" };
  if (diffDays === 1) return { key: "tomorrow" };
  if (diffDays < 0) return { key: "daysAgo", days: Math.abs(diffDays) };
  return { key: "inDays", days: diffDays };
}

function DayDetailModal({
  day,
  doses,
  packId,
  onClose,
  pUrl,
}: {
  day: Date;
  doses: BlisterDoseSlot[];
  packId: number;
  onClose: () => void;
  pUrl: (base: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dayDoses = doses
    .filter((d) => isSameDay(new Date(d.plannedDate), day))
    .sort((a, b) => TIME_SLOT_ORDER.indexOf(a.timeSlot) - TIME_SLOT_ORDER.indexOf(b.timeSlot));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNorm = new Date(day);
  dayNorm.setHours(0, 0, 0, 0);
  const isFutureDay = dayNorm > today;

  const mutation = useMutation({
    mutationFn: async ({ slotId, status }: { slotId: number; status: string }) => {
      const res = await apiRequest("PATCH", pUrl(`/api/blister-packs/${packId}/doses/${slotId}`), { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl(`/api/blister-packs/${packId}/doses`)] });
    },
    onError: (err: Error) => {
      toast({ title: t("blisterPacks.deleteFailed"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" data-testid="modal-day-detail">
      <Card className="w-full sm:max-w-lg rounded-t-xl sm:rounded-lg max-h-[80vh] overflow-y-auto animate-spring-up">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Calendar className="h-5 w-5" aria-hidden="true" />
            {day.toLocaleDateString(getDateLocale(i18n.language), { weekday: "long", month: "long", day: "numeric" })}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-day-detail" aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          {isFutureDay && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm" data-testid="future-day-notice">
              <Clock className="h-4 w-4 shrink-0" />
              {t("blisterPacks.futureDayNotice")}
            </div>
          )}
          {dayDoses.length === 0 ? (
            <p className="text-lg text-muted-foreground text-center py-6">{t("blisterPacks.noMedsScheduled")}</p>
          ) : (
            dayDoses.map((dose) => {
              const slotStyle = TIME_SLOT_COLORS[dose.timeSlot] || TIME_SLOT_COLORS.Morning;
              const isTaken = dose.status === "taken";
              const isSkipped = dose.status === "skipped";
              const isMissed = dose.status === "missed";
              return (
                <div
                  key={dose.id}
                  className={`flex items-center justify-between gap-3 p-4 rounded-xl border transition-all duration-300 ${
                    isTaken ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" :
                    isMissed ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" :
                    isSkipped ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700" :
                    "border-border"
                  } ${isTaken ? "animate-dose-taken" : ""}`}
                  data-testid={`row-dose-${dose.id}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl ${slotStyle.bg} flex items-center justify-center shrink-0`} aria-hidden="true">
                      <Pill className={`h-5 w-5 ${slotStyle.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-semibold truncate">{dose.medicationName}</p>
                      <p className="text-sm text-muted-foreground">{dose.dosage} &middot; {dose.timeSlot}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isFutureDay ? (
                      <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-scheduled-${dose.id}`}>
                        <Clock className="h-3 w-3 mr-1" /> {t("blisterPacks.scheduled")}
                      </Badge>
                    ) : isTaken ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-300"
                        onClick={() => mutation.mutate({ slotId: dose.id, status: "pending" })}
                        disabled={mutation.isPending}
                        data-testid={`button-undo-taken-${dose.id}`}
                      >
                        <Check className="h-4 w-4 mr-1 animate-pop-in" /> {t("blisterPacks.taken")}
                      </Button>
                    ) : isSkipped ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-gray-500"
                        onClick={() => mutation.mutate({ slotId: dose.id, status: "pending" })}
                        disabled={mutation.isPending}
                        data-testid={`button-undo-skipped-${dose.id}`}
                      >
                        {t("blisterPacks.skipped")}
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={() => mutation.mutate({ slotId: dose.id, status: "taken" })}
                          disabled={mutation.isPending}
                          data-testid={`button-mark-taken-${dose.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" /> {t("blisterPacks.take")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mutation.mutate({ slotId: dose.id, status: "skipped" })}
                          disabled={mutation.isPending}
                          data-testid={`button-skip-${dose.id}`}
                          aria-label="Skip dose"
                        >
                          <SkipForward className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PillGrid({ pack, doses, pUrl }: { pack: BlisterPack; doses: BlisterDoseSlot[]; pUrl: (base: string) => string }) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDay, setSelectedDay] = useState<Date | null>(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const todayDoses = doses.filter(d => isSameDay(new Date(d.plannedDate), t0));
    if (todayDoses.length > 0) return t0;
    const upcoming = doses
      .filter(d => d.status === "pending" && new Date(d.plannedDate) > t0)
      .sort((a, b) => new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime());
    if (upcoming.length > 0) {
      const day = new Date(upcoming[0].plannedDate);
      day.setHours(0, 0, 0, 0);
      return day;
    }
    return null;
  });

  const startDate = pack.startDate ? new Date(pack.startDate) : new Date();
  startDate.setHours(0, 0, 0, 0);
  const totalDays = pack.durationDays ?? 30;

  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }

  const cols = totalDays <= 7 ? 7 : totalDays <= 14 ? 7 : totalDays <= 28 ? 7 : 6;
  const takenCount = doses.filter((d) => d.status === "taken").length;
  const totalCount = doses.length;
  const progressPct = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {days.map((day, idx) => {
          const isToday = isSameDay(day, today);
          const isPast = day < today && !isToday;
          const isFuture = day > today && !isToday;
          const dayDoses = doses.filter((d) => isSameDay(new Date(d.plannedDate), day));
          const allTaken = dayDoses.length > 0 && dayDoses.every((d) => d.status === "taken");
          const hasMissed = dayDoses.some((d) => d.status === "missed");
          const hasSkipped = dayDoses.some((d) => d.status === "skipped") && !hasMissed;

          let cellStyle = STATUS_STYLES.pending.cell;
          if (allTaken) cellStyle = STATUS_STYLES.taken.cell;
          else if (hasMissed) cellStyle = STATUS_STYLES.missed.cell;
          else if (hasSkipped) cellStyle = STATUS_STYLES.skipped.cell;

          const dayLabel = day.toLocaleDateString(getDateLocale(i18n.language), { weekday: "narrow" });

          return (
            <button
              key={idx}
              className={`relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[48px] border transition-all duration-300 liquid-fill ${allTaken ? "liquid-filled" : ""} ${cellStyle} ${
                isToday ? "ring-2 ring-primary" : ""
              } ${isPast && !allTaken && !hasMissed ? "opacity-60" : ""} ${isFuture ? "opacity-40" : ""}`}
              onClick={() => setSelectedDay(day)}
              data-testid={`button-pill-${idx}`}
            >
              <span className="text-xs text-muted-foreground leading-none">{dayLabel}</span>
              <span className={`text-sm font-semibold leading-tight ${isToday ? "text-primary" : ""}`}>{day.getDate()}</span>
              {allTaken && <Check className="h-3 w-3 text-green-500 absolute top-0.5 right-0.5 animate-pop-in" />}
              {hasMissed && <div className="w-1.5 h-1.5 rounded-full bg-red-500 absolute top-0.5 right-0.5" />}
              <div className="flex gap-0.5 mt-0.5">
                {dayDoses.map((d) => {
                  const color = TIME_SLOT_COLORS[d.timeSlot];
                  return (
                    <div
                      key={d.id}
                      className={`w-1.5 h-1.5 rounded-full ${
                        d.status === "taken" ? "bg-green-500" :
                        d.status === "missed" ? "bg-red-500" :
                        d.status === "skipped" ? "bg-gray-400" :
                        color?.text?.includes("orange") ? "bg-orange-400" :
                        color?.text?.includes("blue") ? "bg-blue-400" :
                        color?.text?.includes("purple") ? "bg-purple-400" :
                        "bg-sky-400"
                      }`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5" data-testid="progress-bar-section">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{takenCount} {t("blisterPacks.ofTaken")} {totalCount} {t("blisterPacks.progressTaken")}</span>
          <span className="font-medium">{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30 border border-green-300" /> {t("blisterPacks.taken")}</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-300" /> {t("blisterPacks.missed")}</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800/50 border border-gray-300" /> {t("blisterPacks.skipped")}</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-white dark:bg-gray-900 border border-border" /> {t("blisterPacks.pending")}</div>
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          doses={doses}
          packId={pack.id}
          onClose={() => setSelectedDay(null)}
          pUrl={pUrl}
        />
      )}
    </div>
  );
}

const RING_CONFIG = [
  { slot: "Morning", color: "hsl(194, 48%, 67%)", trackColor: "hsl(194, 48%, 67%, 0.15)", label: "AM" },
  { slot: "Afternoon", color: "hsl(97, 38%, 68%)", trackColor: "hsl(97, 38%, 68%, 0.15)", label: "PM" },
  { slot: "Evening", color: "hsl(23, 72%, 76%)", trackColor: "hsl(23, 72%, 76%, 0.15)", label: "EVE" },
  { slot: "Bedtime", color: "hsl(167, 45%, 65%)", trackColor: "hsl(167, 45%, 65%, 0.15)", label: "BED" },
];

function ConcentricRings({ doses, animKey }: { doses: BlisterDoseSlot[]; animKey?: string | number }) {
  const size = 120;
  const center = size / 2;
  const strokeWidth = 6;
  const gap = 3;

  const rings = useMemo(() => {
    return RING_CONFIG.map((cfg, i) => {
      const radius = center - strokeWidth / 2 - i * (strokeWidth + gap);
      const circumference = 2 * Math.PI * radius;
      const slotDoses = doses.filter((d) => d.timeSlot === cfg.slot);
      const total = slotDoses.length;
      const taken = slotDoses.filter((d) => d.status === "taken").length;
      const ratio = total > 0 ? taken / total : 0;
      const offset = circumference * (1 - ratio);
      return { ...cfg, radius, circumference, offset, taken, total, ratio };
    });
  }, [doses, center]);

  const overallTotal = doses.length;
  const overallTaken = doses.filter((d) => d.status === "taken").length;
  const overallPct = overallTotal > 0 ? Math.round((overallTaken / overallTotal) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2" data-testid="concentric-rings">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90" key={animKey}>
        {rings.map((ring, i) => (
          <g key={ring.slot}>
            <circle
              cx={center}
              cy={center}
              r={ring.radius}
              fill="none"
              stroke={ring.trackColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            <circle
              cx={center}
              cy={center}
              r={ring.radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={ring.circumference}
              strokeDashoffset={ring.circumference}
              className={`animate-ring-draw animate-ring-draw-${i + 1}`}
              style={{
                "--ring-circumference": `${ring.circumference}`,
                "--ring-target": `${ring.offset}`,
              } as React.CSSProperties}
            />
          </g>
        ))}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground rotate-90 origin-center"
          style={{ fontSize: "18px", fontWeight: 700 }}
        >
          {overallPct}%
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {rings.map((ring) => (
          <div key={ring.slot} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ring.color }} />
            <span>{ring.label} {ring.taken}/{ring.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlisterPackCard({ pack }: { pack: BlisterPack }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);

  const { data: doses, isLoading: isDosesLoading } = useQuery<BlisterDoseSlot[]>({
    queryKey: [pUrl(`/api/blister-packs/${pack.id}/doses`)],
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", pUrl(`/api/blister-packs/${pack.id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/blister-packs")] });
      toast({ title: t("blisterPacks.blisterPackDeleted"), description: `${pack.name} ${t("blisterPacks.hasBeenRemoved")}` });
    },
    onError: (err: Error) => {
      toast({ title: t("blisterPacks.deleteFailed"), description: err.message, variant: "destructive" });
    },
  });

  const allDoses = doses ?? [];
  const pillsLeft = allDoses.filter((d) => d.status === "pending").length;
  const medsPerDay = pack.medications?.length || 1;
  const daysLeft = medsPerDay > 0 ? Math.floor(pillsLeft / medsPerDay) : 0;
  const needsRefill = daysLeft <= 7 && daysLeft >= 0 && allDoses.length > 0;
  const nextDose = getNextDose(allDoses);
  const adherence = getAdherence(allDoses);

  const medsSummary = pack.medications && pack.medications.length > 0
    ? pack.medications.map((m: any) => `${m.name} ${m.strength || m.dosage}`).join(", ")
    : t("blisterPacks.noMedicationsAssigned");

  return (
    <Card className={`glass-card rounded-lg overflow-visible ${needsRefill ? "ring-2 ring-orange-400 dark:ring-orange-500" : ""}`} data-testid={`card-pack-${pack.id}`}>
      <CardContent className="p-0">
        {needsRefill && (
          <div className="flex items-center gap-2 px-5 py-3 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 animate-pulse" data-testid={`banner-refill-${pack.id}`}>
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              {t("blisterPacks.refillNeeded")} — {daysLeft === 0 ? t("blisterPacks.noDaysRemaining") : t("blisterPacks.onlyDaysLeft", { days: daysLeft })}
            </p>
          </div>
        )}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0" aria-hidden="true">
                <BlisterPackIllustration className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate" data-testid={`text-pack-name-${pack.id}`}>{pack.name}</h3>
                <p className="text-sm text-muted-foreground truncate" data-testid={`text-pack-meds-${pack.id}`}>{medsSummary}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pack.pharmFlowSynced && pack.pharmFlowStatus && (
                <Badge variant="outline" className="text-xs" data-testid={`badge-pharmacy-status-${pack.id}`}>
                  {pack.pharmFlowStatus}
                </Badge>
              )}
              <Badge variant={pack.status === "active" ? "default" : "secondary"} data-testid={`badge-status-${pack.id}`}>
                {pack.status ?? "unknown"}
              </Badge>
            </div>
          </div>

          {pack.enteredByInitials && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`text-entered-by-${pack.id}`}>
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("blisterPacks.enteredBy")}: {pack.enteredByInitials.toUpperCase()} ({pack.enteredByRole === "tech" ? t("blisterPacks.technician") : t("blisterPacks.cashier")})</span>
            </div>
          )}

          {isDosesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-36" />
            </div>
          ) : allDoses.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <ConcentricRings doses={allDoses} animKey={allDoses.filter(d => d.status === "taken").length} />
              <div className="flex-1 space-y-2 min-w-0 w-full">
                {nextDose && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50" data-testid={`text-next-dose-${pack.id}`}>
                    <Clock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{t("blisterPacks.nextDose")}</p>
                      <p className="text-sm font-medium truncate">
                        {(() => { const cd = getCountdownKey(new Date(nextDose.plannedDate)); return cd.days !== undefined ? t(`blisterPacks.${cd.key}`, { days: cd.days }) : t(`blisterPacks.${cd.key}`); })()} &middot; {nextDose.timeSlot}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50" data-testid={`text-pills-left-${pack.id}`}>
                  <Pill className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("blisterPacks.daysRemaining")}</p>
                    <p className="text-sm font-medium">{daysLeft} {t("blisterPacks.daysLeft")} &middot; {pillsLeft} {t("blisterPacks.pillsLeft")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50" data-testid={`text-adherence-${pack.id}`}>
                  <Flame className={`h-4 w-4 shrink-0 ${adherence.percent >= 90 ? "text-green-500" : adherence.percent >= 70 ? "text-orange-500" : "text-red-500"}`} aria-hidden="true" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("blisterPacks.adherence")}</p>
                    <p className="text-sm font-medium">
                      {t(`blisterPacks.${adherence.labelKey}`)} &middot; {adherence.percent}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("blisterPacks.noMedicationsAssigned")}</p>
          )}

          {pack.medications && pack.medications.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("blisterPacks.addMedication")}</p>
              {pack.medications.map((med: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`text-med-detail-${pack.id}-${idx}`}>
                  <Pill className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{med.name}</span>
                  {med.strength && <span className="text-muted-foreground">{med.strength}</span>}
                  {med.quantity && <span className="text-muted-foreground">&middot; {med.quantity}</span>}
                  <span className="text-muted-foreground">&middot; {med.timeSlot}</span>
                  {med.instructions && <span className="text-sm text-muted-foreground italic ml-auto truncate max-w-[120px]">{med.instructions}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 py-3 border-t text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-toggle-calendar-${pack.id}`}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? t("blisterPacks.monthView") : t("blisterPacks.weekView")}
        </button>

        {expanded && allDoses.length > 0 && (
          <div className="p-5 pt-2 border-t">
            <PillGrid pack={pack} doses={allDoses} pUrl={pUrl} />
          </div>
        )}

        {expanded && allDoses.length === 0 && (
          <div className="p-5 pt-2 border-t text-center">
            <p className="text-muted-foreground">{t("blisterPacks.noMedicationsAssigned")}</p>
          </div>
        )}

        {expanded && (() => {
          const medIds = (pack.medications ?? [])
            .filter((m: any) => m.medicationId)
            .map((m: any) => m.medicationId as number);
          if (medIds.length === 0) return null;
          return (
            <div className="px-5 pb-4">
              <CompanionProductShelf medicationIds={medIds} />
            </div>
          );
        })()}

        <div className="border-t px-5 py-3">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-600 dark:text-red-400 flex-1">{t("blisterPacks.deleteConfirm")}</p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid={`button-confirm-delete-${pack.id}`}
              >
                {deleteMutation.isPending ? t("common.saving") : t("blisterPacks.yesDelete")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                data-testid={`button-cancel-delete-${pack.id}`}
              >
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid={`button-delete-pack-${pack.id}`}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> {t("common.delete")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BlisterPacks() {
  const { t } = useTranslation();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const { data: packs, isLoading } = useQuery<BlisterPack[]>({
    queryKey: [pUrl("/api/blister-packs")],
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="rounded-lg">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : packs && packs.length > 0 ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("blisterPacks.title")}</h3>
            </div>
            <div className="h-px flex-1 bg-border" />
            <Badge variant="secondary">{packs.length}</Badge>
          </div>
          {packs.map((pack, idx) => (
            <div key={pack.id} className={`animate-drift-up-${Math.min(idx + 1, 8)}`}>
              <BlisterPackCard pack={pack} />
            </div>
          ))}
        </div>
      ) : (
        <Card className="glass-card animate-fade-in" data-testid="card-empty-packs">
          <CardContent className="flex flex-col items-center justify-center py-14 space-y-4">
            <div className="w-24 h-24 rounded-full bg-green-100/50 dark:bg-green-900/20 flex items-center justify-center">
              <BlisterPackIllustration className="w-14 h-14" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-medium" data-testid="text-no-packs">{t("blisterPacks.noPacks")}</p>
              <p className="text-base text-muted-foreground max-w-xs mx-auto" data-testid="text-pharmacy-setup-info">
                {t("blisterPacks.pharmacySetupInfo")}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto" data-testid="text-contact-pharmacy">
                {t("blisterPacks.contactPharmacyToRequest")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.location.href = "tel:7183282833"}
              data-testid="button-call-pharmacy"
            >
              <Phone className="h-4 w-4 mr-2" /> {t("common.callPharmacy")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
