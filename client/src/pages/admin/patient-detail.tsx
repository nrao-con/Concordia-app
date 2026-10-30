import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Stethoscope, AlertCircle } from "lucide-react";
import type { PatientCondition } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "active" ? "default" : "secondary"}
      className={status === "active" ? "bg-green-600 text-white" : ""}
      data-testid={`badge-condition-status-${status}`}
    >
      {status === "active" ? "Active" : "Resolved"}
    </Badge>
  );
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "Unknown date";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function AdminPatientDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: conditions, isLoading, error } = useQuery<PatientCondition[]>({
    queryKey: ["/api/admin/patients", id, "conditions"],
    queryFn: async () => {
      const res = await fetch(`/api/internal/patients/${id}/conditions`);
      if (!res.ok) throw new Error("Failed to load conditions");
      return res.json();
    },
    enabled: !!id,
  });

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6" data-testid="admin-patient-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="button-admin-back">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Patient Conditions</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-patient-id">Patient ID: {id?.startsWith("CP-") ? id : `#${id?.slice(0, 8)}`}</p>
        </div>
      </div>

      <Card data-testid="card-conditions-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-primary" />
            Diagnosed Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-destructive py-4" data-testid="error-conditions-load">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Failed to load conditions. Check authentication.</span>
            </div>
          ) : !conditions || conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-conditions">
              No conditions on file for this patient.
            </p>
          ) : (
            <div className="space-y-3" data-testid="list-conditions">
              {conditions.map((condition) => (
                <div
                  key={condition.id}
                  className="rounded-lg border bg-muted/20 p-4 space-y-2"
                  data-testid={`row-condition-${condition.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="font-semibold text-sm" data-testid={`text-condition-name-${condition.id}`}>
                        {condition.conditionName}
                      </p>
                      {condition.icd10Code && (
                        <p className="text-xs text-muted-foreground font-mono" data-testid={`text-icd10-${condition.id}`}>
                          ICD-10: {condition.icd10Code}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={condition.status} />
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid={`text-condition-date-${condition.id}`}>
                    Diagnosed: {formatDate(condition.diagnosedAt)}
                  </p>
                  {condition.notes && (
                    <p className="text-xs text-muted-foreground italic" data-testid={`text-condition-notes-${condition.id}`}>
                      {condition.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
