import { CompanyLogo } from "@/components/brand";

/** Split-screen auth layout: brand panel + form card. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2 bg-bg">
      {/* brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-secondary p-12 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(60rem 60rem at 20% 0%, #0a3d62 0%, transparent 50%), radial-gradient(40rem 40rem at 100% 100%, #2e86ab 0%, transparent 45%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 overflow-hidden rounded-xl bg-white shadow-sm w-fit">
          <CompanyLogo className="h-20" />
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold text-white leading-tight tracking-tight">
            People. <span className="text-(--chart-3)">Performance.</span> Growth.
          </h1>
          <p className="mt-4 text-slate-300 leading-relaxed">
            Somvanshi HRMS is Somvanshi Technologies' enterprise people platform — one workspace
            for the entire employee lifecycle: hire, onboard, manage, pay, grow.
          </p>
        </div>
        <p className="relative z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} Somvanshi Technologies. All rights reserved.
        </p>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6">
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
