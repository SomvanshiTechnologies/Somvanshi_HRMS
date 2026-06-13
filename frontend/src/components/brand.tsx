import { cn } from "@/lib/utils";
import logoUrl from "@/assets/brand/logo_STech.jpg";

/**
 * SomHR brand lockup. The real Somvanshi Technologies logo is used everywhere —
 * on light surfaces (login, emails) and as a white logo-chip inside the dark
 * sidebar so the mark stays legible regardless of its own colours.
 */
/** Small icon-only logo tile (collapsed sidebar / favicons). object-contain, never cropped. */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm select-none", className)}
      style={{ width: size, height: size }}
    >
      <img src={logoUrl} alt="Somvanshi Technologies" className="h-full w-full object-contain p-0.5" />
    </div>
  );
}

/** Sidebar brand. Expanded: compact logo tile + wordmark. Collapsed: icon only. */
export function BrandLockup({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) return <BrandMark size={36} className="ring-1 ring-white/20" />;
  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <BrandMark size={40} className="shrink-0 ring-1 ring-white/20" />
      <div className="leading-tight">
        <p className="text-[15px] font-semibold text-white tracking-tight">Somvanshi HRMS</p>
        <p className="text-[10px] text-sidebar-text">People. Performance. Growth.</p>
      </div>
    </div>
  );
}

/** Full logo for light surfaces (login, headers) — object-contain, never cropped. */
export function CompanyLogo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="Somvanshi Technologies" className={cn("block h-14 w-auto object-contain", className)} />;
}
