import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DatabaseZap,
  Filter,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage, apiRequest } from "@/lib/queryClient";

interface Operation {
  id: string | number;
  partner: string;
  operation: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorCategory: string | null;
  operatorMessage: string | null;
}

interface AuditEntry {
  id?: string | number;
  action?: string;
  createdAt?: string;
  operatorMessage?: string | null;
  [key: string]: unknown;
}

interface SyncResponse {
  summary?: Record<string, number>;
  operations: Operation[];
  pagination: { page: number; limit: number; total: number; totalPages?: number };
  recentAudit?: AuditEntry[];
}

const statuses = ["all", "failed", "pending", "processing", "completed"];
const partners = ["all", "staff", "pharmflow", "concordia"];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: string) {
  if (["completed", "delivered"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["failed", "dead_letter"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-800";
  if (["processing", "in_progress"].includes(status)) return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold tracking-tight ${tone}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function SyncOperations() {
  const queryClient = useQueryClient();
  const [partner, setPartner] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | number | null>(null);
  const [confirmOperation, setConfirmOperation] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const limit = 12;

  const queryKey = useMemo(
    () => ["/api/admin/sync-operations", partner === "all" ? "" : partner, status === "all" ? "" : status, page, limit],
    [partner, status, page],
  );
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<SyncResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (partner !== "all") params.set("partner", partner);
      if (status !== "all") params.set("status", status);
      const response = await apiRequest("GET", `/api/admin/sync-operations?${params.toString()}`);
      return response.json() as Promise<SyncResponse>;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: async (operation: Operation) => {
      setRetryingId(operation.id);
      const response = await apiRequest("POST", `/api/admin/sync-operations/${operation.id}/retry`);
      return response.json() as Promise<{ message?: string }>;
    },
    onSuccess: (result) => {
      setFeedback({ kind: "success", message: result.message || "Retry queued safely. The partner system was not contacted directly." });
      setConfirmOperation(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sync-operations"] });
    },
    onError: (mutationError) => {
      setFeedback({ kind: "error", message: apiErrorMessage(mutationError, "Retry could not be queued. Please try again.") });
    },
    onSettled: () => setRetryingId(null),
  });

  const summary = data?.summary || {};
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages || (pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1);

  const resetFilters = () => {
    setPartner("all");
    setStatus("all");
    setPage(1);
    setFeedback(null);
  };

  return (
    <main className="min-h-full bg-[linear-gradient(135deg,hsl(202_32%_97%),hsl(188_34%_94%))] px-4 py-6 text-slate-900 sm:px-6 lg:px-8" data-testid="sync-operations-page">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="flex flex-col justify-between gap-4 border-b border-slate-300/70 pb-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Operations control
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">Partner sync operations</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Confirm that order and message deliveries reached partner systems. Retry only when a safe requeue is appropriate.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${isFetching ? "bg-amber-500" : "bg-emerald-500"}`} />
            {isFetching ? "Refreshing operation view" : "Monitoring every 30 seconds"}
          </div>
        </section>

        {feedback && (
          <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
            {feedback.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="flex-1">{feedback.message}</span>
            <button type="button" aria-label="Dismiss feedback" onClick={() => setFeedback(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total in view" value={summary.total ?? pagination?.total ?? 0} />
          <Stat label="Failed" value={summary.failed ?? 0} tone="text-rose-700" />
          <Stat label="Queued" value={summary.pending ?? summary.queued ?? 0} tone="text-amber-700" />
          <Stat label="Completed" value={summary.completed ?? 0} tone="text-emerald-700" />
        </section>

        <Card className="border-slate-200/80 bg-white/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="sync-partner" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Partner</label>
              <select id="sync-partner" value={partner} onChange={(event) => { setPartner(event.target.value); setPage(1); }} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20">
                {partners.map((item) => <option key={item} value={item}>{item === "all" ? "All partners" : item[0].toUpperCase() + item.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="sync-status" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</label>
              <select id="sync-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20">
                {statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item.replace("_", " ")}</option>)}
              </select>
            </div>
            <Button variant="outline" className="h-10 border-slate-300" onClick={resetFilters}><Filter className="mr-2 h-4 w-4" />Clear filters</Button>
            <Button variant="ghost" className="h-10" onClick={() => refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3" aria-label="Loading operations">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-200/70" />)}
          </div>
        ) : isError ? (
          <Card className="border-rose-200 bg-rose-50/70"><CardContent className="flex flex-col items-start gap-3 p-6"><AlertCircle className="h-6 w-6 text-rose-700" /><div><h2 className="font-semibold text-rose-950">Sync operations are unavailable</h2><p className="mt-1 text-sm text-rose-800">{apiErrorMessage(error, "We could not load the partner delivery queue.")}</p></div><Button variant="outline" onClick={() => refetch()}>Try again</Button></CardContent></Card>
        ) : !data?.operations?.length ? (
          <Card className="border-slate-200 bg-white/80"><CardContent className="flex flex-col items-center px-6 py-14 text-center"><DatabaseZap className="h-9 w-9 text-teal-700" /><h2 className="mt-4 text-lg font-semibold">No operations match these filters</h2><p className="mt-1 max-w-md text-sm text-slate-600">The queue is clear for this view. Clear the filters to check another partner or status.</p><Button variant="outline" className="mt-5" onClick={resetFilters}>Show all operations</Button></CardContent></Card>
        ) : (
          <Card className="overflow-hidden border-slate-200/80 bg-white/85 shadow-sm">
            <CardHeader className="border-b border-slate-200/80 px-4 py-4 sm:px-6"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Delivery queue</CardTitle><span className="font-mono text-xs text-slate-500">{pagination?.total ?? data.operations.length} records</span></div></CardHeader>
            <div className="divide-y divide-slate-200/80">
              {data.operations.map((item) => (
                <div key={item.id} className="grid gap-4 px-4 py-5 transition-colors hover:bg-teal-50/30 sm:px-6 lg:grid-cols-[1.2fr_1.3fr_0.8fr_1fr_auto] lg:items-center">
                  <div><div className="flex items-center gap-2"><span className="font-semibold">{item.partner}</span><Badge variant="outline" className={`text-[11px] ${statusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 font-mono text-xs text-slate-500">#{item.id}</p></div>
                  <div><p className="text-sm font-medium text-slate-800">{item.operation}</p><p className="mt-1 text-xs text-slate-500">{item.errorCategory || item.operatorMessage || "No operator note"}</p></div>
                  <div className="flex items-center gap-2 text-sm text-slate-600"><RotateCcw className="h-4 w-4 text-slate-400" />{item.attempts} attempt{item.attempts === 1 ? "" : "s"}</div>
                  <div className="text-xs text-slate-500"><p className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Next: {formatDate(item.nextAttemptAt)}</p><p className="mt-1">Updated {formatDate(item.updatedAt)}</p></div>
                  <Button size="sm" variant="outline" className="border-teal-200 text-teal-800 hover:bg-teal-50" disabled={retryingId === item.id || !["failed", "dead_letter"].includes(item.status)} onClick={() => setConfirmOperation(item)}><RotateCcw className="mr-2 h-3.5 w-3.5" />Retry</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {data?.recentAudit && data.recentAudit.length > 0 && <Card className="border-slate-200/80 bg-white/75 shadow-sm"><CardHeader className="px-4 py-4 sm:px-6"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-teal-700" />Recent operator audit</CardTitle></CardHeader><CardContent className="px-4 pb-5 sm:px-6"><div className="space-y-3">{data.recentAudit.slice(0, 5).map((entry, index) => <div key={String(entry.id ?? index)} className="flex items-start justify-between gap-4 text-sm"><span className="text-slate-700">{entry.action || "Operation updated"}</span><time className="shrink-0 text-xs text-slate-500">{formatDate(entry.createdAt)}</time></div>)}</div></CardContent></Card>}

        {pagination && <nav aria-label="Sync operation pages" className="flex items-center justify-between gap-3 pb-4"><p className="text-xs text-slate-500">Page {pagination.page} of {totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></nav>}
      </div>

      {confirmOperation && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOperation(null); }}><div role="dialog" aria-modal="true" aria-labelledby="retry-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="retry-title" className="text-lg font-semibold">Queue a safe retry?</h2><p className="mt-2 text-sm leading-6 text-slate-600">This will requeue operation <span className="font-mono text-slate-900">#{confirmOperation.id}</span>. It will not send directly to the partner system.</p></div><button type="button" aria-label="Close retry confirmation" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setConfirmOperation(null)}><X className="h-4 w-4" /></button></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmOperation(null)}>Cancel</Button><Button onClick={() => retryMutation.mutate(confirmOperation)} disabled={retryMutation.isPending}>{retryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Queue retry</Button></div></div></div>}
    </main>
  );
}