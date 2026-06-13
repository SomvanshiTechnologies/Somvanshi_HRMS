import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, Calendar, FileText, FileUp, Mail, Phone, Plus, Sparkles, UserSearch } from "lucide-react";
import {
  STAGES, STAGE_LABELS, useCreateCandidate, useCreateOffer, useDecideOffer,
  useMoveStage, useParseResume, usePipeline, usePostings, useUploadResume,
  type ParsedResume, type PipelineApplication, type ResumeMatch,
} from "./useRecruitment";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, compactINR, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STAGE_COLORS: Record<string, string> = {
  APPLIED: "border-t-(--chart-3)", SCREENING: "border-t-(--chart-2)", TECHNICAL: "border-t-primary",
  MANAGERIAL: "border-t-(--chart-6)", HR: "border-t-warning", OFFER: "border-t-success", JOINED: "border-t-success",
};

function CandidateCard({ app, onOpen, draggable }: { app: PipelineApplication; onOpen: () => void; draggable: boolean }) {
  const c = app.candidate;
  const score = app.scores[0]?.overallScore;
  return (
    <motion.button
      layout
      draggable={draggable}
      onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer?.setData("text/app-id", app.id)}
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface p-3 text-left shadow-card hover:shadow-raised transition-shadow cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Avatar size="sm"><AvatarFallback>{initials(c.firstName, c.lastName)}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-text truncate">{c.firstName} {c.lastName}</p>
          <p className="text-[11px] text-text-muted truncate">{c.currentTitle ?? c.email}</p>
        </div>
        {score != null && (
          <Badge variant={score >= 70 ? "success" : score >= 40 ? "warning" : "danger"} className="ml-auto text-[10px]">{Math.round(score)}</Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {c.totalExperience != null && <Badge className="text-[10px]">{c.totalExperience}y exp</Badge>}
        {(c.skills ?? []).slice(0, 2).map((s) => <Badge key={s} variant="primary" className="text-[10px]">{s}</Badge>)}
      </div>
      {app.interviews[0] && (
        <p className="mt-1.5 text-[10px] text-text-faint">
          {app.interviews[0].round} · {formatDate(app.interviews[0].scheduledAt)}
        </p>
      )}
    </motion.button>
  );
}

export function CandidatesPage() {
  const { can } = usePermissions();
  const postings = usePostings();
  const [postingId, setPostingId] = React.useState<string>("all");
  const pipeline = usePipeline(postingId === "all" ? undefined : postingId);
  const moveStage = useMoveStage();
  const createCandidate = useCreateCandidate();
  const uploadResume = useUploadResume();
  const parseResume = useParseResume();
  const createOffer = useCreateOffer();
  const decideOffer = useDecideOffer();
  const [parseResult, setParseResult] = React.useState<{ candidateId: string; parsed: ParsedResume; score: ResumeMatch | null } | null>(null);

  const canWrite = can("recruitment:create", "recruitment:manage");
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", totalExperience: "", skills: "", postingId: "" });
  const [selected, setSelected] = React.useState<PipelineApplication | null>(null);
  const [dragOver, setDragOver] = React.useState<string | null>(null);
  const [offerOpen, setOfferOpen] = React.useState(false);
  const [offerCtc, setOfferCtc] = React.useState("");
  const [offerDesignation, setOfferDesignation] = React.useState("");
  const [offerJoining, setOfferJoining] = React.useState("");
  const resumeInput = React.useRef<HTMLInputElement>(null);

  const total = pipeline.data?.columns.reduce((s, c) => s + c.applications.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Candidates</h1>
          <p className="text-sm text-text-muted">{total} in pipeline — drag cards between stages.</p>
        </div>
        <div className="flex gap-2">
          <Select value={postingId} onValueChange={setPostingId}>
            <SelectTrigger className="w-56 h-9" aria-label="Filter by job"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {(postings.data ?? []).map((p) => <SelectItem key={p["id"]} value={p["id"]}>{p["title"]}</SelectItem>)}
            </SelectContent>
          </Select>
          {canWrite && <Button onClick={() => setAddOpen(true)}><Plus /> Add Candidate</Button>}
        </div>
      </div>

      {pipeline.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : pipeline.isError ? (
        <ErrorState message={apiErrorMessage(pipeline.error)} onRetry={() => pipeline.refetch()} />
      ) : total === 0 ? (
        <EmptyState icon={UserSearch} title="No candidates yet" description="Add candidates against a published job to build your pipeline." />
      ) : (
        <div className="overflow-x-auto scrollbar-thin pb-2">
          <div className="flex gap-3 min-w-max">
            {(pipeline.data?.columns ?? []).map((column) => (
              <div
                key={column.stage}
                onDragOver={(e) => { e.preventDefault(); setDragOver(column.stage); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/app-id");
                  if (id && canWrite) moveStage.mutate({ id, stage: column.stage });
                }}
                className={cn(
                  "w-60 shrink-0 rounded-xl border border-border border-t-4 bg-surface-sunken/60 transition-colors",
                  STAGE_COLORS[column.stage],
                  dragOver === column.stage && "bg-primary/10 border-primary"
                )}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{STAGE_LABELS[column.stage]}</p>
                  <Badge className="text-[10px]">{column.applications.length}</Badge>
                </div>
                <div className="space-y-2 px-2.5 pb-3 min-h-24">
                  {column.applications.map((app) => (
                    <CandidateCard key={app.id} app={app} draggable={canWrite} onOpen={() => setSelected(app)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* candidate drawer */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="max-w-lg">
          {selected && (
            <>
              <SheetHeader className="pr-10">
                <div className="flex items-center gap-3">
                  <Avatar size="lg"><AvatarFallback className="text-lg">{initials(selected.candidate.firstName, selected.candidate.lastName)}</AvatarFallback></Avatar>
                  <div>
                    <SheetTitle>{selected.candidate.firstName} {selected.candidate.lastName}</SheetTitle>
                    <p className="text-xs text-text-muted">{selected.candidate.currentTitle ?? "—"} {selected.candidate.currentCompany ? `@ ${selected.candidate.currentCompany}` : ""}</p>
                    <Badge variant={statusVariant(selected.stage)} className="mt-1">{STAGE_LABELS[selected.stage]}</Badge>
                  </div>
                </div>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2 text-text-muted"><Mail className="size-3.5" /> {selected.candidate.email}</p>
                  {selected.candidate.phone && <p className="flex items-center gap-2 text-text-muted"><Phone className="size-3.5" /> {selected.candidate.phone}</p>}
                  <p className="text-text-muted">
                    {selected.candidate.totalExperience != null && `${selected.candidate.totalExperience}y experience · `}
                    {selected.candidate.expectedCtc && `expects ${compactINR(Number(selected.candidate.expectedCtc))} · `}
                    {selected.candidate.noticePeriodDays != null && `${selected.candidate.noticePeriodDays}d notice`}
                  </p>
                  <p className="text-xs text-text-faint">Applied to: {selected.posting.title} · Source: {selected.candidate.source ?? "—"}</p>
                </div>
                {(selected.candidate.skills ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.candidate.skills!.map((s) => <Badge key={s} variant="primary">{s}</Badge>)}
                  </div>
                )}

                {/* resume */}
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Resume</p>
                  {selected.candidate.resumes[0] ? (
                    <a href={selected.candidate.resumes[0].fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline dark:text-chart-3">
                      <FileText className="size-4" /> {selected.candidate.resumes[0].fileName}
                    </a>
                  ) : (
                    <p className="text-sm text-text-faint">No resume uploaded</p>
                  )}
                  {canWrite && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" loading={uploadResume.isPending} onClick={() => resumeInput.current?.click()}>
                        <FileUp /> Upload resume
                      </Button>
                      {selected.candidate.resumes[0] && (
                        <Button size="sm" loading={parseResume.isPending} onClick={async () => {
                          const r = await parseResume.mutateAsync({ candidateId: selected.candidate.id, postingId: selected.posting.id });
                          setParseResult({ candidateId: selected.candidate.id, ...r });
                        }}>
                          <Sparkles /> Parse with AI
                        </Button>
                      )}
                      <input
                        ref={resumeInput} type="file" className="sr-only" accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadResume.mutate({ candidateId: selected.candidate.id, file });
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}
                  {parseResult?.candidateId === selected.candidate.id && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {parseResult.score && (
                        <div className="rounded-lg bg-surface-sunken p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">AI match score</span>
                            <span className={cn("text-lg font-bold tabular-nums", parseResult.score.overallScore >= 70 ? "text-success" : parseResult.score.overallScore >= 40 ? "text-warning" : "text-danger")}>{parseResult.score.overallScore}%</span>
                          </div>
                          <p className="text-xs text-text-muted mt-1">{parseResult.score.matchSummary}</p>
                          <div className="mt-1.5 flex gap-3 text-[11px] text-text-faint">
                            <span>Skills {parseResult.score.skillScore}%</span><span>Exp {parseResult.score.experienceScore}%</span><span>Edu {parseResult.score.educationScore}%</span>
                          </div>
                        </div>
                      )}
                      {parseResult.parsed.summary && <p className="text-xs text-text">{parseResult.parsed.summary}</p>}
                      {parseResult.parsed.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">{parseResult.parsed.skills.slice(0, 20).map((s) => <Badge key={s} variant="default" className="text-[10px]">{s}</Badge>)}</div>
                      )}
                      {parseResult.parsed.experience.length > 0 && (
                        <div className="space-y-0.5">{parseResult.parsed.experience.slice(0, 5).map((e, i) => <p key={i} className="text-[11px] text-text-muted">{e.role} · {e.company}{e.duration ? ` · ${e.duration}` : ""}</p>)}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* offer */}
                {selected.offers[0] ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Offer</p>
                    <p className="text-sm text-text flex items-center gap-2">
                      <Banknote className="size-4 text-success" /> {compactINR(Number(selected.offers[0].annualCtc))}/yr
                      <Badge variant={statusVariant(selected.offers[0].status)}>{selected.offers[0].status}</Badge>
                    </p>
                    {can("recruitment:manage") && selected.offers[0].status === "SENT" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" loading={decideOffer.isPending} onClick={async () => { await decideOffer.mutateAsync({ id: selected.offers[0]!.id, decision: "ACCEPTED" }); setSelected(null); }}>
                          Mark Accepted
                        </Button>
                        <Button size="sm" variant="secondary" onClick={async () => { await decideOffer.mutateAsync({ id: selected.offers[0]!.id, decision: "DECLINED" }); setSelected(null); }}>
                          Declined
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  can("recruitment:manage") && ["HR", "MANAGERIAL", "TECHNICAL", "OFFER"].includes(selected.stage) && (
                    <Button size="sm" onClick={() => { setOfferOpen(true); setOfferDesignation(selected.posting.title); }}>
                      <Banknote /> Create Offer
                    </Button>
                  )
                )}

                {/* stage move + reject */}
                {canWrite && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Move stage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STAGES.filter((s) => s !== selected.stage).map((stage) => (
                        <Button key={stage} variant="secondary" size="sm" onClick={async () => { await moveStage.mutateAsync({ id: selected.id, stage }); setSelected(null); }}>
                          {STAGE_LABELS[stage]}
                        </Button>
                      ))}
                      <Button variant="danger" size="sm" onClick={async () => { await moveStage.mutateAsync({ id: selected.id, stage: "REJECTED" }); setSelected(null); }}>
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* add candidate */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name" required><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></FormField>
            <FormField label="Last name" required><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></FormField>
            <FormField label="Email" required className="col-span-2"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
            <FormField label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Experience (years)"><Input type="number" min={0} value={form.totalExperience} onChange={(e) => setForm({ ...form, totalExperience: e.target.value })} /></FormField>
            <FormField label="Current title" className="col-span-2"><Input value={form.currentTitle} onChange={(e) => setForm({ ...form, currentTitle: e.target.value })} /></FormField>
            <FormField label="Skills" hint="Comma-separated" className="col-span-2"><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></FormField>
            <FormField label="Apply to job" required className="col-span-2">
              <Select value={form.postingId} onValueChange={(v) => setForm({ ...form, postingId: v })}>
                <SelectTrigger aria-label="Job"><SelectValue placeholder="Select published job" /></SelectTrigger>
                <SelectContent>
                  {(postings.data ?? []).map((p) => <SelectItem key={p["id"]} value={p["id"]}>{p["title"]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.firstName || !form.lastName || !form.email.includes("@") || !form.postingId}
              loading={createCandidate.isPending}
              onClick={async () => {
                await createCandidate.mutateAsync({
                  firstName: form.firstName, lastName: form.lastName, email: form.email,
                  phone: form.phone || undefined, currentTitle: form.currentTitle || undefined,
                  totalExperience: form.totalExperience ? Number(form.totalExperience) : undefined,
                  skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                  postingId: form.postingId,
                });
                setAddOpen(false);
                setForm({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "", totalExperience: "", skills: "", postingId: "" });
              }}
            >
              Add to pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* create offer */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create offer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="Designation" required><Input value={offerDesignation} onChange={(e) => setOfferDesignation(e.target.value)} /></FormField>
            <FormField label="Annual CTC (₹)" required><Input type="number" min={0} value={offerCtc} onChange={(e) => setOfferCtc(e.target.value)} /></FormField>
            <FormField label="Joining date" required><Input type="date" value={offerJoining} onChange={(e) => setOfferJoining(e.target.value)} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOfferOpen(false)}>Cancel</Button>
            <Button
              disabled={!offerCtc || !offerJoining || offerDesignation.length < 2}
              loading={createOffer.isPending}
              onClick={async () => {
                await createOffer.mutateAsync({ applicationId: selected!.id, designation: offerDesignation, annualCtc: Number(offerCtc), joiningDate: offerJoining });
                setOfferOpen(false); setSelected(null); setOfferCtc(""); setOfferJoining("");
              }}
            >
              <Calendar /> Send offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
