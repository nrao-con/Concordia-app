import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, clearIdempotencyKey, getIdempotencyKey, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pill,
  Calendar,
  User,
  Hash,
  AlertCircle,
  CheckCircle2,
  Snowflake,
  ShieldAlert,
  Users,
  Trash2,
  RefreshCw,
  Store,
  Search,
  MessageCircle,
  Truck,
  ShoppingCart,
  Salad,
  ArrowRight,
  Tag,
  X,
} from "lucide-react";
import { PillOrganizer } from "@/components/illustrations";
import { useCart } from "@/hooks/use-cart";
import { CompanionProductShelf } from "@/components/companion-product-shelf";
import type { Medication } from "@shared/schema";

type MedWithCondition = Medication & {
  linkedCondition: { id: number; conditionName: string; linkId: number } | null;
};

type PatientCondition = {
  id: number;
  conditionName: string;
  status: string | null;
};

function RefillBadge({ count }: { count: number | null }) {
  const { t } = useTranslation();
  if (count === null || count === undefined) return null;
  let colorClass = "bg-primary/15 text-primary border-primary/20";
  if (count === 0) colorClass = "bg-destructive/10 text-destructive border-destructive/20";
  else if (count <= 2) colorClass = "bg-orange-100/60 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700";
  return (
    <Badge variant="outline" className={colorClass} data-testid="badge-refills">
      {count} {t("medications.refillsCount")}
    </Badge>
  );
}

function isRefillDueSoon(med: Medication): boolean {
  if (!med.nextRefillDate || !med.isActive) return false;
  const now = new Date();
  const refillDate = new Date(med.nextRefillDate);
  const daysUntil = Math.ceil((refillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntil <= 5;
}

function useRefillDueLabel() {
  const { t } = useTranslation();
  return (med: Medication): string => {
    if (!med.nextRefillDate) return "";
    const now = new Date();
    const refillDate = new Date(med.nextRefillDate);
    const daysUntil = Math.ceil((refillDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) return t("medications.refillOverdue");
    if (daysUntil === 1) return t("medications.refillDueTomorrow");
    return t("medications.refillDueInDays", { days: daysUntil });
  };
}

export default function Medications() {
  const { t, i18n } = useTranslation();
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refillMed, setRefillMed] = useState<MedWithCondition | null>(null);
  const [refillDelivery, setRefillDelivery] = useState<"pickup" | "delivery">("pickup");
  const [refillAddress, setRefillAddress] = useState("");
  const [highlightedMedId, setHighlightedMedId] = useState<number | null>(null);
  const { toast } = useToast();
  const refillDueLabel = useRefillDueLabel();
  const { isProxy, activePatientId } = usePatientContext();
  const { user } = useAuth();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const [, setLocation] = useLocation();
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: medications, isLoading } = useQuery<MedWithCondition[]>({
    queryKey: [pUrl("/api/medications")],
  });

  const { data: patientProfile } = useQuery<{
    deliveryAddress?: string | null;
    preferredDeliveryMethod?: string | null;
  }>({
    queryKey: [pUrl("/api/profile")],
  });

  const { data: conditions } = useQuery<PatientCondition[]>({
    queryKey: [pUrl("/api/conditions")],
  });

  const medsKey = [pUrl("/api/medications")];

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", pUrl(`/api/medications/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medsKey });
      toast({ title: t("medications.medicationRemoved"), description: t("medications.medicationRemovedDesc") });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const confirmRefillMutation = useMutation({
    mutationFn: async (id: number) => {
      const scope = `confirm-refill:${id}`;
      const res = await apiRequest("POST", pUrl(`/api/medications/${id}/confirm-refill`), undefined, {
        "Idempotency-Key": getIdempotencyKey(scope),
      });
      return res.json();
    },
    onSuccess: (_data, id) => {
      clearIdempotencyKey(`confirm-refill:${id}`);
      queryClient.invalidateQueries({ queryKey: medsKey });
      toast({ title: t("medications.refillConfirmed"), description: t("medications.refillConfirmedDesc") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const linkConditionMutation = useMutation({
    mutationFn: async ({ medicationId, conditionId }: { medicationId: number; conditionId: number }) => {
      const res = await apiRequest("POST", pUrl("/api/conditions/medication-link"), { medicationId, conditionId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medsKey });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/conditions")] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const unlinkConditionMutation = useMutation({
    mutationFn: async (linkId: number) => {
      await apiRequest("DELETE", pUrl(`/api/conditions/medication-link/${linkId}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: medsKey });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/conditions")] });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const { totalItems: cartItemCount } = useCart();

  const requestRefillMutation = useMutation({
    mutationFn: async ({
      med,
      delivery,
      address,
    }: {
      med: MedWithCondition;
      delivery: "pickup" | "delivery";
      address: string;
    }) => {
      const scope = `rx-order:${med.id}:${delivery}:${delivery === "delivery" ? address : ""}`;
      const res = await apiRequest("POST", pUrl("/api/orders"), {
        orderType: "rx_refill",
        deliveryMethod: delivery,
        deliveryAddress: delivery === "delivery" ? address : null,
        totalItems: 1,
        items: [{ medicationId: med.id, productName: med.name, productType: "rx", quantity: 1 }],
      }, { "Idempotency-Key": getIdempotencyKey(scope) });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      clearIdempotencyKey(`rx-order:${variables.med.id}:${variables.delivery}:${variables.delivery === "delivery" ? variables.address : ""}`);
      setRefillMed(null);
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/orders")] });
      toast({
        title: t("medications.refillRequested"),
        description: t("medications.refillRequestedDesc"),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!medications || medications.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const medIdParam = params.get("med");
    if (!medIdParam) return;
    const medId = parseInt(medIdParam, 10);
    if (isNaN(medId)) return;
    setHighlightedMedId(medId);
    const el = document.querySelector(`[data-testid="card-medication-${medId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedMedId(null), 4000);
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [medications]);

  const openRefillDialog = (med: MedWithCondition) => {
    const preferred = ((patientProfile?.preferredDeliveryMethod ?? user?.preferredDeliveryMethod) as "pickup" | "delivery") || "pickup";
    setRefillDelivery(preferred);
    setRefillAddress(patientProfile?.deliveryAddress ?? user?.deliveryAddress ?? "");
    setRefillMed(med);
  };

  const handleTalkToPharmacist = (medName: string) => {
    const prefill = encodeURIComponent(`I have a question about ${medName}`);
    setLocation(`/pharmacy-chat?prefill=${prefill}`);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-6" data-testid="medications-loading">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const hasMedications = medications && medications.length > 0;
  const hasActiveMedications = medications && medications.some(m => m.isActive !== false);

  return (
    <div className="p-4 pb-24 space-y-6 max-w-3xl mx-auto" data-testid="medications-page">
      <div className="flex items-center gap-3" data-testid="medications-header">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="h-4 w-4" />
          <span className="text-sm">{t("medications.managedByPharmacy")}</span>
        </div>
      </div>

      {!hasMedications && (
        <Card className="glass-card animate-fade-in" data-testid="card-empty-medications">
          <CardContent className="flex flex-col items-center justify-center py-14 space-y-4">
            <div className="w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center">
              <PillOrganizer className="w-14 h-14" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-medium">
                {t("medications.noMedicationsYet")}
              </p>
              <p className="text-base text-muted-foreground max-w-xs mx-auto">
                {t("medications.pharmacyWillAdd")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasMedications && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("medications.searchPlaceholder")}
            className="pl-9 min-h-[48px] text-base"
            data-testid="input-medication-search"
          />
        </div>
      )}

      {hasMedications && (() => {
        const q = searchQuery.trim().toLowerCase();
        const matchesMed = (m: MedWithCondition) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          (m.drugName ?? "").toLowerCase().includes(q);
        const activeMeds = medications!.filter(m => m.isActive !== false).filter(matchesMed);
        const inactiveMeds = medications!.filter(m => m.isActive === false).filter(matchesMed);
        return (
        <div className="space-y-6" data-testid="medications-list">
          {activeMeds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("medications.activeMedications")}</h3>
                </div>
                <div className="h-px flex-1 bg-border" />
                <Badge variant="secondary">{activeMeds.length}</Badge>
              </div>
              {activeMeds.map((med, i) => {
                const dueSoon = isRefillDueSoon(med);
                const isHighlighted = highlightedMedId === med.id;
                return (
                  <Card
                    key={med.id}
                    className={`glass-card animate-drift-up-${Math.min(i + 1, 8)} transition-shadow ${isHighlighted ? "ring-2 ring-primary shadow-lg" : ""}`}
                    data-testid={`card-medication-${med.id}`}
                  >
                <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold" data-testid={`text-medication-name-${med.id}`}>
                      {med.name}
                    </CardTitle>
                    {med.linkedCondition && (
                      <p
                        className="text-sm font-medium text-primary/80"
                        data-testid={`text-for-condition-${med.id}`}
                      >
                        {t("medications.forCondition", { condition: med.linkedCondition.conditionName })}
                      </p>
                    )}
                    <p className="text-lg text-muted-foreground" data-testid={`text-medication-dosage-${med.id}`}>
                      {med.dosage} - {med.frequency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={med.isActive !== false ? "default" : "secondary"}
                      data-testid={`badge-status-${med.id}`}
                    >
                      {med.isActive !== false ? t("medications.active") : t("medications.inactive")}
                    </Badge>
                    {med.category && (
                      <Badge variant="outline" data-testid={`badge-category-${med.id}`}>
                        {med.category === "otc" ? t("medications.otc") : t("medications.prescription")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {med.rxNumber && (
                      <div className="flex items-center gap-2 text-lg" data-testid={`text-rx-number-${med.id}`}>
                        <Hash className="h-5 w-5 text-muted-foreground" />
                        <span>Rx: {med.rxNumber}</span>
                      </div>
                    )}
                    {med.prescribedBy && (
                      <div className="flex items-center gap-2 text-lg" data-testid={`text-prescribed-by-${med.id}`}>
                        <User className="h-5 w-5 text-muted-foreground" />
                        <span>Dr. {med.prescribedBy}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <RefillBadge count={med.refillsRemaining ?? null} />
                    {med.refillsRemaining === 0 && (
                      <div className="flex items-center gap-1 text-red-600 text-lg">
                        <AlertCircle className="h-5 w-5" />
                        <span>{t("medications.noRefillsLeft")}</span>
                      </div>
                    )}
                  </div>

                  {dueSoon && (
                    <Button
                      variant="outline"
                      onClick={() => confirmRefillMutation.mutate(med.id)}
                      disabled={confirmRefillMutation.isPending}
                      className="w-full min-h-[52px] text-lg font-semibold border-2 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 animate-refill-pulse"
                      data-testid={`button-confirm-refill-${med.id}`}
                    >
                      <RefreshCw className="h-5 w-5 mr-2" />
                      {confirmRefillMutation.isPending
                        ? t("medications.updating")
                        : `${refillDueLabel(med)} -- ${t("medications.didYouRefill")}`}
                    </Button>
                  )}

                  {(med.fridgeItem || med.controlledMedication || med.familyMember) && (
                    <div className="flex flex-wrap gap-2" data-testid={`flags-${med.id}`}>
                      {med.fridgeItem && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                          <Snowflake className="h-3.5 w-3.5 mr-1" /> {t("medications.fridge")}
                        </Badge>
                      )}
                      {med.controlledMedication && (
                        <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">
                          <ShieldAlert className="h-3.5 w-3.5 mr-1" /> {t("medications.controlled")}
                        </Badge>
                      )}
                      {med.familyMember && (
                        <Badge variant="outline" className="text-primary border-primary/30">
                          <Users className="h-3.5 w-3.5 mr-1" /> {t("medications.family")}
                        </Badge>
                      )}
                    </div>
                  )}

                  {med.nextRefillDate && !dueSoon && (
                    <div className="flex items-center gap-2 text-lg" data-testid={`text-next-refill-${med.id}`}>
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <span>{t("medications.nextRefill")}: {new Date(med.nextRefillDate).toLocaleDateString(getDateLocale(i18n.language))}</span>
                    </div>
                  )}

                  {med.instructions && (
                    <div className="text-lg text-muted-foreground" data-testid={`text-instructions-${med.id}`}>
                      {med.instructions}
                    </div>
                  )}

                  {/* Condition link */}
                  <div className="flex items-center gap-2 flex-wrap" data-testid={`section-condition-link-${med.id}`}>
                    {med.linkedCondition ? (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-primary border-primary/40 gap-1 pr-1"
                          data-testid={`badge-linked-condition-${med.id}`}
                        >
                          <Tag className="h-3 w-3" aria-hidden="true" />
                          {med.linkedCondition.conditionName}
                          <button
                            type="button"
                            aria-label={`Remove condition link for ${med.name}`}
                            onClick={() => unlinkConditionMutation.mutate(med.linkedCondition!.linkId)}
                            disabled={unlinkConditionMutation.isPending}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
                            data-testid={`button-unlink-condition-${med.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      </div>
                    ) : conditions && conditions.length > 0 ? (
                      <Select
                        onValueChange={(val) =>
                          linkConditionMutation.mutate({ medicationId: med.id, conditionId: parseInt(val) })
                        }
                        disabled={linkConditionMutation.isPending}
                      >
                        <SelectTrigger
                          className="h-8 text-sm w-auto min-w-[160px]"
                          data-testid={`select-condition-${med.id}`}
                        >
                          <Tag className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
                          <SelectValue placeholder={t("medications.tagCondition")} />
                        </SelectTrigger>
                        <SelectContent>
                          {conditions.map((c) => (
                            <SelectItem
                              key={c.id}
                              value={String(c.id)}
                              data-testid={`option-condition-${c.id}`}
                            >
                              {c.conditionName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => openRefillDialog(med)}
                      className="flex-1 min-h-[44px] text-base"
                      data-testid={`button-request-refill-${med.id}`}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("medications.requestRefillFor")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTalkToPharmacist(med.name)}
                      className="flex-1 min-h-[44px] text-base"
                      data-testid={`button-talk-pharmacist-${med.id}`}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      {t("medications.talkToPharmacist")}
                    </Button>
                  </div>

                  {/* Companion products shelf */}
                  <CompanionProductShelf medicationIds={[med.id]} medicationName={med.name} />

                  <div className="pt-2 border-t border-border/50">
                    {deleteConfirmId === med.id ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-base text-destructive font-medium">{t("medications.removeMedication")}</p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(med.id)}
                          disabled={deleteMutation.isPending}
                          className="min-h-[44px] text-base"
                          data-testid={`button-confirm-delete-${med.id}`}
                        >
                          {deleteMutation.isPending ? t("common.clearing") : t("medications.yesRemove")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                          className="min-h-[44px] text-base"
                          data-testid={`button-cancel-delete-${med.id}`}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(med.id)}
                        className="min-h-[44px] text-base text-destructive hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-medication-${med.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("medications.removeMedication")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
                );
              })}
            </div>
          )}

          {inactiveMeds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("medications.inactiveMedications")}</h3>
                </div>
                <div className="h-px flex-1 bg-border" />
                <Badge variant="secondary">{inactiveMeds.length}</Badge>
              </div>
              {inactiveMeds.map((med, i) => {
                const isHighlighted = highlightedMedId === med.id;
                return (
                  <Card
                    key={med.id}
                    className={`glass-card opacity-60 animate-drift-up-${Math.min(i + 1, 8)} transition-shadow ${isHighlighted ? "ring-2 ring-primary shadow-lg opacity-100" : ""}`}
                    data-testid={`card-medication-${med.id}`}
                  >
                <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold" data-testid={`text-medication-name-${med.id}`}>
                      {med.name}
                    </CardTitle>
                    {med.linkedCondition && (
                      <p
                        className="text-sm font-medium text-primary/80"
                        data-testid={`text-for-condition-${med.id}`}
                      >
                        {t("medications.forCondition", { condition: med.linkedCondition.conditionName })}
                      </p>
                    )}
                    <p className="text-lg text-muted-foreground" data-testid={`text-medication-dosage-${med.id}`}>
                      {med.dosage} - {med.frequency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" data-testid={`badge-status-${med.id}`}>
                      {t("medications.inactive")}
                    </Badge>
                    {med.category && (
                      <Badge variant="outline" data-testid={`badge-category-${med.id}`}>
                        {med.category === "otc" ? t("medications.otc") : t("medications.prescription")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {med.rxNumber && (
                      <div className="flex items-center gap-2 text-lg" data-testid={`text-rx-number-${med.id}`}>
                        <Hash className="h-5 w-5 text-muted-foreground" />
                        <span>Rx: {med.rxNumber}</span>
                      </div>
                    )}
                    {med.prescribedBy && (
                      <div className="flex items-center gap-2 text-lg" data-testid={`text-prescribed-by-${med.id}`}>
                        <User className="h-5 w-5 text-muted-foreground" />
                        <span>Dr. {med.prescribedBy}</span>
                      </div>
                    )}
                  </div>

                  {med.instructions && (
                    <div className="text-lg text-muted-foreground" data-testid={`text-instructions-${med.id}`}>
                      {med.instructions}
                    </div>
                  )}

                  <div className="pt-2 border-t border-border/50">
                    {deleteConfirmId === med.id ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-base text-destructive font-medium">{t("medications.removeMedication")}</p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(med.id)}
                          disabled={deleteMutation.isPending}
                          className="min-h-[44px] text-base"
                          data-testid={`button-confirm-delete-${med.id}`}
                        >
                          {deleteMutation.isPending ? t("common.clearing") : t("medications.yesRemove")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                          className="min-h-[44px] text-base"
                          data-testid={`button-cancel-delete-${med.id}`}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(med.id)}
                        className="min-h-[44px] text-base text-destructive hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-medication-${med.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("medications.removeMedication")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {hasActiveMedications && (
        <div
          className="glass-card rounded-xl p-5 flex items-start gap-4 border border-primary/20 bg-primary/5 animate-fade-in"
          data-testid="banner-nutrition-advisor"
        >
          <div className="shrink-0 w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
            <Salad className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-base font-semibold leading-snug" data-testid="text-nutrition-banner-heading">
              {t("medications.nutritionBannerHeading")}
            </p>
            <p className="text-sm text-muted-foreground" data-testid="text-nutrition-banner-body">
              {t("medications.nutritionBannerBody")}
            </p>
            <Button
              variant="default"
              size="sm"
              className="mt-3 min-h-[44px] text-base"
              onClick={() => setLocation("/nutrition-advisor")}
              data-testid="button-go-to-nutrition-advisor"
            >
              {t("medications.nutritionBannerCta")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={refillMed !== null} onOpenChange={(open) => { if (!open) setRefillMed(null); }}>
        <DialogContent className="max-w-sm mx-4" data-testid="dialog-request-refill">
          <DialogHeader>
            <DialogTitle className="text-xl" data-testid="text-refill-dialog-title">
              {t("medications.requestRefillFor")}
            </DialogTitle>
            <DialogDescription className="text-base font-medium text-foreground">
              {refillMed?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">{t("orders.howReceiveOrder")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={refillDelivery === "pickup" ? "default" : "outline"}
                className="min-h-[64px] text-base flex-col gap-1 h-auto py-3"
                onClick={() => setRefillDelivery("pickup")}
                data-testid="button-refill-pickup"
              >
                <Store className="h-5 w-5" />
                <span>{t("orders.pharmacyPickup")}</span>
              </Button>
              <Button
                variant={refillDelivery === "delivery" ? "default" : "outline"}
                className="min-h-[64px] text-base flex-col gap-1 h-auto py-3"
                onClick={() => setRefillDelivery("delivery")}
                data-testid="button-refill-delivery"
              >
                <Truck className="h-5 w-5" />
                <span>{t("orders.homeDelivery")}</span>
              </Button>
            </div>
            {refillDelivery === "delivery" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t("orders.deliveryAddress")}</p>
                <Input
                  value={refillAddress}
                  onChange={(e) => setRefillAddress(e.target.value)}
                  placeholder={t("orders.enterDeliveryAddress")}
                  className="min-h-[48px] text-base"
                  data-testid="input-refill-address"
                />
              </div>
            )}

            {/* Companion products in refill dialog */}
            {refillMed && (
              <CompanionProductShelf
                medicationIds={[refillMed.id]}
                medicationName={refillMed.name}
              />
            )}
          </div>
          {cartItemCount > 0 && (
            <div
              className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3"
              data-testid="banner-refill-cart-notice"
            >
              <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You have {cartItemCount} item{cartItemCount !== 1 ? "s" : ""} in your OTC cart.
                </p>
                <Link href="/cart" data-testid="link-refill-go-to-cart">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2">
                    Go to cart to check out together
                  </span>
                </Link>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 min-h-[48px] text-base"
              onClick={() => setRefillMed(null)}
              data-testid="button-refill-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 min-h-[48px] text-base"
              disabled={
                requestRefillMutation.isPending ||
                (refillDelivery === "delivery" && !refillAddress.trim())
              }
              onClick={() => {
                if (!refillMed) return;
                requestRefillMutation.mutate({ med: refillMed, delivery: refillDelivery, address: refillAddress });
              }}
              data-testid="button-refill-confirm"
            >
              {requestRefillMutation.isPending ? t("orders.placingOrder") : t("orders.confirmOrder")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
