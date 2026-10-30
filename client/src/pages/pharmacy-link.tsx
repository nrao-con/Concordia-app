import { useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileKey2, Info, Loader2, LogOut, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PatientSyncConflicts from "@/pages/admin/patient-sync-conflicts";

type LinkRequest = {
  status: "pending" | "rejected" | "approved" | string;
  requestedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

export function PatientLinkRequired({ error }: { error?: { details?: { error?: string; linkRequest?: LinkRequest | null; requestState?: string; message?: string } } }) {
  const { logout, retryAuth } = useAuth();
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [concordiaId, setConcordiaId] = useState("");
  const [showForm, setShowForm] = useState(error?.details?.linkRequest?.status === "rejected");
  const requestQuery = useQuery<{ request: LinkRequest | null }>({
    queryKey: ["/api/pharmacy-link-requests/me"],
    queryFn: async () => (await apiRequest("GET", "/api/pharmacy-link-requests/me")).json(),
    enabled: error?.details?.error === "identity_link_required",
  });
  const request = requestQuery.data?.request ?? error?.details?.linkRequest ?? null;
  const [checkingApproval, setCheckingApproval] = useState(false);
  const checkApproval = async () => {
    setCheckingApproval(true);
    try {
      const latest = await requestQuery.refetch();
      if (latest.isError) return;
      if (latest.data?.request?.status === "pending") {
        toast({ title: "Still being reviewed", description: "Your pharmacy team has not approved this request yet." });
        return;
      }
      if (latest.data?.request?.status === "rejected") return;
      await retryAuth();
    } finally {
      setCheckingApproval(false);
    }
  };
  const submit = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", "/api/pharmacy-link-requests", { concordiaId: id })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pharmacy-link-requests/me"] });
      setShowForm(false);
      setConcordiaId("");
      toast({ title: "Request sent", description: "A pharmacy team member will review your request." });
    },
    onError: (e) => toast({ title: "Request not sent", description: apiErrorMessage(e, "Please check the ID and try again."), variant: "destructive" }),
  });
  const validId = /^CP-\d{6}$/.test(concordiaId);
  const state = error?.details?.error === "identity_conflict" ? "conflict"
    : error?.details?.error === "pharmacy_identity_unavailable" ? "unavailable"
    : error?.details?.error === "pharmacy_sync_required" ? "sync"
    : request?.status ?? (error?.details?.requestState === "rejected" ? "rejected" : "new");

  const stateCopy = useMemo(() => {
    const copies = {
      pending: { icon: Clock3, title: "Your request is being reviewed", body: "Your pharmacy team is checking the patient ID. We will keep this sign-in safe while they review it.", tone: "text-amber-700 bg-amber-50 border-amber-200" },
        approved: { icon: CheckCircle2, title: "Your request was approved", body: "Your pharmacy account is connected. Continue to the app.", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
      rejected: { icon: XCircle, title: "We need you to try again", body: request?.rejectionReason || "The pharmacy team could not approve that request. Check your patient ID and submit it again.", tone: "text-rose-700 bg-rose-50 border-rose-200" },
      conflict: { icon: XCircle, title: "This sign-in cannot be linked", body: error?.details?.message || "The pharmacy identity conflicts with an existing account. Please contact the pharmacy team.", tone: "text-rose-700 bg-rose-50 border-rose-200" },
      unavailable: { icon: RefreshCw, title: "Pharmacy service is unavailable", body: error?.details?.message || "We could not reach the pharmacy identity service. Please try again shortly.", tone: "text-amber-700 bg-amber-50 border-amber-200" },
      sync: { icon: Clock3, title: "Your pharmacy record is syncing", body: error?.details?.message || "Your pharmacy identity is valid, but the patient record is not ready in ConcordiaCare yet.", tone: "text-primary bg-primary/5 border-primary/20" },
      new: { icon: FileKey2, title: "Connect your pharmacy account", body: "Your sign-in is ready. Enter the Concordia patient ID from your pharmacy paperwork so staff can verify the right record.", tone: "text-primary bg-primary/5 border-primary/20" },
    };
    return copies[state as keyof typeof copies] ?? {
      icon: Info, title: "Your account needs pharmacy review", body: "A pharmacy team member needs to review your connection before app information can be shown.", tone: "text-primary bg-primary/5 border-primary/20",
    };
  }, [error?.details?.message, request?.rejectionReason, state]);
  const StateIcon = stateCopy.icon;

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="h-6 w-6" /></div>
          <div><p className="font-semibold tracking-tight">ConcordiaCare</p><p className="text-sm text-muted-foreground">A careful connection to your pharmacy</p></div>
        </div>
        <Card className="overflow-hidden border-primary/10 shadow-lg shadow-primary/5">
          <div className={`border-b p-6 ${stateCopy.tone}`}>
            <StateIcon className="mb-4 h-8 w-8" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">{stateCopy.title}</h1>
            <p className="mt-2 text-base leading-relaxed">{stateCopy.body}</p>
            {request?.status === "pending" && <p className="mt-3 text-sm">Requested {formatDate(request.requestedAt || request.createdAt)}</p>}
          </div>
          <CardContent className="space-y-6 p-6 sm:p-8">
            {(state === "new" || state === "rejected") && (showForm || state === "new") && (
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (validId) submit.mutate(concordiaId); }}>
                <div className="space-y-2">
                  <Label htmlFor="concordia-id">Concordia patient ID</Label>
                  <Input id="concordia-id" value={concordiaId} onChange={(e) => setConcordiaId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))} placeholder="CP-123456" className="min-h-12 font-mono tracking-wide" aria-describedby="id-help" />
                  <p id="id-help" className="text-sm text-muted-foreground">Find it on your pharmacy paperwork or ask the pharmacy team. It starts with CP- and has six numbers.</p>
                </div>
                <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4 text-sm leading-relaxed text-muted-foreground">
                  <p className="flex gap-2 font-medium text-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Staff verifies every request before anything is connected.</p>
                  <p className="mt-2">Your email address and phone number are not used to find or link your pharmacy record.</p>
                </div>
                <Button type="submit" className="min-h-12 w-full" disabled={!validId || submit.isPending}>
                  {submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending request</> : "Send for pharmacy review"}
                </Button>
              </form>
            )}
            {state === "rejected" && !showForm && <Button variant="outline" className="min-h-12 w-full" onClick={() => setShowForm(true)}>Try another patient ID</Button>}
            {(state === "pending" || state === "approved") && (
              <Button className="min-h-12 w-full" onClick={checkApproval} disabled={checkingApproval}>
                {checkingApproval ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {state === "approved" ? "Continue to app" : "Check approval"}
              </Button>
            )}
            {(requestQuery.isError || state === "unavailable") && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><p>We could not check your request status.</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => requestQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button></div>}
            {(state === "unavailable" || state === "sync") && (
              <Button className="min-h-12 w-full" onClick={() => retryAuth()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Check again
              </Button>
            )}
            {clerkUser?.id && state === "new" && (
              <details className="rounded-xl border p-4 text-sm">
                <summary className="cursor-pointer font-medium">Setting up pharmacy staff access?</summary>
                <p className="mt-3 text-muted-foreground">A project administrator must explicitly authorize your sign-in before you can review patient link requests. Give them this sign-in ID:</p>
                <code className="mt-2 block break-all rounded bg-muted p-2 select-all">{clerkUser.id}</code>
              </details>
            )}
            <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">No medication or profile information is shown until approval.</p>
              <Button variant="ghost" className="min-h-11 justify-start px-0 sm:justify-center" onClick={() => logout()}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

type AdminRequest = { id: number; concordiaId: string; requesterSubject: string; status: string; requestedAt: string; hasExistingSignIn: boolean };
export default function PharmacyLinkRequests({ staffMode = false }: { staffMode?: boolean }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<{ id: number; concordiaId: string; action: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [confirmedSubject, setConfirmedSubject] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const query = useQuery<{ requests: AdminRequest[] }>({ queryKey: ["/api/admin/pharmacy-link-requests"], enabled: staffMode || !!user?.isAdmin, queryFn: async () => (await apiRequest("GET", "/api/admin/pharmacy-link-requests")).json() });
  const mutation = useMutation({
    mutationFn: async ({ id, action, reason: why, replaceExistingSignIn }: { id: number; action: "approve" | "reject"; reason?: string; replaceExistingSignIn?: boolean }) => (await apiRequest("POST", `/api/admin/pharmacy-link-requests/${id}/decision`, { decision: action, ...(why ? { reason: why } : {}), ...(replaceExistingSignIn ? { replaceExistingSignIn: true, confirmedSubject, verificationMethod } : {}) })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/pharmacy-link-requests"] }); setDecision(null); setReason(""); setConfirmTransfer(false); setConfirmedSubject(""); setVerificationMethod(""); toast({ title: "Decision saved", description: "The request list has been updated." }); },
    onError: (e) => toast({ title: "Decision not saved", description: apiErrorMessage(e, "Please try again."), variant: "destructive" }),
  });
  if (!staffMode && !user?.isAdmin) return <div className="p-8 text-center"><h1 className="text-xl font-semibold">Staff access required</h1><p className="mt-2 text-muted-foreground">This review area is limited to configured pharmacy staff.</p></div>;
  const requests = query.data?.requests ?? [];
  const transferRequest = decision?.action === "approve" ? requests.find((item) => item.id === decision.id && item.hasExistingSignIn) : undefined;
  const transferRequired = !!transferRequest;
  return <main className="min-h-full bg-background p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Staff review</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Pharmacy link requests</h1><p className="mt-2 max-w-xl text-muted-foreground">Review patient IDs before a sign-in can access ConcordiaCare information.</p></div><Button variant="outline" className="min-h-11 self-start" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh</Button></header>
    {query.isLoading ? <div className="grid gap-3">{[1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div> : query.isError ? <Card><CardContent className="p-8 text-center"><p className="font-medium">Requests could not be loaded.</p><Button className="mt-4 min-h-11" onClick={() => query.refetch()}>Try again</Button></CardContent></Card> : requests.length === 0 ? <Card className="border-dashed"><CardContent className="p-12 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><h2 className="mt-4 text-lg font-semibold">No requests waiting</h2><p className="mt-2 text-muted-foreground">New patient link requests will appear here.</p></CardContent></Card> : <div className="space-y-3" role="list">{requests.map((item) => <Card key={item.id} role="listitem"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-lg font-semibold">{item.concordiaId}</p><p className="mt-1 text-sm text-muted-foreground">Requested {formatDate(item.requestedAt)}</p></div><div className="flex gap-2"><Button className="min-h-11 flex-1 sm:flex-none" onClick={() => setDecision({ id: item.id, concordiaId: item.concordiaId, action: "approve" })} disabled={mutation.isPending}>Approve</Button><Button variant="outline" className="min-h-11 flex-1 border-destructive/30 text-destructive hover:bg-destructive/5 sm:flex-none" onClick={() => setDecision({ id: item.id, concordiaId: item.concordiaId, action: "reject" })} disabled={mutation.isPending}>Reject</Button></div></CardContent></Card>)}</div>}
    {!staffMode && <PatientSyncConflicts />}
    <Button variant="ghost" className="min-h-11" onClick={() => logout()}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
  </div>
  <AlertDialog open={!!decision} onOpenChange={(open) => { if (!open && !mutation.isPending) { setDecision(null); setConfirmTransfer(false); setConfirmedSubject(""); setVerificationMethod(""); } }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{decision?.action === "approve" ? "Approve this link request?" : "Reject this link request?"}</AlertDialogTitle>
        <AlertDialogDescription>{decision?.concordiaId} will be {decision?.action === "approve" ? "linked to this patient's sign-in" : "returned to the patient for correction"}.</AlertDialogDescription>
      </AlertDialogHeader>
      {transferRequired && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-900">
          <p className="font-semibold">This record already has a sign-in. Approval removes access from that old sign-in.</p>
          <p>Verify the patient independently using your pharmacy's records. Ask them for the sign-in ID shown in their app and enter it below. Do not rely on the CP ID alone.</p>
          <p className="break-all font-mono">Requesting sign-in: {transferRequest.requesterSubject}</p>
          <Label htmlFor="confirmed-signin">Sign-in ID provided by the patient</Label>
          <Input id="confirmed-signin" value={confirmedSubject} onChange={(e) => setConfirmedSubject(e.target.value.trim())} className="bg-white" data-testid="input-confirmed-signin" />
          <Label htmlFor="verification-method">How you verified the patient</Label>
          <select id="verification-method" value={verificationMethod} onChange={(e) => setVerificationMethod(e.target.value)} className="min-h-11 w-full rounded-md border border-slate-400 bg-white px-3" data-testid="select-verification-method">
            <option value="">Select a method</option>
            <option value="in_person_id">In person: photo ID and pharmacy record</option>
            <option value="callback_registered_phone">Callback to phone on pharmacy record</option>
          </select>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmTransfer} onChange={(e) => setConfirmTransfer(e.target.checked)} data-testid="checkbox-confirm-signin-transfer" />
            <span>I completed this check and understand the old sign-in will lose access.</span>
          </label>
        </div>
      )}
      {decision?.action === "reject" && <div className="space-y-2"><Label htmlFor="rejection-reason">Internal review note (not shown to patient)</Label><Textarea id="rejection-reason" value={reason} maxLength={280} onChange={(e) => setReason(e.target.value)} placeholder="Record why the request could not be verified." className="min-h-24" /><p className="text-right text-xs text-muted-foreground">{reason.length}/280</p></div>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={mutation.isPending || (decision?.action === "reject" && !reason.trim()) || (transferRequired && (!confirmTransfer || confirmedSubject !== transferRequest?.requesterSubject || !verificationMethod))}
          onClick={(e) => {
            e.preventDefault();
            if (decision) mutation.mutate({
              id: decision.id,
              action: decision.action,
              ...(decision.action === "reject" ? { reason: reason.trim() } : {}),
              ...(transferRequired ? { replaceExistingSignIn: true } : {}),
            });
          }}
        >{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{decision?.action === "approve" ? "Approve request" : "Reject request"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </main>;
}