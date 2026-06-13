import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Briefcase,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  FileUp,
  Globe,
  Landmark,
  Link2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useAddBank,
  useCancelChangeRequest,
  useCreateChangeRequest,
  useDeleteBank,
  useMyDocuments,
  useMyProfile,
  useUpdateBank,
  useUpdateProfessional,
  useUploadDocument,
  useUploadPhoto,
  type MyProfile,
} from "./useProfile";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ---------- completion ring ---------- */
function CompletionRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 80 80" className="size-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-border)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={score >= 80 ? "var(--color-success)" : score >= 50 ? "var(--color-warning)" : "var(--color-danger)"}
          strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * score) / 100}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-text tabular-nums">
        {score}%
      </span>
    </div>
  );
}

/* ---------- personal info edit (→ HR approval) ---------- */
const PersonalSchema = z.object({
  personalEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  altPhone: z.string().max(20).optional().or(z.literal("")),
  currentAddress: z.string().max(1000).optional().or(z.literal("")),
  permanentAddress: z.string().max(1000).optional().or(z.literal("")),
  bloodGroup: z.string().max(8).optional().or(z.literal("")),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"]),
  dateOfBirth: z.string().optional().or(z.literal("")),
});
type PersonalValues = z.infer<typeof PersonalSchema>;

function PersonalEditDialog({ profile, open, onClose }: { profile: MyProfile; open: boolean; onClose: () => void }) {
  const createRequest = useCreateChangeRequest();
  const form = useForm<PersonalValues>({
    resolver: zodResolver(PersonalSchema),
    values: {
      personalEmail: profile.personalEmail ?? "",
      phone: profile.phone ?? "",
      altPhone: profile.altPhone ?? "",
      currentAddress: profile.currentAddress ?? "",
      permanentAddress: profile.permanentAddress ?? "",
      bloodGroup: profile.bloodGroup ?? "",
      maritalStatus: (profile.maritalStatus as PersonalValues["maritalStatus"]) ?? "UNDISCLOSED",
      dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    // submit only changed fields
    const current: Record<string, unknown> = {
      personalEmail: profile.personalEmail ?? "",
      phone: profile.phone ?? "",
      altPhone: profile.altPhone ?? "",
      currentAddress: profile.currentAddress ?? "",
      permanentAddress: profile.permanentAddress ?? "",
      bloodGroup: profile.bloodGroup ?? "",
      maritalStatus: profile.maritalStatus,
      dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? "",
    };
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== current[key]) changes[key] = value === "" ? null : value;
    }
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    await createRequest.mutateAsync({ changes });
    onClose();
  });

  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Edit personal information</DialogTitle>
          <DialogDescription>Changes are submitted to HR for review before they take effect.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Personal email" htmlFor="pe" error={err.personalEmail?.message}>
            <Input id="pe" type="email" {...form.register("personalEmail")} />
          </FormField>
          <FormField label="Mobile number" htmlFor="ph" error={err.phone?.message}>
            <Input id="ph" {...form.register("phone")} />
          </FormField>
          <FormField label="Alternate mobile" htmlFor="aph" error={err.altPhone?.message}>
            <Input id="aph" {...form.register("altPhone")} />
          </FormField>
          <FormField label="Blood group" htmlFor="bg" error={err.bloodGroup?.message}>
            <Input id="bg" placeholder="e.g. B+" {...form.register("bloodGroup")} />
          </FormField>
          <FormField label="Marital status">
            <Select
              value={form.watch("maritalStatus")}
              onValueChange={(v) => form.setValue("maritalStatus", v as PersonalValues["maritalStatus"], { shouldDirty: true })}
            >
              <SelectTrigger aria-label="Marital status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"].map((m) => (
                  <SelectItem key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date of birth" htmlFor="dob" error={err.dateOfBirth?.message} hint="Requires HR verification">
            <Input id="dob" type="date" {...form.register("dateOfBirth")} />
          </FormField>
          <FormField label="Current address" htmlFor="ca" className="sm:col-span-2" error={err.currentAddress?.message}>
            <Textarea id="ca" rows={2} {...form.register("currentAddress")} />
          </FormField>
          <FormField label="Permanent address" htmlFor="pa" className="sm:col-span-2" error={err.permanentAddress?.message}>
            <Textarea id="pa" rows={2} {...form.register("permanentAddress")} />
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={createRequest.isPending}>Submit for review</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- professional info (instant) ---------- */
const ProfessionalSchema = z.object({
  languages: z.string().max(300).optional().or(z.literal("")),
  linkedinUrl: z.string().url("Enter a full URL (https://…)").optional().or(z.literal("")),
  portfolioUrl: z.string().url("Enter a full URL (https://…)").optional().or(z.literal("")),
  careerInterests: z.string().max(2000).optional().or(z.literal("")),
});
type ProfessionalValues = z.infer<typeof ProfessionalSchema>;

function ProfessionalEditDialog({ profile, open, onClose }: { profile: MyProfile; open: boolean; onClose: () => void }) {
  const update = useUpdateProfessional();
  const form = useForm<ProfessionalValues>({
    resolver: zodResolver(ProfessionalSchema),
    values: {
      languages: (profile.languages ?? []).join(", "),
      linkedinUrl: profile.linkedinUrl ?? "",
      portfolioUrl: profile.portfolioUrl ?? "",
      careerInterests: profile.careerInterests ?? "",
    },
  });
  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit professional information</DialogTitle>
          <DialogDescription>These updates apply immediately.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(async (v) => {
            await update.mutateAsync({
              languages: v.languages ? v.languages.split(",").map((l) => l.trim()).filter(Boolean) : [],
              linkedinUrl: v.linkedinUrl || null,
              portfolioUrl: v.portfolioUrl || null,
              careerInterests: v.careerInterests || null,
            });
            onClose();
          })}
          noValidate
          className="space-y-4"
        >
          <FormField label="Languages known" htmlFor="lang" hint="Comma-separated, e.g. English, Hindi, Marathi" error={err.languages?.message}>
            <Input id="lang" {...form.register("languages")} />
          </FormField>
          <FormField label="LinkedIn profile" htmlFor="li" error={err.linkedinUrl?.message}>
            <Input id="li" placeholder="https://linkedin.com/in/…" {...form.register("linkedinUrl")} />
          </FormField>
          <FormField label="Portfolio website" htmlFor="pf" error={err.portfolioUrl?.message}>
            <Input id="pf" placeholder="https://…" {...form.register("portfolioUrl")} />
          </FormField>
          <FormField label="Career interests" htmlFor="ci" error={err.careerInterests?.message}>
            <Textarea id="ci" rows={3} placeholder="Roles, technologies or growth areas you're interested in" {...form.register("careerInterests")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={update.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- document upload ---------- */
const DOC_CATEGORIES = [
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "PAN", label: "PAN" },
  { value: "PASSPORT", label: "Passport" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "RESUME", label: "Resume" },
  { value: "DEGREE", label: "Degree Certificate" },
  { value: "ADDRESS_PROOF", label: "Address Proof" },
  { value: "CERTIFICATION" as never, label: "Certification" },
  { value: "OTHER", label: "Other" },
].filter((c) => c.value !== ("CERTIFICATION" as never)) as Array<{ value: string; label: string }>;

function DocumentUploadDialog({ open, onClose, presetCategory }: { open: boolean; onClose: () => void; presetCategory?: string }) {
  const uploadDoc = useUploadDocument();
  const [category, setCategory] = React.useState(presetCategory ?? "OTHER");
  const [name, setName] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (presetCategory) {
      setCategory(presetCategory);
      setName(DOC_CATEGORIES.find((c) => c.value === presetCategory)?.label ?? "");
    }
  }, [presetCategory, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, image or Word · max 8 MB. New uploads create a new version.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Category" required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Document category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Document name" htmlFor="docname" required>
            <Input id="docname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aadhaar Card" />
          </FormField>
          <FormField label="Expiry date" htmlFor="docexp" hint="If applicable (passport, license…)">
            <Input id="docexp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </FormField>
          <FormField label="File" required>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-text-muted hover:border-primary hover:text-text transition-colors">
              <Upload className="size-4" />
              {file ? file.name : "Choose a file…"}
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!file || name.length < 2}
            loading={uploadDoc.isPending}
            onClick={async () => {
              await uploadDoc.mutateAsync({ file: file!, category, name, expiresOn: expiresOn || undefined });
              setFile(null);
              setName("");
              setExpiresOn("");
              onClose();
            }}
          >
            <FileUp /> Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- page ---------- */
function BankDialog({ employeeId, editing, open, onClose }: { employeeId: string; editing: Record<string, any> | null; open: boolean; onClose: () => void }) {
  const add = useAddBank();
  const update = useUpdateBank();
  const isEdit = Boolean(editing);
  const [form, setForm] = React.useState({ accountHolder: "", accountNumber: "", bankName: "", branch: "", ifsc: "", isPrimary: true });
  React.useEffect(() => {
    if (editing) setForm({ accountHolder: editing["accountHolder"] ?? "", accountNumber: "", bankName: editing["bankName"] ?? "", branch: editing["branch"] ?? "", ifsc: editing["ifsc"] ?? "", isPrimary: Boolean(editing["isPrimary"]) });
    else setForm({ accountHolder: "", accountNumber: "", bankName: "", branch: "", ifsc: "", isPrimary: true });
  }, [editing, open]);
  const valid = form.accountHolder.length >= 2 && form.bankName.length >= 2 && (isEdit || form.accountNumber.length >= 6);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit bank account" : "Add bank account"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Account holder" required className="col-span-2"><Input value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} /></FormField>
          <FormField label="Account number" required={!isEdit} hint={isEdit ? `On file: ${editing?.["accountNumber"] ?? ""}` : undefined} className="col-span-2"><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\s/g, "") })} placeholder={isEdit ? "Enter to change" : ""} /></FormField>
          <FormField label="Bank name" required><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></FormField>
          <FormField label="IFSC"><Input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} /></FormField>
          <FormField label="Branch" className="col-span-2"><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary salary account</label>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} loading={add.isPending || update.isPending} onClick={async () => {
            if (isEdit) {
              const body: Record<string, unknown> = { employeeId, id: editing!["id"], accountHolder: form.accountHolder, bankName: form.bankName, branch: form.branch || undefined, ifsc: form.ifsc || undefined, isPrimary: form.isPrimary };
              if (form.accountNumber) body["accountNumber"] = form.accountNumber;
              await update.mutateAsync(body as never);
            } else {
              await add.mutateAsync({ employeeId, accountHolder: form.accountHolder, accountNumber: form.accountNumber, bankName: form.bankName, branch: form.branch || undefined, ifsc: form.ifsc || undefined, isPrimary: form.isPrimary });
            }
            onClose();
          }}>{isEdit ? "Save" : "Add account"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankSection({ employeeId, banks }: { employeeId: string; banks: Array<Record<string, any>> }) {
  const del = useDeleteBank();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, any> | null>(null);
  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle className="text-sm flex items-center gap-2"><Landmark className="size-4 text-primary dark:text-chart-3" /> Bank accounts</CardTitle><p className="text-xs text-text-faint">Used for salary credit. Account numbers are masked.</p></div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add</Button>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {!banks.length ? (
          <p className="text-sm text-text-faint">No bank account added yet. Add your salary account so payroll can credit your pay.</p>
        ) : banks.map((b) => (
          <div key={b["id"]} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text flex items-center gap-2">{b["bankName"]}{b["isPrimary"] && <Badge variant="success">Primary</Badge>}</p>
              <p className="text-xs text-text-muted font-mono">{b["accountNumber"]}{b["ifsc"] ? ` · ${b["ifsc"]}` : ""}</p>
              <p className="text-[11px] text-text-faint">{b["accountHolder"]}{b["branch"] ? ` · ${b["branch"]}` : ""}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="size-4" /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => del.mutate({ employeeId, id: b["id"] })}><Trash2 className="size-4 text-danger" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
      <BankDialog employeeId={employeeId} editing={editing} open={open} onClose={() => { setOpen(false); setEditing(null); }} />
    </Card>
  );
}

export function MyProfilePage() {
  const profile = useMyProfile();
  const documents = useMyDocuments();
  const uploadPhoto = useUploadPhoto();
  const cancelRequest = useCancelChangeRequest();
  const [editPersonal, setEditPersonal] = React.useState(false);
  const [editProfessional, setEditProfessional] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [presetCategory, setPresetCategory] = React.useState<string | undefined>(undefined);
  const photoInput = React.useRef<HTMLInputElement>(null);

  if (profile.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }
  if (profile.isError || !profile.data) {
    return <ErrorState message={apiErrorMessage(profile.error)} onRetry={() => profile.refetch()} />;
  }

  const p = profile.data;
  const pending = p.pendingChangeRequest;

  return (
    <div className="space-y-4">
      {/* hero — thin brand accent strip, all content on the white surface (always legible) */}
      <Card className="overflow-hidden rounded-xl">
        <div className="h-1.5 bg-gradient-to-r from-secondary via-primary to-(--chart-2)" aria-hidden />
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <Avatar size="xl" className="ring-2 ring-border shadow-card">
                  {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                  <AvatarFallback className="text-2xl">{initials(p.firstName, p.lastName)}</AvatarFallback>
                </Avatar>
                <button
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-white shadow-card hover:bg-primary-hover transition-colors cursor-pointer"
                  onClick={() => photoInput.current?.click()}
                  aria-label="Change photo"
                >
                  <Camera className="size-3.5" />
                </button>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto.mutate(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-text">
                    {p.firstName} {p.lastName}
                  </h1>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {p.designation?.title ?? "—"} · {p.department?.name ?? "—"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="font-mono">{p.employeeCode}</Badge>
                  <Badge>{p.email}</Badge>
                  {p.dateOfJoining && <Badge variant="primary">Joined {formatDate(p.dateOfJoining)}</Badge>}
                  {p.manager && <Badge variant="info">Reports to {p.manager.firstName} {p.manager.lastName}</Badge>}
                  {p.location && <Badge>{p.location.name}</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-surface-sunken px-4 py-3">
              <CompletionRing score={p.completion.score} />
              <div className="text-sm">
                <p className="font-medium text-text">Profile completion</p>
                <p className="text-xs text-text-muted max-w-44">
                  {p.completion.score === 100 ? "All set — great job!" : "Complete the items below to reach 100%."}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* pending request banner */}
      {pending && (
        <Alert variant="warning" title="Changes awaiting HR review">
          <span className="block">
            Submitted {formatDateTime(pending.submittedAt)} — fields: {Object.keys(pending.changes).join(", ")}.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 -ml-2 text-danger hover:text-danger"
            loading={cancelRequest.isPending}
            onClick={() => cancelRequest.mutate(pending.id)}
          >
            <X /> Cancel request
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* completion checklist + alerts — RIGHT column (offset down to align with tab content) */}
        <div className="space-y-4 order-1 lg:order-2 lg:mt-15">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-sm">Complete your profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {Object.entries(p.completion.sections).map(([key, section]) => (
                <div key={key} className="flex items-start gap-2.5 text-sm">
                  {section.complete ? (
                    <CheckCircle2 className="size-4 mt-0.5 text-success shrink-0" />
                  ) : (
                    <Circle className="size-4 mt-0.5 text-text-faint shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium capitalize", section.complete ? "text-text-muted line-through" : "text-text")}>
                      {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                      <span className="ml-1.5 text-[11px] text-text-faint">+{section.weight}%</span>
                    </p>
                    {!section.complete && <p className="text-xs text-text-muted break-words">{section.hint}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {(p.missingDocuments.length > 0 || p.expiringDocuments.length > 0) && (
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="size-4 text-warning" /> Document alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.missingDocuments.map((cat) => (
                  <button
                    key={cat}
                    className="flex w-full items-center justify-between rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-sm hover:shadow-card transition-shadow cursor-pointer"
                    onClick={() => {
                      setPresetCategory(cat);
                      setUploadOpen(true);
                    }}
                  >
                    <span className="flex items-center gap-2 text-text">
                      <AlertCircle className="size-4 text-warning" />
                      {DOC_CATEGORIES.find((c) => c.value === cat)?.label ?? cat} missing
                    </span>
                    <span className="text-xs text-primary dark:text-chart-3">Upload</span>
                  </button>
                ))}
                {p.expiringDocuments.map((doc) => (
                  <div key={doc["id"]} className="flex items-center justify-between rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-text">
                      <Clock className="size-4 text-danger" /> {doc["name"]} expires {formatDate(doc["expiresOn"])}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* main sections — LEFT column */}
        <div className="lg:col-span-2 lg:order-1">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview"><Briefcase /> Overview</TabsTrigger>
              <TabsTrigger value="bank"><Landmark /> Bank</TabsTrigger>
              <TabsTrigger value="documents"><FileText /> Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* work info — read-only */}
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-sm">Work information</CardTitle>
                  <p className="text-xs text-text-faint">Managed by HR — contact HR for corrections.</p>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  {[
                    ["Employee code", p.employeeCode],
                    ["Department", p.department?.name ?? "—"],
                    ["Designation", p.designation?.title ?? "—"],
                    ["Employment type", p.employmentType.replace("_", " ")],
                    ["Date of joining", formatDate(p.dateOfJoining)],
                    ["Manager", p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : "—"],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className="text-xs text-text-faint">{label}</p>
                      <p className="font-medium text-text">{value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* personal — approval workflow */}
              <Card className="rounded-xl">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">Personal information</CardTitle>
                  <Button variant="secondary" size="sm" onClick={() => setEditPersonal(true)} disabled={Boolean(pending)}>
                    <Pencil /> Edit
                  </Button>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  {[
                    ["Personal email", p.personalEmail ?? "—"],
                    ["Mobile", p.phone ?? "—"],
                    ["Alternate mobile", p.altPhone ?? "—"],
                    ["Date of birth", formatDate(p.dateOfBirth)],
                    ["Blood group", p.bloodGroup ?? "—"],
                    ["Marital status", p.maritalStatus],
                    ["Current address", p.currentAddress ?? "—"],
                    ["Permanent address", p.permanentAddress ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label as string} className={cn((label === "Current address" || label === "Permanent address") && "col-span-2 sm:col-span-3")}>
                      <p className="text-xs text-text-faint">{label}</p>
                      <p className="font-medium text-text">{value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* professional — instant */}
              <Card className="rounded-xl">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">Professional information</CardTitle>
                  <Button variant="secondary" size="sm" onClick={() => setEditProfessional(true)}>
                    <Pencil /> Edit
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-text-faint mb-1">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.skills.length ? (
                        p.skills.map((s) => (
                          <Badge key={s.skill.id} variant="primary">{s.skill.name} · L{s.level}</Badge>
                        ))
                      ) : (
                        <span className="text-text-faint">No skills added yet</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-text-faint mb-1">Languages</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.languages?.length ? (
                        p.languages.map((l) => <Badge key={l}>{l}</Badge>)
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {p.linkedinUrl && (
                      <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline dark:text-chart-3">
                        <Link2 className="size-4" /> LinkedIn
                      </a>
                    )}
                    {p.portfolioUrl && (
                      <a href={p.portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline dark:text-chart-3">
                        <Globe className="size-4" /> Portfolio
                      </a>
                    )}
                  </div>
                  {p.careerInterests && (
                    <div>
                      <p className="text-xs text-text-faint mb-1">Career interests</p>
                      <p className="text-text">{p.careerInterests}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bank">
              <BankSection employeeId={p.id} banks={p.bankDetails} />
            </TabsContent>

            <TabsContent value="documents">
              <Card className="rounded-xl">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">My documents</CardTitle>
                  <Button size="sm" onClick={() => { setPresetCategory(undefined); setUploadOpen(true); }}>
                    <FileUp /> Upload
                  </Button>
                </CardHeader>
                <CardContent>
                  {documents.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : !documents.data?.length ? (
                    <EmptyState icon={FileText} title="No documents yet" description="Upload your Aadhaar, PAN, resume and address proof to complete compliance." />
                  ) : (
                    <div className="space-y-2">
                      {documents.data.map((group) => (
                        <div key={group.current["id"]} className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <a href={group.current["fileUrl"]} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 min-w-0 hover:underline">
                              <FileText className="size-4 text-text-muted shrink-0" />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-text truncate">{group.current["name"]}</span>
                                <span className="block text-[11px] text-text-muted">
                                  {DOC_CATEGORIES.find((c) => c.value === group.current["category"])?.label ?? group.current["category"]}
                                  {" · "}v{group.current["version"]} · {formatDate(group.current["createdAt"])}
                                  {group.current["expiresOn"] ? ` · expires ${formatDate(group.current["expiresOn"])}` : ""}
                                </span>
                              </span>
                            </a>
                            <Badge variant={group.current["verifiedAt"] ? "success" : "default"}>
                              {group.current["verifiedAt"] ? "Verified" : "Unverified"}
                            </Badge>
                          </div>
                          {group.history.length > 0 && (
                            <p className="mt-1.5 text-[11px] text-text-faint">
                              {group.history.length} earlier {group.history.length === 1 ? "version" : "versions"} retained
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PersonalEditDialog profile={p} open={editPersonal} onClose={() => setEditPersonal(false)} />
      <ProfessionalEditDialog profile={p} open={editProfessional} onClose={() => setEditProfessional(false)} />
      <DocumentUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} presetCategory={presetCategory} />
    </div>
  );
}
