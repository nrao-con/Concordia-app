import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, CheckCircle2, Ban, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface FraudCase {
  id: number;
  case_number: string;
  status: string;
  priority: string;
  action: string;
  score: number;
  risk_band: string;
  signals: Array<{ code: string; weight: number }>;
  patient_user_id: string | null;
  created_at: string;
}

export default function FraudCases() {
  const queryClient = useQueryClient();
  const { data = [], isLoading, error } = useQuery<FraudCase[]>({
    queryKey: ["/api/admin/fraud/cases"],
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: "approve" | "deny" | "dismiss" }) => {
      const response = await apiRequest("POST", `/api/admin/fraud/cases/${id}/decision`, {
        decision,
        reasonCode: `pharmacist_${decision}`,
      });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud/cases"] }),
  });

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-5" data-testid="fraud-review-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-amber-600" /> Identity Review
        </h1>
        <p className="text-sm text-muted-foreground">
          Medication-access requests held for pharmacy verification. Signals are minimized and contain no documents.
        </p>
      </div>
      {isLoading ? <p>Loading review queue…</p> : error ? (
        <Card><CardContent className="pt-6 text-destructive">You are not authorized to view this queue.</CardContent></Card>
      ) : data.length === 0 ? (
        <Card><CardContent className="pt-6 flex items-center gap-2"><CheckCircle2 className="text-green-600" /> No cases need review.</CardContent></Card>
      ) : data.map((item) => (
        <Card key={item.id} data-testid={`fraud-case-${item.id}`}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{item.case_number} · {item.action}</CardTitle>
              <div className="flex gap-2">
                <Badge variant={item.priority === "critical" ? "destructive" : "secondary"}>{item.priority}</Badge>
                <Badge variant="outline">{item.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Risk score: <strong>{item.score}/100</strong></div>
            <div className="flex flex-wrap gap-2">
              {item.signals.map((signal) => (
                <Badge key={signal.code} variant="outline">{signal.code.replaceAll("_", " ")} +{signal.weight}</Badge>
              ))}
            </div>
            {["open", "in_review"].includes(item.status) && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={() => decide.mutate({ id: item.id, decision: "approve" })}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Verify and allow
                </Button>
                <Button size="sm" variant="destructive" onClick={() => decide.mutate({ id: item.id, decision: "deny" })}>
                  <Ban className="h-4 w-4 mr-1" /> Deny
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: item.id, decision: "dismiss" })}>
                  <Search className="h-4 w-4 mr-1" /> False positive
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}