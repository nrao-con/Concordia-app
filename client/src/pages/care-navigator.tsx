import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  ChevronRight,
  Plus,
  BookOpen,
  Activity,
  Stethoscope,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  CalendarDays,
  Heart,
  Zap,
  X,
} from "lucide-react";

type PatientCondition = {
  id: number;
  userId: string;
  conditionName: string;
  icd10Code: string | null;
  diagnosedAt: string | null;
  notes: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ConditionExplainer = {
  conditionName: string;
  icd10Code: string | null;
  plainSummary: string;
  commonTreatments: string[];
  lifestyleTips: string[];
  doctorQuestions: string[];
  aiGenerated: boolean;
  disclaimer: string;
};

type NextStep = {
  action: string;
  label: string;
  url: string;
  description: string;
};

type JournalEntry = {
  id: number;
  userId: string;
  conditionId: number | null;
  entryDate: string;
  symptomsJson: string[] | null;
  mood: number | null;
  energyLevel: number | null;
  sideEffectsText: string | null;
  notes: string | null;
  createdAt: string | null;
};

type JournalResponse = {
  entries: JournalEntry[];
  total: number;
  page: number;
  limit: number;
};

const COMMON_SYMPTOMS = [
  "Fatigue",
  "Headache",
  "Nausea",
  "Dizziness",
  "Joint pain",
  "Shortness of breath",
  "Swelling",
  "Thirst",
  "Blurred vision",
  "Chest discomfort",
];

const MOOD_LABELS: Record<number, string> = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "Good",
  5: "Excellent",
};

const ENERGY_LABELS: Record<number, string> = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "Good",
  5: "Excellent",
};

function ScaleSelector({
  value,
  onChange,
  labels,
  testIdPrefix,
}: {
  value: number;
  onChange: (v: number) => void;
  labels: Record<number, string>;
  testIdPrefix: string;
}) {
  return (
    <div className="flex gap-2" role="group">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          data-testid={`${testIdPrefix}-${n}`}
          aria-pressed={value === n}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === n
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DisclaimerBanner({ text }: { text: string }) {
  return (
    <div
      className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300"
      data-testid="banner-ai-disclaimer"
      role="note"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left font-medium hover:bg-muted/50 transition-colors"
        data-testid={testId}
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2 border-t">{children}</div>}
    </div>
  );
}

function ConditionDetailSheet({
  condition,
  onClose,
}: {
  condition: PatientCondition;
  onClose: () => void;
}) {
  const [journalPage, setJournalPage] = useState(1);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [sideEffects, setSideEffects] = useState("");
  const [journalNotes, setJournalNotes] = useState("");
  const { toast } = useToast();

  const explainerKey = useMemo(
    () => `care-navigator-explain-${condition.id}`,
    [condition.id]
  );

  const { data: explainer, isLoading: explainerLoading } = useQuery<ConditionExplainer>({
    queryKey: ["/api/care-navigator/conditions", condition.id, "explain"],
    queryFn: async () => {
      const cached = sessionStorage.getItem(explainerKey);
      if (cached) return JSON.parse(cached);
      const res = await apiRequest("GET", `/api/care-navigator/conditions/${condition.id}/explain`);
      const data = await res.json();
      sessionStorage.setItem(explainerKey, JSON.stringify(data));
      return data;
    },
    staleTime: Infinity,
  });

  const { data: nextStepsData } = useQuery<{ conditionName: string; nextSteps: NextStep[] }>({
    queryKey: ["/api/care-navigator/conditions", condition.id, "next-steps"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/care-navigator/conditions/${condition.id}/next-steps`);
      return res.json();
    },
  });

  const { data: journalData, isLoading: journalLoading } = useQuery<JournalResponse>({
    queryKey: ["/api/care-navigator/journal", condition.id, journalPage],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/care-navigator/journal?conditionId=${condition.id}&page=${journalPage}&limit=5`
      );
      return res.json();
    },
  });

  const createJournalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/care-navigator/journal", {
        conditionId: condition.id,
        mood,
        energyLevel: energy,
        symptomsJson: selectedSymptoms,
        sideEffectsText: sideEffects || null,
        notes: journalNotes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-navigator/journal"] });
      setShowJournalForm(false);
      setMood(3);
      setEnergy(3);
      setSelectedSymptoms([]);
      setSideEffects("");
      setJournalNotes("");
      toast({ title: "Journal entry saved", description: "Your health log has been recorded." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save journal entry.", variant: "destructive" });
    },
  });

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const totalJournalPages = journalData ? Math.ceil(journalData.total / 5) : 1;

  return (
    <div className="flex flex-col min-h-screen bg-background" data-testid="sheet-condition-detail">
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background/90 backdrop-blur-md z-10">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          data-testid="button-close-condition-detail"
          aria-label="Go back"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate" data-testid="text-condition-detail-name">
            {condition.conditionName}
          </h2>
          {condition.icd10Code && (
            <p className="text-xs text-muted-foreground" data-testid="text-condition-detail-icd10">
              ICD-10: {condition.icd10Code}
            </p>
          )}
        </div>
        <Badge
          variant="outline"
          className="shrink-0 capitalize text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
          data-testid="badge-condition-status"
        >
          {condition.status ?? "active"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {condition.diagnosedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-condition-diagnosed-date">
              <CalendarDays className="w-4 h-4" />
              Diagnosed {formatDate(condition.diagnosedAt)}
            </div>
          )}

          {condition.notes && (
            <Card>
              <CardContent className="py-3 text-sm text-muted-foreground" data-testid="text-condition-notes">
                {condition.notes}
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">What This Means</h3>

            {explainerLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ) : explainer ? (
              <div className="space-y-3">
                <DisclaimerBanner text={explainer.disclaimer} />

                <p className="text-base leading-relaxed" data-testid="text-explainer-summary">
                  {explainer.plainSummary}
                </p>

                {explainer.commonTreatments.length > 0 && (
                  <ExpandableSection title="Common Treatments" defaultOpen testId="button-toggle-treatments">
                    <ul className="space-y-2" data-testid="list-common-treatments">
                      {explainer.commonTreatments.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </ExpandableSection>
                )}

                {explainer.lifestyleTips.length > 0 && (
                  <ExpandableSection title="Lifestyle Tips" testId="button-toggle-lifestyle">
                    <ul className="space-y-2" data-testid="list-lifestyle-tips">
                      {explainer.lifestyleTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </ExpandableSection>
                )}

                {explainer.doctorQuestions.length > 0 && (
                  <ExpandableSection title="Questions to Ask Your Doctor" testId="button-toggle-questions">
                    <ul className="space-y-2" data-testid="list-doctor-questions">
                      {explainer.doctorQuestions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary font-bold shrink-0">Q.</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </ExpandableSection>
                )}
              </div>
            ) : null}
          </div>

          {nextStepsData && nextStepsData.nextSteps.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suggested Next Steps</h3>
              <div className="space-y-2" data-testid="list-next-steps">
                {nextStepsData.nextSteps.map((step) => (
                  <Link href={step.url} key={step.action}>
                    <Card
                      className="cursor-pointer hover:border-primary/50 transition-colors"
                      data-testid={`card-next-step-${step.action}`}
                    >
                      <CardContent className="flex items-start gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{step.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Health Journal</h3>
              {!showJournalForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowJournalForm(true)}
                  data-testid="button-add-journal-entry"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Log Today
                </Button>
              )}
            </div>

            {showJournalForm && (
              <Card data-testid="form-journal-entry">
                <CardContent className="py-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Mood
                      <span className="ml-2 text-muted-foreground font-normal">{MOOD_LABELS[mood]}</span>
                    </Label>
                    <ScaleSelector
                      value={mood}
                      onChange={setMood}
                      labels={MOOD_LABELS}
                      testIdPrefix="button-mood"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Energy Level
                      <span className="ml-2 text-muted-foreground font-normal">{ENERGY_LABELS[energy]}</span>
                    </Label>
                    <ScaleSelector
                      value={energy}
                      onChange={setEnergy}
                      labels={ENERGY_LABELS}
                      testIdPrefix="button-energy"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Symptoms (optional)</Label>
                    <div className="flex flex-wrap gap-2" data-testid="list-symptoms-checklist">
                      {COMMON_SYMPTOMS.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          aria-pressed={selectedSymptoms.includes(sym)}
                          data-testid={`button-symptom-${sym.toLowerCase().replace(/\s+/g, "-")}`}
                          className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-colors ${
                            selectedSymptoms.includes(sym)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="side-effects" className="text-sm font-medium">Side Effects (optional)</Label>
                    <Input
                      id="side-effects"
                      value={sideEffects}
                      onChange={(e) => setSideEffects(e.target.value)}
                      placeholder="Any medication side effects today..."
                      data-testid="input-side-effects"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="journal-notes" className="text-sm font-medium">Notes (optional)</Label>
                    <Textarea
                      id="journal-notes"
                      value={journalNotes}
                      onChange={(e) => setJournalNotes(e.target.value)}
                      placeholder="How are you feeling today..."
                      rows={3}
                      data-testid="textarea-journal-notes"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowJournalForm(false)}
                      data-testid="button-cancel-journal-entry"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => createJournalMutation.mutate()}
                      disabled={createJournalMutation.isPending}
                      data-testid="button-save-journal-entry"
                    >
                      {createJournalMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save Entry
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {journalLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ) : journalData && journalData.entries.length > 0 ? (
              <div className="space-y-2" data-testid="list-journal-entries">
                {journalData.entries.map((entry) => (
                  <Card key={entry.id} data-testid={`card-journal-entry-${entry.id}`}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground font-medium">{formatDate(entry.entryDate)}</p>
                        <div className="flex items-center gap-3">
                          {entry.mood != null && (
                            <span
                              className="flex items-center gap-1 text-xs"
                              data-testid={`text-journal-mood-${entry.id}`}
                            >
                              <Heart className="w-3 h-3 text-rose-500" />
                              {MOOD_LABELS[entry.mood]}
                            </span>
                          )}
                          {entry.energyLevel != null && (
                            <span
                              className="flex items-center gap-1 text-xs"
                              data-testid={`text-journal-energy-${entry.id}`}
                            >
                              <Zap className="w-3 h-3 text-amber-500" />
                              {ENERGY_LABELS[entry.energyLevel]}
                            </span>
                          )}
                        </div>
                      </div>
                      {entry.symptomsJson && entry.symptomsJson.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {entry.symptomsJson.map((s) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {entry.notes && (
                        <p className="text-sm text-muted-foreground">{entry.notes}</p>
                      )}
                      {entry.sideEffectsText && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">Side effects: </span>
                          {entry.sideEffectsText}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {totalJournalPages > 1 && (
                  <div className="flex items-center justify-between pt-1" data-testid="journal-pagination">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={journalPage <= 1}
                      onClick={() => setJournalPage((p) => p - 1)}
                      data-testid="button-journal-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {journalPage} of {totalJournalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={journalPage >= totalJournalPages}
                      onClick={() => setJournalPage((p) => p + 1)}
                      data-testid="button-journal-next-page"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              !showJournalForm && (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-journal-entries">
                  No journal entries yet. Tap "Log Today" to record how you are feeling.
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddConditionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [conditionName, setConditionName] = useState("");
  const [icd10Code, setIcd10Code] = useState("");
  const [diagnosedAt, setDiagnosedAt] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/care-navigator/conditions", {
        conditionName: conditionName.trim(),
        icd10Code: icd10Code.trim() || null,
        diagnosedAt: diagnosedAt || null,
        notes: notes.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-navigator/conditions"] });
      toast({ title: "Condition added", description: `${conditionName} has been added to your health record.` });
      setConditionName("");
      setIcd10Code("");
      setDiagnosedAt("");
      setNotes("");
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Could not add condition.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="dialog-add-condition">
        <DialogHeader>
          <DialogTitle>Add a Health Condition</DialogTitle>
          <DialogDescription>
            Enter the name of your diagnosis as your doctor described it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="condition-name">Condition Name</Label>
            <Input
              id="condition-name"
              value={conditionName}
              onChange={(e) => setConditionName(e.target.value)}
              placeholder="e.g. Type 2 Diabetes"
              data-testid="input-condition-name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="icd10-code">ICD-10 Code (optional)</Label>
            <Input
              id="icd10-code"
              value={icd10Code}
              onChange={(e) => setIcd10Code(e.target.value)}
              placeholder="e.g. E11"
              data-testid="input-icd10-code"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diagnosed-at">Date Diagnosed (optional)</Label>
            <Input
              id="diagnosed-at"
              type="date"
              value={diagnosedAt}
              onChange={(e) => setDiagnosedAt(e.target.value)}
              data-testid="input-diagnosed-at"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition-notes">Notes (optional)</Label>
            <Textarea
              id="condition-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes from your doctor..."
              rows={3}
              data-testid="textarea-condition-notes"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              data-testid="button-cancel-add-condition"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!conditionName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-save-add-condition"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add Condition
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResolveConditionDialog({
  condition,
  onClose,
}: {
  condition: PatientCondition | null;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!condition) return;
      const res = await apiRequest("DELETE", `/api/care-navigator/conditions/${condition.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-navigator/conditions"] });
      toast({ title: "Condition resolved", description: "The condition has been marked as resolved." });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Could not resolve condition.", variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={!!condition} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent data-testid="dialog-resolve-condition">
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as Resolved</AlertDialogTitle>
          <AlertDialogDescription>
            This will mark <strong>{condition?.conditionName}</strong> as resolved. You can still view it in your history but it will no longer appear in your active conditions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-resolve-condition">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
            data-testid="button-confirm-resolve-condition"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {resolveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Mark as Resolved
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CareNavigator() {
  const { user } = useAuth();
  const [selectedCondition, setSelectedCondition] = useState<PatientCondition | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [conditionToResolve, setConditionToResolve] = useState<PatientCondition | null>(null);

  const { data: conditions, isLoading } = useQuery<PatientCondition[]>({
    queryKey: ["/api/care-navigator/conditions"],
    enabled: !!user,
  });

  if (selectedCondition) {
    return (
      <ConditionDetailSheet
        condition={selectedCondition}
        onClose={() => setSelectedCondition(null)}
      />
    );
  }

  return (
    <div className="px-4 py-4 space-y-5" data-testid="page-care-navigator">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" data-testid="text-care-navigator-title">My Health Conditions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plain-language explanations of your diagnoses
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          data-testid="button-open-add-condition"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      <div
        className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300"
        data-testid="banner-care-navigator-info"
      >
        <Stethoscope className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Tap any condition below to see a plain-language explanation, lifestyle tips, and questions to ask your doctor.
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3" data-testid="skeleton-conditions">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !conditions || conditions.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12 space-y-4" data-testid="empty-state-conditions">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">No conditions on record</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Add a health condition your doctor has diagnosed to get plain-language explanations and helpful tips.
            </p>
          </div>
          <Button
            onClick={() => setShowAddDialog(true)}
            data-testid="button-empty-add-condition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Condition
          </Button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="list-conditions">
          {conditions.map((condition) => (
            <Card
              key={condition.id}
              className="cursor-pointer hover:border-primary/50 transition-all"
              onClick={() => setSelectedCondition(condition)}
              data-testid={`card-condition-${condition.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="font-semibold text-base truncate"
                        data-testid={`text-condition-name-${condition.id}`}
                      >
                        {condition.conditionName}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-xs capitalize bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 shrink-0"
                        data-testid={`badge-condition-status-${condition.id}`}
                      >
                        {condition.status ?? "active"}
                      </Badge>
                    </div>
                    {condition.icd10Code && (
                      <p
                        className="text-xs text-muted-foreground mt-0.5"
                        data-testid={`text-condition-icd10-${condition.id}`}
                      >
                        ICD-10: {condition.icd10Code}
                      </p>
                    )}
                    {condition.diagnosedAt && (
                      <p
                        className="text-xs text-muted-foreground mt-0.5"
                        data-testid={`text-condition-diagnosed-${condition.id}`}
                      >
                        Diagnosed {formatDate(condition.diagnosedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConditionToResolve(condition);
                      }}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`button-resolve-condition-${condition.id}`}
                      aria-label={`Mark ${condition.conditionName} as resolved`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddConditionDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />
      <ResolveConditionDialog
        condition={conditionToResolve}
        onClose={() => setConditionToResolve(null)}
      />
    </div>
  );
}
