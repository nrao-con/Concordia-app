import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 20;

type SyncConflict = {
  id: number;
  conflictType: string;
  concordiaId: string;
  pharmacyPatientId: string;
  prescriptionId: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

const conflictNames: Record<string, string> = {
  pharmacy_ownership_conflict: "Patient ID ownership conflict",
  identity_linkage_conflict: "App profile ID mismatch",
  prescription_ownership_conflict: "Prescription belongs to another patient",
  patient_transaction_failure: "Patient import failed",
};

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PatientSyncConflicts() {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;
  const query = useQuery<{ conflicts: SyncConflict[]; total: number }>({
    queryKey: ["/api/admin/patient-sync-conflicts", offset],
    queryFn: async () => (await apiRequest("GET", `/api/admin/patient-sync-conflicts?offset=${offset}`)).json(),
  });
  const conflicts = query.data?.conflicts ?? [];
  const total = query.data?.total ?? 0;

  return <section aria-labelledby="patient-sync-conflicts-title" className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="patient-sync-conflicts-title" className="text-xl font-semibold">Patient import conflicts</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          These patients were not fully imported. Check the IDs in the pharmacy and website records;
          do not link patients using contact details. A successful import clears a conflict automatically.
        </p>
      </div>
      <Button variant="outline" className="min-h-11" onClick={() => query.refetch()} disabled={query.isFetching}>
        <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh conflicts
      </Button>
    </header>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading conflicts…</p>
      : query.isError ? <Card><CardContent className="p-5"><p role="alert">Conflicts could not be loaded.</p><Button className="mt-3" onClick={() => query.refetch()}>Try again</Button></CardContent></Card>
      : total === 0 ? <Card className="border-dashed"><CardContent className="p-6 text-sm text-muted-foreground">No open patient import conflicts.</CardContent></Card>
      : <>
        <p className="text-sm text-muted-foreground" role="status">{total} open {total === 1 ? "conflict" : "conflicts"}</p>
        <div className="space-y-3" role="list">
          {conflicts.map((conflict) => <Card key={conflict.id} role="listitem"><CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <h3 className="font-semibold">{conflictNames[conflict.conflictType] ?? "Patient sync conflict"}</h3>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-muted-foreground">CP ID: </dt><dd className="inline break-all font-mono">{conflict.concordiaId}</dd></div>
                  <div><dt className="inline text-muted-foreground">Pharmacy patient ID: </dt><dd className="inline break-all font-mono">{conflict.pharmacyPatientId}</dd></div>
                  {conflict.prescriptionId && <div><dt className="inline text-muted-foreground">Prescription ID: </dt><dd className="inline break-all font-mono">{conflict.prescriptionId}</dd></div>}
                  <div><dt className="inline text-muted-foreground">Last seen: </dt><dd className="inline">{timestamp(conflict.lastSeenAt)}</dd></div>
                  <div><dt className="inline text-muted-foreground">First seen: </dt><dd className="inline">{timestamp(conflict.firstSeenAt)}</dd></div>
                  <div><dt className="inline text-muted-foreground">Occurrences: </dt><dd className="inline">{conflict.occurrenceCount}</dd></div>
                </dl>
              </div>
            </div>
          </CardContent></Card>)}
        </div>
        {total > PAGE_SIZE && <div className="flex items-center gap-3">
          <Button variant="outline" className="min-h-11" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <Button variant="outline" className="min-h-11" disabled={offset + PAGE_SIZE >= total} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>}
      </>}
  </section>;
}