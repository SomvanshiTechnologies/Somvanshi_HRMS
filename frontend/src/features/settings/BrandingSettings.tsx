import * as React from "react";
import { ImageUp, Save, Stamp, Palette } from "lucide-react";
import {
  useBranding, useUpdateBranding, useUploadBrandingAsset,
  type Branding, type BrandingAssetType,
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

      {canManage && (
        <Button loading={update.isPending} onClick={() => update.mutate({ tagline: form.tagline, signatory: form.signatory, footer: form.footer, watermark: form.watermark })}>
          <Save /> Save branding
        </Button>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-text-faint"><Stamp className="size-3" /> Asset uploads apply immediately; text fields save with the button.</p>
    </Card>
  );
}
