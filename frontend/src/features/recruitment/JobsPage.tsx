import * as React from "react";
import { motion } from "framer-motion";
import { Briefcase, Check, Globe, Megaphone, Plus, Sparkles, Users, X } from "lucide-react";
import { useCreateRequisition, useDecideRequisition, useGenerateJd, usePublishPosting, useRequisitions } from "./useRecruitment";
import { useDepartments } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
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

export function JobsPage() {
  const { can } = usePermissions();
  const requisitions = useRequisitions();
  const createReq = useCreateRequisition();
  const decide = useDecideRequisition();
  const publish = usePublishPosting();
  const generateJd = useGenerateJd();
  const departments = useDepartments();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [headcount, setHeadcount] = React.useState(1);
  const [description, setDescription] = React.useState("");
  const [skills, setSkills] = React.useState("");

  const [publishFor, setPublishFor] = React.useState<Record<string, any> | null>(null);
  const [jobDescription, setJobDescription] = React.useState("");
  const [location, setLocation] = React.useState("Pune");
  const [isRemote, setIsRemote] = React.useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Jobs</h1>
          <p className="text-sm text-text-muted">Requisitions, approvals and published openings.</p>
        </div>
        {can("recruitment:create", "recruitment:manage") && (
          <Button onClick={() => setCreateOpen(true)}><Plus /> New Requisition</Button>
        )}
      </div>

      {requisitions.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : requisitions.isError ? (
        <ErrorState message={apiErrorMessage(requisitions.error)} onRetry={() => requisitions.refetch()} />
      ) : !requisitions.data?.length ? (
        <EmptyState icon={Briefcase} title="No requisitions yet" description="Raise a hiring requisition to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {requisitions.data.map((r, i) => {
            const applications = (r["postings"] as Array<Record<string, any>> ?? []).reduce((s, p) => s + (p["_count"]?.applications ?? 0), 0);
            return (
              <motion.div key={r["id"]} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="rounded-xl p-5 h-full hover:shadow-raised transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3">
                      <Briefcase className="size-5" />
                    </div>
                    <Badge variant={statusVariant(r["status"])}>{(r["status"] as string).replace("_", " ")}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold text-text">{r["title"]}</h3>
                  <p className="text-xs text-text-muted">
                    {r["department"]?.name} · {r["headcount"]} opening{r["headcount"] > 1 ? "s" : ""} · raised by {r["raisedBy"]?.firstName}
                  </p>
                  {Array.isArray(r["skillsRequired"]) && r["skillsRequired"].length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(r["skillsRequired"] as string[]).slice(0, 4).map((s) => <Badge key={s} className="text-[10px]">{s}</Badge>)}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                      <Users className="size-3.5" /> {applications} applicant{applications !== 1 ? "s" : ""}
                    </span>
                    <div className="flex gap-1.5">
                      {can("recruitment:approve") && r["status"] === "PENDING_APPROVAL" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: r["id"], decision: "reject" })}>
                            <X className="text-danger" />
                          </Button>
                          <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: r["id"], decision: "approve" })}>
                            <Check /> Approve
                          </Button>
                        </>
                      )}
                      {can("recruitment:create", "recruitment:manage") && r["status"] === "OPEN" && !(r["postings"] as unknown[])?.length && (
                        <Button size="sm" onClick={() => { setPublishFor(r); setJobDescription(r["description"] ?? ""); }}>
                          <Megaphone /> Post Job
                        </Button>
                      )}
                      {(r["postings"] as unknown[])?.length > 0 && <Badge variant="success"><Globe className="size-3" /> Posted</Badge>}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* create requisition */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New hiring requisition</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Job title" htmlFor="rq-title" required>
              <Input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior PHP Developer" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Department" required>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger aria-label="Department"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(departments.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Openings" htmlFor="rq-hc">
                <Input id="rq-hc" type="number" min={1} max={100} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} />
              </FormField>
            </div>
            <FormField label="Skills required" htmlFor="rq-skills" hint="Comma-separated">
              <Input id="rq-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="PHP, Laravel, MySQL" />
            </FormField>
            <FormField label="Role summary" htmlFor="rq-desc">
              <Textarea id="rq-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={title.length < 3 || !departmentId}
              loading={createReq.isPending}
              onClick={async () => {
                await createReq.mutateAsync({
                  title, departmentId, headcount,
                  description: description || undefined,
                  skillsRequired: skills ? skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                });
                setCreateOpen(false); setTitle(""); setDescription(""); setSkills("");
              }}
            >
              Submit for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* publish posting */}
      <Dialog open={Boolean(publishFor)} onOpenChange={(o) => !o && setPublishFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post job — {publishFor?.["title"]}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Job description" htmlFor="jp-desc" required hint="Minimum 20 characters">
              <div className="flex justify-end mb-1.5">
                <Button
                  type="button" size="sm" variant="secondary" loading={generateJd.isPending}
                  onClick={async () => {
                    const jd = await generateJd.mutateAsync({
                      title: publishFor!["title"],
                      department: publishFor!["department"]?.["name"],
                      employmentType: publishFor!["employmentType"],
                      minExperience: publishFor!["minExperience"] ?? undefined,
                      maxExperience: publishFor!["maxExperience"] ?? undefined,
                      skills: publishFor!["skills"] ?? undefined,
                    });
                    setJobDescription(jd.markdown || jd.summary);
                  }}
                >
                  <Sparkles /> Generate with AI
                </Button>
              </div>
              <Textarea id="jp-desc" rows={8} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Write the job description, or generate a draft with AI…" />
            </FormField>
            <div className="grid grid-cols-2 gap-3 items-end">
              <FormField label="Location" htmlFor="jp-loc">
                <Input id="jp-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-text pb-2 cursor-pointer">
                <input type="checkbox" className="size-4 accent-(--brand-primary)" checked={isRemote} onChange={(e) => setIsRemote(e.target.checked)} />
                Remote friendly
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPublishFor(null)}>Cancel</Button>
            <Button
              disabled={jobDescription.length < 20}
              loading={publish.isPending}
              onClick={async () => {
                await publish.mutateAsync({ requisitionId: publishFor!["id"], description: jobDescription, location, isRemote });
                setPublishFor(null);
              }}
            >
              <Megaphone /> Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
