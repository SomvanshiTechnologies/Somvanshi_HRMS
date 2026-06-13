import * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import axios from "axios";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuthStore } from "@/stores/auth";
import { useMe } from "@/features/auth/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { SomAIWidget } from "@/features/somai/SomAIWidget";

/**
 * Restore the session from the shared httpOnly refresh cookie when a tab has
 * no access token yet (new tab / hard reload). sessionStorage is tab-scoped,
 * but the refresh cookie is shared — so a silent refresh keeps the user
 * signed in across tabs instead of bouncing them to /login.
 */
function useSessionBootstrap(): "checking" | "authenticated" | "guest" {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = React.useState<"checking" | "authenticated" | "guest">(
    accessToken ? "authenticated" : "checking"
  );

  React.useEffect(() => {
    if (accessToken) {
      setStatus("authenticated");
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data } = await axios.post<{ data: { accessToken: string } }>(
          "/api/v1/auth/refresh",
          {},
          { withCredentials: true }
        );
        if (!active) return;
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        setStatus("authenticated");
      } catch {
        if (active) setStatus("guest");
      }
    })();
    return () => {
      active = false;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}

/** Authenticated application shell: sidebar + topbar + routed content. */
export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const session = useSessionBootstrap();
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem("somhr-sidebar") === "1");
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // hydrate /auth/me (fresh permissions) once authenticated
  const me = useMe(session === "authenticated");

  if (session === "checking" || (session === "authenticated" && !user && me.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="w-72 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-2/3 mx-auto" />
        </div>
      </div>
    );
  }

  if (session === "guest") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const toggleSidebar = () => {
    setCollapsed((c) => {
      localStorage.setItem("somhr-sidebar", c ? "0" : "1");
      return !c;
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMobileMenu={() => setMobileOpen(true)} />
          <main className="flex-1 p-4 lg:p-6 max-w-[1800px] w-full mx-auto">
            <Outlet />
          </main>
          <footer className="border-t border-border px-6 py-3 text-center text-xs text-text-faint">
            Somvanshi HRMS · Somvanshi Technologies — People. Performance. Growth.
          </footer>
        </div>
        <SomAIWidget />
      </div>
    </TooltipProvider>
  );
}

/** Route guard: renders children only when the permission set allows. */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const allowed = anyOf.length === 0 || anyOf.some((p) => user?.permissions.includes(p));
  if (user && !allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
