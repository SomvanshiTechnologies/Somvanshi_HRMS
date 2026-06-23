import { cn } from "@/lib/utils";

const LOGO_URL = "/logo-dark.png";

/** Small icon-only logo tile (collapsed sidebar). */
export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center overflow-hidden rounded-lg select-none", className)}
      style={{ width: size, height: size }}
    >
      <img src={LOGO_URL} alt="Somvanshi Technologies" className="h-full w-full object-contain p-0.5" />
    </div>
  );
}

/** Sidebar brand. Expanded: wide logo + wordmark below. Collapsed: icon only. */
export function BrandLockup({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) return <BrandMark size={36} />;
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <img src={LOGO_URL} alt="Somvanshi Technologies" className="h-10 w-auto object-contain object-left" />
      <div className="leading-tight">
        <p className="text-[13px] font-semibold text-white tracking-tight">Somvanshi HRMS</p>
        <p className="text-[10px] text-sidebar-text">People. Performance. Growth.</p>
      </div>
    </div>
  );
}

/** Full logo for light surfaces (login mobile, headers). */
export function CompanyLogo({ className }: { className?: string }) {
  return <img src={LOGO_URL} alt="Somvanshi Technologies" className={cn("block h-14 w-auto object-contain", className)} />;
}
