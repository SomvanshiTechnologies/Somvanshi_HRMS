import * as React from "react";
import { CalendarDays, Plus, Star, Video } from "lucide-react";
import { useInterviews, usePipeline, useScheduleInterview, useSubmitFeedback } from "./useRecruitment";
import { useEmployees } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROUNDS = ["Screening", "Technical 1", "Technical 2", "Managerial", "HR"];
const RECOMMENDATIONS = [
  { value: "STRONG_HIRE", label: "Strong Hire" }, { value: "HIRE", label: "Hire" },
  { value: "NEUTRAL", label: "Neutral" }, { value: "NO_HIRE", label: "No Hire" },
  { value: "STRONG_NO_HIRE", label: "Strong No Hire" },
];

export function InterviewsPage() {
  const { can } = usePermissions();
  const interviews = useInterviews();
  const pipeline = usePipeline();
  const employees = useEmployees({ page: 1, limit: 100, status: "ACTIVE" });
  const schedule = useScheduleInterview();
  const feedback = useSubmitFeedback();

  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [applicationId, setApplicationId] = React.useState("");
  const [round, setRound] = React.useState("Technical 1");
  const [when, setWhen] = React.useState("");
  const [meetingLink, setMeetingLink] = React.useState("");
  const [panelId, setPanelId] = React.useState("");

  const [feedbackFor, setFeedbackFor] = React.useState<Record<string, any> | null>(null);
  const [rating, setRating] = React.useState(0);
  const [recommendation, setRecommendation] = React.useState("HIRE");
  const [notes, setNotes] = React.useState("");

  const candidates = (pipeline.data?.columns ?? []).flatMap((c) => c.applications)
    .filter((a) => !["JOINED", "OFFER"].includes(a.stage));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Interviews</h1>
          <p className="text-sm text-text-muted">Schedule rounds and collect panel feedback.</p>
        </div>
        {can("recruitment:create", "recruitment:manage") && (
          <Button onClick={() => setScheduleOpen(true)}><Plus /> Schedule Interview</Button>
        )}
      </div>

      {interviews.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : interviews.isError ? (
        <ErrorState message={apiErrorMessage(interviews.error)} onRetry={() => interviews.refetch()} />
      ) : !interviews.data?.length ? (
        <EmptyState icon={CalendarDays} title="No interviews scheduled" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {interviews.data.map((iv) => (
            <Card key={iv["id"]} className="rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-text">
                    {iv["application"]?.candidate?.firstName} {iv["application"]?.candidate?.lastName}
                  </p>
                  <p className="text-xs text-text-muted">{iv["application"]?.posting?.title}</p>
                </div>
                <Badge variant={statusVariant(iv["status"])}>{iv["status"]}</Badge>
              </div>
              <p className="mt-2 text-sm text-text flex items-center gap-1.5">
                <Video className="size-3.5 text-text-muted" /> {iv["round"]} · {formatDateTime(iv["scheduledAt"])}
              </p>
              <div className="mt-2 flex items-center gap-1">
                {(iv["panel"] as Array<Record<string, any>> ?? []).map((p) => (
                  <Avatar key={p["id"]} size="sm">
                    {p["photoUrl"] && <AvatarImage src={p["photoUrl"]} alt="" />}
                    <AvatarFallback>{initials(p["firstName"], p["lastName"])}</AvatarFallback>
                  </Avatar>
                ))}
                <span className="text-[11px] text-text-faint ml-1">panel</span>
              </div>
              {(iv["feedback"] as unknown[])?.length ? (
                <Badge variant="success" className="mt-2.5">Feedback recorded</Badge>
              ) : (
                iv["status"] === "SCHEDULED" && (
                  <Button variant="secondary" size="sm" className="mt-2.5 w-full" onClick={() => { setFeedbackFor(iv); setRating(0); setNotes(""); }}>
                    <Star /> Give feedback
                  </Button>
                )
              )}
            </Card>
          ))}
        </div>
      )}

      {/* schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule interview</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="Candidate" required>
              <Select value={applicationId} onValueChange={setApplicationId}>
                <SelectTrigger aria-label="Candidate"><SelectValue placeholder="Select candidate" /></SelectTrigger>
                <SelectContent>
                  {candidates.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.candidate.firstName} {a.candidate.lastName} — {a.posting.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Round" required>
                <Select value={round} onValueChange={setRound}>
                  <SelectTrigger aria-label="Round"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROUNDS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label="When" required><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></FormField>
            </div>
            <FormField label="Panel member" required>
              <Select value={panelId} onValueChange={setPanelId}>
                <SelectTrigger aria-label="Panel"><SelectValue placeholder="Select interviewer" /></SelectTrigger>
                <SelectContent>
                  {(employees.data?.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Meeting link"><Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet…" /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              disabled={!applicationId || !when || !panelId}
              loading={schedule.isPending}
              onClick={async () => {
                await schedule.mutateAsync({ applicationId, round, scheduledAt: when, meetingLink: meetingLink || undefined, panelEmployeeIds: [panelId] });
                setScheduleOpen(false); setApplicationId(""); setWhen(""); setMeetingLink("");
              }}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* feedback dialog */}
      <Dialog open={Boolean(feedbackFor)} onOpenChange={(o) => !o && setFeedbackFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Feedback — {feedbackFor?.["application"]?.candidate?.firstName} ({feedbackFor?.["round"]})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Rating" required>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} className="cursor-pointer">
                    <Star className={cn("size-7", n <= rating ? "fill-warning text-warning" : "text-border-strong")} />
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Recommendation" required>
              <Select value={recommendation} onValueChange={setRecommendation}>
                <SelectTrigger aria-label="Recommendation"><SelectValue /></SelectTrigger>
                <SelectContent>{RECOMMENDATIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Notes"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Strengths, concerns, observations…" /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setFeedbackFor(null)}>Cancel</Button>
            <Button
              disabled={rating === 0}
              loading={feedback.isPending}
              onClick={async () => {
                await feedback.mutateAsync({ id: feedbackFor!["id"], body: { rating, recommendation, notes: notes || undefined } });
                setFeedbackFor(null);
              }}
            >
              Submit feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
