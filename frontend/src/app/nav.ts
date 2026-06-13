import {
  Banknote,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  DoorOpen,
  FileText,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MonitorSmartphone,
  Network,
  PartyPopper,
  Receipt,
  Rocket,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCircle2,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation registry (fixed IA per design spec). `permissions` = backend
 * permission codes; an item renders ONLY if /auth/me grants at least one
 * (empty = everyone). Modules from future phases route to ComingSoon pages
 * until they ship.
 */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permissions: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard, permissions: [] },
      { label: "Company Feed", to: "/feed", icon: Megaphone, permissions: ["announcement:read"] },
      { label: "My Profile", to: "/profile", icon: UserCircle2, permissions: [] },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Employees", to: "/employees", icon: Users, permissions: ["employees:read_all"] },
      { label: "Org Chart", to: "/org-chart", icon: Network, permissions: ["employees:read", "employees:read_all"] },
      { label: "Organization", to: "/organization", icon: Building2, permissions: ["org:manage"] },
      { label: "Profile Approvals", to: "/profile-approvals", icon: ClipboardCheck, permissions: ["employees:manage"] },
      { label: "Onboarding", to: "/onboarding", icon: Rocket, permissions: [] },
      { label: "Daily Reports", to: "/eod", icon: ClipboardList, permissions: ["eod:read"] },
      { label: "Celebrations", to: "/celebrations", icon: PartyPopper, permissions: ["recognition:read"] },
    ],
  },
  {
    title: "Attendance",
    items: [
      { label: "Attendance", to: "/attendance", icon: Clock3, permissions: ["attendance:read"] },
      { label: "Shifts", to: "/shifts", icon: CalendarClock, permissions: ["attendance:manage"] },
      { label: "Leave Management", to: "/leave", icon: CalendarDays, permissions: ["leave:read"] },
    ],
  },
  {
    title: "Payroll",
    items: [
      { label: "Payroll", to: "/payroll", icon: Banknote, permissions: ["payroll:read_all", "payroll:manage"] },
      { label: "Payslips", to: "/payslips", icon: FileText, permissions: ["payroll:read"] },
      { label: "Salary Revisions", to: "/salary-revisions", icon: TrendingUp, permissions: ["payroll:manage", "payroll:read_all"] },
      { label: "Compliance", to: "/compliance", icon: ShieldCheck, permissions: ["compliance:read"] },
    ],
  },
  {
    title: "Recruitment",
    items: [
      { label: "Candidates", to: "/candidates", icon: UserSearch, permissions: ["recruitment:read"] },
      { label: "Jobs", to: "/jobs", icon: Briefcase, permissions: ["recruitment:read"] },
      { label: "Interviews", to: "/interviews", icon: CalendarDays, permissions: ["recruitment:read"] },
    ],
  },
  {
    title: "Workplace",
    items: [
      { label: "Performance", to: "/performance", icon: Gauge, permissions: ["performance:read"] },
      { label: "Assets", to: "/assets", icon: MonitorSmartphone, permissions: ["assets:read"] },
      { label: "Helpdesk", to: "/helpdesk", icon: LifeBuoy, permissions: ["helpdesk:read"] },
      { label: "Expenses", to: "/expenses", icon: Receipt, permissions: ["expense:read"] },
      { label: "Exit Management", to: "/exit", icon: DoorOpen, permissions: ["exit:read"] },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Reports", to: "/reports", icon: BarChart3, permissions: ["analytics:read", "analytics:read_all"] },
      { label: "Sera", to: "/sera", icon: Bot, permissions: ["ai:use"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Roles & Permissions", to: "/roles", icon: ShieldCheck, permissions: ["roles:read", "roles:manage"] },
      { label: "Audit Log", to: "/audit", icon: ClipboardList, permissions: ["audit:read_all"] },
      { label: "Settings", to: "/settings", icon: Settings, permissions: ["settings:manage"] },
    ],
  },
];
