import * as React from "react";
import { CheckCircle2, Circle, ClipboardSignature, PlayCircle, Rocket, SkipForward } from "lucide-react";
import { useMyOnboarding, useOnboardingAction, useOnboardingInstances } from "@/features/recruitment/useRecruitment";
import { useEmployees } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function TaskList({ instance, canAct, onAction }: { instance: Record<string, any>; canAct: boolean; onAction: (taskId: string, action: "complete" | "skip") => void }) {
  const tasks = (instance["tasks"] as Array<Record<string, any>>) ?? [];
  const done = tasks.filter((t) => ["COMPLETED", "SKIPPED"].includes(t["status"])).length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
        <span>{done}/{tasks.length} tasks complete</span>
        <span>{Math.round((done / Math.max(tasks.length, 1)) * 100)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mb-3">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-(--chart-2) transition-all" style={{ width: `${(done / Math.max(tasks.length, 1)) * 100}%` }} />
      </div>
      <div className="space-y-1.5">
        {tasks.map((task) => {
          const completed = ["COMPLETED", "SKIPPED"].includes(task["status"]);
          return (
            <div key={task["id"]} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {completed ? <CheckCircle2 className="size-4 text-success shrink-0" /> : <Circle className="size-4 text-text-faint shrink-0" />}
                <div className="min-w-0">
                  <p className={cn("text-sm truncate", completed ? "text-text-muted line-through" : "text-text")}>{task["taskDef"]?.title}</p>
                  <p className="text-[10px] text-text-faint">
                    {task["taskDef"]?.category} · {task["taskDef"]?.assigneeRole?.replace(/_/g, " ")}
                    {task["dueAt"] ? ` · due ${formatDate(task["dueAt"])}` : ""}
                  </p>
                </div>
              </div>
              {!completed && canAct && (
                <div className="flex gap-1 shrink-0">
                  {!task["taskDef"]?.isMandatory && (
                    <Button variant="ghost" size="icon-sm" aria-label="Skip" onClick={() => onAction(task["id"], "skip")}><SkipForward className="size-3.5" /></Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => onAction(task["id"], "complete")}>Done</Button>
                </div>
              )}
              {task["status"] === "SKIPPED" && <Badge className="text-[10px]">Skipped</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { can } = usePermissions();
  const isHr = can("onboarding:manage");
  const my = useMyOnboarding();
  const instances = useOnboardingInstances(isHr);
  const employees = useEmployees({ page: 1, limit: 100 });
  const action = useOnboardingAction();

  const [startOpen, setStartOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState("");
  const [signFor, setSignFor] = React.useState<Record<string, any> | null>(null);
  const [typedName, setTypedName] = React.useState("");

  const doTask = (taskId: string, type: "complete" | "skip") => action.mutate({ type: "task", id: taskId, body: { action: type } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Onboarding</h1>
          <p className="text-sm text-text-muted">Joining checklists, digital forms and induction tracking.</p>
        </div>
        {isHr && <Button onClick={() => setStartOpen(true)}><PlayCircle /> Start Onboarding</Button>}
      </div>

      {/* my onboarding (ESS) */}
      {my.data && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Rocket className="size-4 text-primary dark:text-chart-3" /> My onboarding — {my.data["template"]?.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TaskList instance={my.data} canAct onAction={doTask} />
            {(my.data["forms"] as Array<Record<string, any>> ?? []).map((form) => (
              <div key={form["id"]} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-2.5">
                  <ClipboardSignature className="size-4 text-text-muted" />
                  <div>
                    <p className="text-sm font-medium text-text">{form["name"]}</p>
                    <p className="text-[11px] text-text-muted">{(form["signatures"] as unknown[])?.length ? `Signed ${formatDate(form["signatures"][0]?.["signedAt"])}` : "Awaiting your e-signature"}</p>
                  </div>
                </div>
                {!(form["signatures"] as unknown[])?.length && (
                  <Button size="sm" onClick={() => { setSignFor(form); setTypedName(""); }}>Sign now</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* HR view */}
      {isHr && (
        instances.isLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : instances.isError ? (
          <ErrorState message={apiErrorMessage(instances.error)} onRetry={() => instances.refetch()} />
        ) : !instances.data?.length ? (
          <EmptyState icon={Rocket} title="No onboardings yet" description="Start onboarding for a newly created employee." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {instances.data.map((instance) => (
              <Card key={instance["id"]} className="rounded-xl">
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar size="md">
                      {instance["employee"]?.photoUrl && <AvatarImage src={instance["employee"].photoUrl} alt="" />}
                      <AvatarFallback>{initials(instance["employee"]?.firstName, instance["employee"]?.lastName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-sm">{instance["employee"]?.firstName} {instance["employee"]?.lastName}</CardTitle>
                      <p className="text-xs text-text-muted">{instance["employee"]?.department?.name} · started {formatDate(instance["startedAt"])}</p>
                    </div>
                  </div>
                  <Badge variant={statusVariant(instance["completedAt"] ? "COMPLETED" : "IN_PROGRESS")}>
                    {instance["completedAt"] ? "Completed" : "In progress"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <TaskList instance={instance} canAct={!instance["completedAt"]} onAction={doTask} />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {!my.data && !isHr && !my.isLoading && (
        <EmptyState icon={Rocket} title="No active onboarding" description="Your onboarding checklist appears here when HR starts it." />
      )}

      {/* start dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start onboarding</DialogTitle></DialogHeader>
          <FormField label="Employee" required>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger aria-label="Employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {(employees.data?.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button disabled={!employeeId} loading={action.isPending} onClick={async () => { await action.mutateAsync({ type: "start", body: { employeeId } }); setStartOpen(false); setEmployeeId(""); }}>
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* sign dialog */}
      <Dialog open={Boolean(signFor)} onOpenChange={(o) => !o && setSignFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>E-sign — {signFor?.["name"]}</DialogTitle></DialogHeader>
          <p className="text-sm text-text-muted">
            By typing your full name you confirm you have read and accept the Employee Handbook,
            Code of Conduct and confidentiality terms. A tamper-evident hash of this acceptance is stored.
          </p>
          <FormField label="Type your full legal name" htmlFor="sig" required>
            <Input id="sig" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="e.g. Pooja Bhore" />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSignFor(null)}>Cancel</Button>
            <Button
              disabled={typedName.trim().length < 3}
              loading={action.isPending}
              onClick={async () => {
                await action.mutateAsync({ type: "sign", id: signFor!["id"], body: { typedName: typedName.trim(), data: { acceptedHandbook: true, acceptedCodeOfConduct: true } } });
                setSignFor(null);
              }}
            >
              <ClipboardSignature /> Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
