import { TrendingDown, TrendingUp } from "lucide-react";
import { useRevisions } from "./usePayroll";
import { apiErrorMessage } from "@/lib/api";
import { cn, compactINR, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

export function RevisionsPage() {
  const revisions = useRevisions();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Salary Revisions</h1>
        <p className="text-sm text-text-muted">Complete revision history with hike percentages.</p>
      </div>
      {revisions.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : revisions.isError ? (
        <ErrorState message={apiErrorMessage(revisions.error)} onRetry={() => revisions.refetch()} />
      ) : !revisions.data?.length ? (
        <EmptyState icon={TrendingUp} title="No revisions yet" description="Salary changes made in Payroll → Salaries appear here." />
      ) : (
        <div className="space-y-2.5">
          {revisions.data.map((rev) => {
            const up = Number(rev["percentHike"]) >= 0;
            return (
              <Card key={rev["id"]} className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar size="md">
                    {rev["employee"]?.photoUrl && <AvatarImage src={rev["employee"].photoUrl} alt="" />}
                    <AvatarFallback>{initials(rev["employee"]?.firstName, rev["employee"]?.lastName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">
                      {rev["employee"]?.firstName} {rev["employee"]?.lastName}
                      <Badge className="ml-2 font-mono text-[10px]">{rev["employee"]?.employeeCode}</Badge>
                    </p>
                    <p className="text-xs text-text-muted">
                      {compactINR(Number(rev["previousCtc"]))} → <strong className="text-text">{compactINR(Number(rev["revisedCtc"]))}</strong>
                      {" · "}effective {formatDate(rev["effectiveFrom"])} · {rev["reason"]}
                    </p>
                  </div>
                </div>
                <span className={cn("inline-flex items-center gap-1 text-sm font-semibold tabular-nums", up ? "text-success" : "text-danger")}>
                  {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  {up ? "+" : ""}{Number(rev["percentHike"])}%
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
