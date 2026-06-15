import * as React from "react";
import { ImageUp, Save, Stamp, Palette, Mail, Send, Eye } from "lucide-react";
import {
  useBranding, useUpdateBranding, useUploadBrandingAsset, useEmailPreview, useSendTestEmail,
  type Branding, type BrandingAssetType, type EmailPreviewKey,
} from "./useBranding";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { cn } from "@/lib/utils";

function AssetUpload({ label, url, type, canManage }: { label: string; url: string | null; type: BrandingAssetType; canManage: boolean }) {
  const upload = useUploadBrandingAsset();
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-text-muted mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-border bg-surface-sunken overflow-hidden")}>
          {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-text-faint">None</span>}
        </div>
        {canManage && (
          <>
            <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}>
              <ImageUp className="size-3.5" /> {url ? "Replace" : "Upload"}
            </Button>
            <input
              ref={input} type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ type, file: f }); e.target.value = ""; }}
            />
          </>
        )}
      </div>
    </div>
  );
}

const WATERMARKS: Branding["watermark"][] = ["", "CONFIDENTIAL", "OFFICIAL DOCUMENT", "EMPLOYEE COPY"];

export function BrandingSettings({ canManage }: { canManage: boolean }) {
  const branding = useBranding();
  const update = useUpdateBranding();
  const [form, setForm] = React.useState<Branding | null>(null);

  React.useEffect(() => { if (branding.data && !form) setForm(branding.data); }, [branding.data, form]);

  if (branding.isLoading || !form) return <Skeleton className="h-80 rounded-xl" />;

  const set = (patch: Partial<Branding>) => setForm({ ...form, ...patch });

  return (
    <Card className="rounded-xl p-5 space-y-5">
      <div>
        <p className="font-semibold text-text flex items-center gap-2"><Palette className="size-4 text-primary dark:text-chart-3" /> Company Branding</p>
        <p className="text-xs text-text-muted mt-0.5">Logo, signatures, stamp and footer applied to every generated document (payslips, letters, certificates).</p>
      </div>

      {/* assets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AssetUpload label="Company logo" url={form.logoUrl} type="logo" canManage={canManage} />
        <AssetUpload label="Letterhead" url={form.letterheadUrl} type="letterhead" canManage={canManage} />
        <AssetUpload label="Company stamp" url={form.stampUrl} type="stamp" canManage={canManage} />
        <AssetUpload label="HR signature" url={form.signatures.hr} type="signatureHr" canManage={canManage} />
        <AssetUpload label="CEO signature" url={form.signatures.ceo} type="signatureCeo" canManage={canManage} />
        <AssetUpload label="Director signature" url={form.signatures.director} type="signatureDirector" canManage={canManage} />
      </div>

      {/* text fields */}
      <FormField label="Tagline" hint="Shown under the company name on documents">
        <Input value={form.tagline} disabled={!canManage} onChange={(e) => set({ tagline: e.target.value })} placeholder="Intelligent Digital Transformation" />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Authorised signatory — name">
          <Input value={form.signatory.name} disabled={!canManage} onChange={(e) => set({ signatory: { ...form.signatory, name: e.target.value } })} placeholder="Ms Shraddha Nagrani" />
        </FormField>
        <FormField label="Signatory — title">
          <Input value={form.signatory.title} disabled={!canManage} onChange={(e) => set({ signatory: { ...form.signatory, title: e.target.value } })} placeholder="Head of Human Resources" />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Footer — website"><Input value={form.footer.website} disabled={!canManage} onChange={(e) => set({ footer: { ...form.footer, website: e.target.value } })} /></FormField>
        <FormField label="Footer — email"><Input value={form.footer.email} disabled={!canManage} onChange={(e) => set({ footer: { ...form.footer, email: e.target.value } })} /></FormField>
        <FormField label="Footer — phone"><Input value={form.footer.phone} disabled={!canManage} onChange={(e) => set({ footer: { ...form.footer, phone: e.target.value } })} /></FormField>
      </div>

      <FormField label="Document watermark" hint="Optional — overlaid faintly across generated PDFs">
        <Select value={form.watermark || "__none__"} onValueChange={(v) => set({ watermark: (v === "__none__" ? "" : v) as Branding["watermark"] })} disabled={!canManage}>
          <SelectTrigger aria-label="Watermark"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {WATERMARKS.filter(Boolean).map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>

      {/* email branding */}
      <div className="border-t border-border pt-4">
        <p className="font-medium text-text flex items-center gap-2 text-sm"><Mail className="size-4 text-primary dark:text-chart-3" /> Email Branding</p>
        <p className="text-xs text-text-muted mt-0.5 mb-3">Applied to every outgoing email. The logo must be a <strong>public URL</strong> (CloudFront/S3) — email clients can't load authenticated files.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Email logo URL" hint="e.g. https://assets.somvanshitechnologies.com/logo.png">
            <Input value={form.email.logoUrl ?? ""} disabled={!canManage} onChange={(e) => set({ email: { ...form.email, logoUrl: e.target.value } })} placeholder="https://cdn.…/branding/logo.png" />
          </FormField>
          <FormField label="Header color" hint="Hex color of the email header band">
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Header color" value={form.email.headerColor || "#0A3D62"} disabled={!canManage} onChange={(e) => set({ email: { ...form.email, headerColor: e.target.value } })} className="h-9 w-12 rounded border border-border bg-transparent p-1" />
              <Input value={form.email.headerColor} disabled={!canManage} onChange={(e) => set({ email: { ...form.email, headerColor: e.target.value } })} placeholder="#0A3D62" />
            </div>
          </FormField>
          <FormField label="Footer text">
            <Input value={form.email.footerText} disabled={!canManage} onChange={(e) => set({ email: { ...form.email, footerText: e.target.value } })} placeholder="Somvanshi Technologies · automated message" />
          </FormField>
          <FormField label="Company website">
            <Input value={form.email.website} disabled={!canManage} onChange={(e) => set({ email: { ...form.email, website: e.target.value } })} placeholder="https://somvanshitechnologies.com" />
          </FormField>
        </div>
      </div>

      {canManage && (
        <Button loading={update.isPending} onClick={() => update.mutate({ tagline: form.tagline, signatory: form.signatory, footer: form.footer, watermark: form.watermark, email: form.email })}>
          <Save /> Save branding
        </Button>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-text-faint"><Stamp className="size-3" /> Asset uploads apply immediately; text fields save with the button.</p>
    </Card>
  );
}

const PREVIEW_TABS: { key: EmailPreviewKey; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "password-reset", label: "Password Reset" },
  { key: "payslip", label: "Payslip" },
  { key: "announcement", label: "Announcement" },
];

/** Settings → Email Templates: preview each template and send a live test. */
export function EmailTemplatesCard({ canManage, defaultTo }: { canManage: boolean; defaultTo?: string }) {
  const [active, setActive] = React.useState<EmailPreviewKey>("welcome");
  const [to, setTo] = React.useState(defaultTo ?? "");
  const preview = useEmailPreview(active, true);
  const sendTest = useSendTestEmail();

  return (
    <Card className="rounded-xl p-5 space-y-4">
      <div>
        <p className="font-semibold text-text flex items-center gap-2"><Eye className="size-4 text-primary dark:text-chart-3" /> Email Templates</p>
        <p className="text-xs text-text-muted mt-0.5">Preview the branded templates and send a test before going live on your email provider.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PREVIEW_TABS.map((t) => (
          <Button key={t.key} size="sm" variant={active === t.key ? "primary" : "secondary"} onClick={() => setActive(t.key)}>{t.label}</Button>
        ))}
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-surface-sunken">
        {preview.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <iframe title="Email preview" sandbox="" className="h-80 w-full bg-white" srcDoc={preview.data?.html ?? ""} />
        )}
      </div>

      {canManage && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <FormField label="Send a test to" className="flex-1">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
          </FormField>
          <Button
            loading={sendTest.isPending}
            disabled={!to}
            onClick={() => sendTest.mutate({ key: active, to })}
          >
            <Send /> Send {PREVIEW_TABS.find((t) => t.key === active)?.label} Test
          </Button>
        </div>
      )}
    </Card>
  );
}
