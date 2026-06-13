import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UserCircle2,
} from "lucide-react";
import { api, type ApiList } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotifications, type Notification } from "@/features/notifications/useNotifications";
import { useLogout } from "@/features/auth/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn, initials, formatDateTime } from "@/lib/utils";

// Explicit, professional labels per route slug. Anything not listed is
// title-cased; long/ID-looking segments become "Details".
const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  feed: "Company Feed",
  profile: "My Profile",
  "profile-approvals": "Profile Approvals",
  employees: "Employees",
  new: "New",
  edit: "Edit",
  "org-chart": "Org Chart",
  organization: "Organization",
  onboarding: "Onboarding",
  celebrations: "Celebrations",
  attendance: "Attendance",
  shifts: "Shifts",
  leave: "Leave Management",
  approvals: "Approvals",
  payroll: "Payroll",
  payslips: "Payslips",
  "salary-revisions": "Salary Revisions",
  candidates: "Candidates",
  jobs: "Jobs",
  interviews: "Interviews",
  performance: "Performance",
  assets: "Assets",
  helpdesk: "Helpdesk",
  expenses: "Expenses",
  exit: "Exit Management",
  compliance: "Compliance",
  reports: "Reports",
  sera: "Sera",
  roles: "Roles & Permissions",
  audit: "Audit Log",
  settings: "Settings",
  security: "Security",
};

/** Title-case a slug; treat IDs (cuid/long alphanumerics) as "Details". */
function prettifySlug(slug: string): string {
  if (slug.length > 18 || /^[a-z0-9]{16,}$/i.test(slug)) return "Details";
  return slug.split("-").map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : "")).join(" ");
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1 text-sm text-text-muted min-w-0">
      <Link to="/" className="hover:text-text transition-colors shrink-0">
        Home
      </Link>
      {parts.map((part, i) => {
        const to = "/" + parts.slice(0, i + 1).join("/");
        const label = ROUTE_LABELS[part] ?? prettifySlug(part);
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={to}>
            <ChevronRight className="size-3.5 shrink-0 text-text-faint" aria-hidden />
            {isLast ? (
              <span className="font-medium text-text truncate">{label}</span>
            ) : (
              <Link to={to} className="hover:text-text transition-colors truncate">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

interface EmployeeHit {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  designation: { title: string } | null;
}

function GlobalSearch() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [term, setTerm] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const debounced = useDebounced(term, 300);

  const enabled = can("employees:read_all") && debounced.length >= 2;
  const { data } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: async () =>
      (await api.get<ApiList<EmployeeHit>>("/employees", { params: { search: debounced, limit: 6 } })).data.data,
    enabled,
  });

  if (!can("employees:read_all")) return null;

  return (
    <div className="relative hidden md:block w-72">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
      <Input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => term && setOpen(true)}
        placeholder="Search employees…"
        className="pl-8 bg-surface-sunken border-transparent focus-visible:bg-surface"
        aria-label="Global search"
      />
      {open && enabled && (
        <div className="absolute top-full mt-1.5 w-full rounded-md border border-border bg-surface shadow-raised z-50 overflow-hidden">
          {!data?.length ? (
            <p className="p-3 text-sm text-text-muted">No matches for “{debounced}”</p>
          ) : (
            data.map((hit) => (
              <button
                key={hit.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-sunken transition-colors cursor-pointer"
                onMouseDown={() => {
                  navigate(`/employees/${hit.id}`);
                  setTerm("");
                  setOpen(false);
                }}
              >
                <Avatar size="sm">
                  {hit.photoUrl && <AvatarImage src={hit.photoUrl} alt="" />}
                  <AvatarFallback>{initials(hit.firstName, hit.lastName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text truncate">
                    {hit.firstName} {hit.lastName}
                  </span>
                  <span className="block text-xs text-text-muted truncate">
                    {hit.employeeCode} · {hit.designation?.title ?? "—"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function NotificationCenter() {
  const [open, setOpen] = React.useState(false);
  const { list, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unreadCount} unread)`} onClick={() => setOpen(true)}>
        <Bell />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      <SheetContent>
        <SheetHeader className="flex flex-row items-center justify-between pr-10">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          )}
        </SheetHeader>
        <SheetBody className="p-0">
          {!list.data?.data.length ? (
            <EmptyState icon={Bell} title="You're all caught up" description="New approvals, alerts and updates will appear here." />
          ) : (
            list.data.data.map((n: Notification) => (
              <button
                key={n.id}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-surface-sunken cursor-pointer",
                  !n.isRead && "bg-info-bg/50"
                )}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.link) {
                    navigate(n.link);
                    setOpen(false);
                  }
                }}
              >
                <span className="flex items-center gap-2">
                  {!n.isRead && <span className="size-1.5 rounded-full bg-info shrink-0" aria-hidden />}
                  <span className="text-sm font-medium text-text">{n.title}</span>
                </span>
                {n.body && <span className="text-xs text-text-muted line-clamp-2">{n.body}</span>}
                <span className="text-[11px] text-text-faint">{formatDateTime(n.createdAt)}</span>
              </button>
            ))
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export function Topbar({ onMobileMenu }: { onMobileMenu: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { theme, toggle } = useThemeStore();
  const logout = useLogout();
  const navigate = useNavigate();

  const emp = user?.employee;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 backdrop-blur px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMobileMenu} aria-label="Open menu">
        <Menu />
      </Button>

      <Breadcrumbs />
      <div className="flex-1" />
      <GlobalSearch />

      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
        {theme === "light" ? <Moon /> : <Sun />}
      </Button>

      <NotificationCenter />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-md p-1 pr-2 hover:bg-surface-sunken transition-colors cursor-pointer" aria-label="Account menu">
            <Avatar size="sm">
              {emp?.photoUrl && <AvatarImage src={emp.photoUrl} alt="" />}
              <AvatarFallback>{initials(emp?.firstName, emp?.lastName)}</AvatarFallback>
            </Avatar>
            <span className="hidden xl:block text-left leading-tight">
              <span className="block text-[13px] font-medium text-text max-w-36 truncate">
                {emp ? `${emp.firstName} ${emp.lastName}` : user?.email}
              </span>
              <span className="block text-[11px] text-text-muted max-w-36 truncate">
                {user?.roles[0]?.displayName}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-0">
          {/* account header */}
          <div className="flex items-center gap-3 border-b border-border bg-surface-sunken/60 px-4 py-3.5">
            <Avatar size="md">
              {emp?.photoUrl && <AvatarImage src={emp.photoUrl} alt="" />}
              <AvatarFallback>{initials(emp?.firstName, emp?.lastName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text truncate">
                {emp ? `${emp.firstName} ${emp.lastName}` : "Account"}
              </p>
              <p className="text-xs text-text-muted truncate">{user?.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {user?.roles.map((r) => (
                  <Badge key={r.name} variant="primary" className="text-[10px] px-2 py-0.5">
                    {r.displayName}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="p-1.5">
            {emp && (
              <DropdownMenuItem onSelect={() => navigate("/profile")}>
                <UserCircle2 /> My Profile
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => navigate("/security")}>
              <KeyRound /> Security & Sessions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => logout.mutate()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
