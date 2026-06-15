import { prisma } from "../../config/db.js";

/**
 * Company branding applied to every generated document (payslips, letters,
 * certificates…). Stored in AppSetting under the `branding` key so admins can
 * change the logo / signatures / footer without code changes. Falls back to the
 * Company record + bundled defaults when unset.
 */
export interface Branding {
  tagline: string;
  logoUrl: string | null;
  letterheadUrl: string | null;
  stampUrl: string | null;
  signatures: { hr: string | null; ceo: string | null; director: string | null };
  signatory: { name: string; title: string };
  footer: { website: string; email: string; phone: string };
  watermark: "" | "CONFIDENTIAL" | "OFFICIAL DOCUMENT" | "EMPLOYEE COPY";
  /**
   * Email-specific branding. `logoUrl` MUST be a public URL (CloudFront/S3
   * static) — email clients can't load the authenticated /files route — so it
   * is kept separate from the document `logoUrl`.
   */
  email: {
    logoUrl: string | null;
    headerColor: string;
    footerText: string;
    website: string;
  };
}

export type AssetType = "logo" | "letterhead" | "stamp" | "signatureHr" | "signatureCeo" | "signatureDirector";

const KEY = "branding";

function emptyBranding(): Branding {
  return {
    tagline: "Intelligent Digital Transformation",
    logoUrl: null,
    letterheadUrl: null,
    stampUrl: null,
    signatures: { hr: null, ceo: null, director: null },
    signatory: { name: "", title: "" },
    footer: { website: "", email: "", phone: "" },
    watermark: "",
    email: {
      logoUrl: null,
      headerColor: "#0A3D62",
      footerText: "Somvanshi Technologies · This is an automated message from SomHR.",
      website: "",
    },
  };
}

export const brandingService = {
  /** Resolved branding: stored config merged over Company-record + HR-head defaults. */
  async get(): Promise<Branding> {
    const [row, company, hrHead] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: KEY } }),
      prisma.company.findFirst({ select: { name: true, email: true, phone: true, website: true } }),
      prisma.employee.findFirst({
        where: { deletedAt: null, user: { roles: { some: { role: { name: "HR_ADMIN" } } } } },
        select: { firstName: true, lastName: true, designation: { select: { title: true } } },
      }),
    ]);
    const stored = (row?.value as Partial<Branding> | undefined) ?? {};
    const base = emptyBranding();
    return {
      tagline: stored.tagline || base.tagline,
      logoUrl: stored.logoUrl ?? base.logoUrl,
      letterheadUrl: stored.letterheadUrl ?? base.letterheadUrl,
      stampUrl: stored.stampUrl ?? base.stampUrl,
      signatures: { ...base.signatures, ...(stored.signatures ?? {}) },
      signatory: {
        name: stored.signatory?.name || (hrHead ? `${hrHead.firstName} ${hrHead.lastName}` : "Authorised Signatory"),
        title: stored.signatory?.title || hrHead?.designation?.title || "Human Resources",
      },
      footer: {
        website: stored.footer?.website || company?.website || "",
        email: stored.footer?.email || company?.email || "",
        phone: stored.footer?.phone || company?.phone || "",
      },
      watermark: stored.watermark ?? base.watermark,
      email: {
        logoUrl: stored.email?.logoUrl ?? base.email.logoUrl,
        headerColor: stored.email?.headerColor || base.email.headerColor,
        footerText: stored.email?.footerText || base.email.footerText,
        website: stored.email?.website || company?.website || base.email.website,
      },
    };
  },

  /** Raw stored config (no fallbacks) for the editor form. */
  async getRaw(): Promise<Partial<Branding>> {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    return (row?.value as Partial<Branding> | undefined) ?? {};
  },

  async update(patch: Partial<Branding>, userId: string): Promise<Branding> {
    const current = await this.getRaw();
    const merged = {
      ...current,
      ...patch,
      signatures: { ...(current.signatures ?? {}), ...(patch.signatures ?? {}) },
      signatory: { ...(current.signatory ?? {}), ...(patch.signatory ?? {}) },
      footer: { ...(current.footer ?? {}), ...(patch.footer ?? {}) },
      email: { ...(current.email ?? {}), ...(patch.email ?? {}) },
    };
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: merged as object, updatedBy: userId },
      update: { value: merged as object, updatedBy: userId },
    });
    return this.get();
  },

  async setAsset(type: AssetType, url: string, userId: string): Promise<Branding> {
    const map: Record<AssetType, Partial<Branding>> = {
      logo: { logoUrl: url },
      letterhead: { letterheadUrl: url },
      stamp: { stampUrl: url },
      signatureHr: { signatures: { hr: url, ceo: null, director: null } },
      signatureCeo: { signatures: { hr: null, ceo: url, director: null } },
      signatureDirector: { signatures: { hr: null, ceo: null, director: url } },
    };
    // for signature sub-keys, only patch the relevant one (merge handled in update)
    if (type.startsWith("signature")) {
      const current = await this.getRaw();
      const key = type === "signatureHr" ? "hr" : type === "signatureCeo" ? "ceo" : "director";
      return this.update({ signatures: { ...(current.signatures ?? { hr: null, ceo: null, director: null }), [key]: url } as Branding["signatures"] }, userId);
    }
    return this.update(map[type], userId);
  },
};
