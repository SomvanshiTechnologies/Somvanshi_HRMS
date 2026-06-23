import { CompanyLogo } from "@/components/brand";

/** Split-screen auth layout: brand panel + form card. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr] bg-bg">
      {/* brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-secondary overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(60rem 60rem at 20% 0%, #0a3d62 0%, transparent 50%), radial-gradient(40rem 40rem at 100% 100%, #2e86ab 0%, transparent 45%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white h-full">
          <div className="flex flex-col items-start gap-1.5">
            <img src="/logo-dark.png" alt="Somvanshi Technologies" className="h-14 w-auto object-contain object-left -ml-2" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Somvanshi HRMS</span>
          </div>

          <div className="max-w-lg">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              People. <span className="text-(--chart-3)">Performance.</span><br />Growth.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80">
              Somvanshi HRMS is Somvanshi Technologies' enterprise people platform — one workspace
              for the entire employee lifecycle: hire, onboard, manage, pay, grow.
            </p>
          </div>

          <div className="text-xs text-white/60">
            © {new Date().getFullYear()} Somvanshi Technologies. All rights reserved.
          </div>
        </div>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex justify-center">
            <CompanyLogo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
