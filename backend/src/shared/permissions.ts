/**
 * Permission catalog — the canonical list of permission codes.
 * Seeded into the `permissions` table; roles map to subsets of these rows.
 * RBAC checks happen against DB-resolved sets (cached), never this file —
 * this file only guarantees the catalog and seed defaults stay in sync.
 */

export const PERMISSIONS = {
  // users & access
  USERS_READ: "users:read",
  USERS_READ_ALL: "users:read_all",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_MANAGE: "users:manage",
  ROLES_READ: "roles:read",
  ROLES_MANAGE: "roles:manage",

  // organization
  ORG_READ: "org:read",
  ORG_MANAGE: "org:manage",

  // employees
  EMPLOYEES_READ: "employees:read",
  EMPLOYEES_READ_ALL: "employees:read_all",
  EMPLOYEES_CREATE: "employees:create",
  EMPLOYEES_UPDATE: "employees:update",
  EMPLOYEES_DELETE: "employees:delete",
  EMPLOYEES_EXPORT: "employees:export",
  EMPLOYEES_MANAGE: "employees:manage",

  // recruitment
  RECRUITMENT_READ: "recruitment:read",
  RECRUITMENT_CREATE: "recruitment:create",
  RECRUITMENT_UPDATE: "recruitment:update",
  RECRUITMENT_APPROVE: "recruitment:approve",
  RECRUITMENT_MANAGE: "recruitment:manage",

  // onboarding
  ONBOARDING_READ: "onboarding:read",
  ONBOARDING_CREATE: "onboarding:create",
  ONBOARDING_UPDATE: "onboarding:update",
  ONBOARDING_MANAGE: "onboarding:manage",

  // attendance
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_READ_ALL: "attendance:read_all",
  ATTENDANCE_CREATE: "attendance:create",
  ATTENDANCE_UPDATE: "attendance:update",
  ATTENDANCE_APPROVE: "attendance:approve",
  ATTENDANCE_EXPORT: "attendance:export",
  ATTENDANCE_MANAGE: "attendance:manage",

  // leave
  LEAVE_READ: "leave:read",
  LEAVE_READ_ALL: "leave:read_all",
  LEAVE_CREATE: "leave:create",
  LEAVE_APPROVE: "leave:approve",
  LEAVE_MANAGE: "leave:manage",

  // payroll
  PAYROLL_READ: "payroll:read",
  PAYROLL_READ_ALL: "payroll:read_all",
  PAYROLL_RUN: "payroll:run",
  PAYROLL_APPROVE: "payroll:approve",
  PAYROLL_EXPORT: "payroll:export",
  PAYROLL_MANAGE: "payroll:manage",

  // performance
  PERFORMANCE_READ: "performance:read",
  PERFORMANCE_READ_ALL: "performance:read_all",
  PERFORMANCE_CREATE: "performance:create",
  PERFORMANCE_UPDATE: "performance:update",
  PERFORMANCE_APPROVE: "performance:approve",
  PERFORMANCE_MANAGE: "performance:manage",

  // assets
  ASSETS_READ: "assets:read",
  ASSETS_READ_ALL: "assets:read_all",
  ASSETS_ASSIGN: "assets:assign",
  ASSETS_MANAGE: "assets:manage",

  // helpdesk
  HELPDESK_READ: "helpdesk:read",
  HELPDESK_CREATE: "helpdesk:create",
  HELPDESK_UPDATE: "helpdesk:update",
  HELPDESK_ASSIGN: "helpdesk:assign",
  HELPDESK_MANAGE: "helpdesk:manage",

  // expense
  EXPENSE_READ: "expense:read",
  EXPENSE_READ_ALL: "expense:read_all",
  EXPENSE_CREATE: "expense:create",
  EXPENSE_APPROVE: "expense:approve",
  EXPENSE_MANAGE: "expense:manage",

  // exit
  EXIT_READ: "exit:read",
  EXIT_READ_ALL: "exit:read_all",
  EXIT_CREATE: "exit:create",
  EXIT_APPROVE: "exit:approve",
  EXIT_MANAGE: "exit:manage",

  // compliance & statutory
  COMPLIANCE_READ: "compliance:read",
  COMPLIANCE_UPDATE: "compliance:update",
  COMPLIANCE_READ_ALL: "compliance:read_all",
  COMPLIANCE_MANAGE: "compliance:manage",

  // analytics
  ANALYTICS_READ: "analytics:read",
  ANALYTICS_READ_ALL: "analytics:read_all",

  // engagement (recognition wall)
  RECOGNITION_READ: "recognition:read",
  RECOGNITION_CREATE: "recognition:create",
  RECOGNITION_MANAGE: "recognition:manage",

  // announcements & company feed
  ANNOUNCEMENT_READ: "announcement:read",
  ANNOUNCEMENT_MANAGE: "announcement:manage",

  // EOD daily reporting
  EOD_READ: "eod:read",
  EOD_CREATE: "eod:create",
  EOD_READ_ALL: "eod:read_all",
  EOD_REVIEW: "eod:review",

  // platform
  NOTIFICATIONS_READ: "notifications:read",
  AI_USE: "ai:use",
  AI_MANAGE: "ai:manage",
  AUDIT_READ_ALL: "audit:read_all",
  SETTINGS_MANAGE: "settings:manage",
  // Mint a short-lived token scoped to another employee (admin impersonation /
  // token-exchange) — e.g. a service account acting on a chat user's behalf.
  AUTH_IMPERSONATE: "auth:impersonate",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  CEO: "CEO",
  HR_ADMIN: "HR_ADMIN",
  HR_EXECUTIVE: "HR_EXECUTIVE",
  RECRUITER: "RECRUITER",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  DEPARTMENT_HEAD: "DEPARTMENT_HEAD",
  MANAGER: "MANAGER",
  TEAM_LEAD: "TEAM_LEAD",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

const P = PERMISSIONS;

/** Baseline every authenticated employee gets (self-service). */
const SELF_SERVICE: PermissionCode[] = [
  P.EMPLOYEES_READ,
  P.ATTENDANCE_READ,
  P.ATTENDANCE_CREATE,
  P.LEAVE_READ,
  P.LEAVE_CREATE,
  P.PAYROLL_READ,
  P.PERFORMANCE_READ,
  P.PERFORMANCE_CREATE,
  P.PERFORMANCE_UPDATE,
  P.ASSETS_READ,
  P.HELPDESK_READ,
  P.HELPDESK_CREATE,
  P.EXPENSE_READ,
  P.EXPENSE_CREATE,
  P.EXIT_READ,
  P.EXIT_CREATE,
  P.COMPLIANCE_READ,
  P.COMPLIANCE_UPDATE,
  P.RECOGNITION_READ,
  P.RECOGNITION_CREATE,
  P.ANNOUNCEMENT_READ,
  P.EOD_READ,
  P.EOD_CREATE,
  P.NOTIFICATIONS_READ,
  P.AI_USE,
  P.ORG_READ,
];

const PEOPLE_LEAD_EXTRAS: PermissionCode[] = [
  P.EMPLOYEES_READ_ALL, // row-scoped to reporting line by service layer
  P.ATTENDANCE_READ_ALL,
  P.ATTENDANCE_APPROVE,
  P.LEAVE_READ_ALL,
  P.LEAVE_APPROVE,
  P.PERFORMANCE_READ_ALL,
  P.PERFORMANCE_APPROVE,
  P.ANALYTICS_READ,
];

/** Seed defaults — Super Admin can re-wire at runtime via Role Management. */
export const ROLE_PERMISSION_MATRIX: Record<RoleName, PermissionCode[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  // Leadership: org-wide visibility + final approvals + company comms + audit.
  // NOT platform admin (no roles/users/settings) and NOT HR operations (can't edit
  // employees, run payroll, or manage recruitment — they observe & approve).
  CEO: [
    ...SELF_SERVICE,
    P.EMPLOYEES_READ_ALL,
    P.EMPLOYEES_EXPORT,
    P.ATTENDANCE_READ_ALL,
    P.LEAVE_READ_ALL,
    P.LEAVE_APPROVE,
    P.PAYROLL_READ_ALL,
    P.RECRUITMENT_READ,
    P.RECRUITMENT_APPROVE,
    P.ONBOARDING_READ,
    P.PERFORMANCE_READ_ALL,
    P.PERFORMANCE_APPROVE,
    P.ASSETS_READ_ALL,
    P.HELPDESK_UPDATE,
    P.EXPENSE_READ_ALL,
    P.EXPENSE_APPROVE,
    P.EXIT_READ_ALL,
    P.EXIT_APPROVE,
    P.COMPLIANCE_READ_ALL,
    P.EOD_READ_ALL,
    P.RECOGNITION_MANAGE,
    P.ANNOUNCEMENT_MANAGE,
    P.ANALYTICS_READ,
    P.ANALYTICS_READ_ALL,
    P.AUDIT_READ_ALL,
  ],

  HR_ADMIN: [
    ...SELF_SERVICE,
    ...PEOPLE_LEAD_EXTRAS,
    P.USERS_READ,
    P.USERS_READ_ALL,
    P.USERS_CREATE,
    P.USERS_UPDATE,
    P.ROLES_READ,
    P.ORG_MANAGE,
    P.EMPLOYEES_CREATE,
    P.EMPLOYEES_UPDATE,
    P.EMPLOYEES_DELETE,
    P.EMPLOYEES_EXPORT,
    P.EMPLOYEES_MANAGE,
    P.RECRUITMENT_READ,
    P.RECRUITMENT_CREATE,
    P.RECRUITMENT_UPDATE,
    P.RECRUITMENT_APPROVE,
    P.RECRUITMENT_MANAGE,
    P.ONBOARDING_READ,
    P.ONBOARDING_CREATE,
    P.ONBOARDING_UPDATE,
    P.ONBOARDING_MANAGE,
    P.ATTENDANCE_EXPORT,
    P.ATTENDANCE_MANAGE,
    P.LEAVE_MANAGE,
    P.PAYROLL_READ_ALL,
    P.PAYROLL_RUN,
    P.PAYROLL_EXPORT,
    P.PAYROLL_MANAGE,
    P.PERFORMANCE_MANAGE,
    P.ASSETS_READ_ALL,
    P.ASSETS_ASSIGN,
    P.ASSETS_MANAGE,
    P.HELPDESK_UPDATE,
    P.HELPDESK_ASSIGN,
    P.HELPDESK_MANAGE,
    P.EXIT_READ_ALL,
    P.EXIT_APPROVE,
    P.EXIT_MANAGE,
    P.COMPLIANCE_READ_ALL,
    P.COMPLIANCE_MANAGE,
    P.RECOGNITION_MANAGE,
    P.ANNOUNCEMENT_MANAGE,
    P.ANALYTICS_READ_ALL,
    P.AI_MANAGE,
    P.AUDIT_READ_ALL,
    P.AUTH_IMPERSONATE, // act on an employee's behalf (e.g. self-service chatbot)
  ],

  HR_EXECUTIVE: [
    ...SELF_SERVICE,
    P.USERS_READ,
    P.EMPLOYEES_READ_ALL,
    P.EMPLOYEES_CREATE,
    P.EMPLOYEES_UPDATE,
    P.ONBOARDING_READ,
    P.ONBOARDING_CREATE,
    P.ONBOARDING_UPDATE,
    P.ONBOARDING_MANAGE,
    P.ATTENDANCE_READ_ALL,
    P.ATTENDANCE_APPROVE,
    P.ATTENDANCE_MANAGE,
    P.LEAVE_READ_ALL,
    P.LEAVE_APPROVE,
    P.ASSETS_READ_ALL,
    P.ASSETS_ASSIGN,
    P.HELPDESK_UPDATE,
    P.HELPDESK_ASSIGN,
    P.EXIT_READ_ALL,
    P.ANALYTICS_READ,
  ],

  RECRUITER: [
    ...SELF_SERVICE,
    P.EMPLOYEES_READ_ALL,
    P.RECRUITMENT_READ,
    P.RECRUITMENT_CREATE,
    P.RECRUITMENT_UPDATE,
    P.RECRUITMENT_MANAGE,
    P.ANALYTICS_READ,
  ],

  FINANCE_MANAGER: [
    ...SELF_SERVICE,
    P.EMPLOYEES_READ_ALL,
    P.PAYROLL_READ_ALL,
    P.PAYROLL_RUN,
    P.PAYROLL_APPROVE,
    P.PAYROLL_EXPORT,
    P.PAYROLL_MANAGE,
    P.EXPENSE_READ_ALL,
    P.EXPENSE_APPROVE,
    P.EXPENSE_MANAGE,
    P.EXIT_READ_ALL,
    P.EXIT_APPROVE,
    P.COMPLIANCE_READ_ALL,
    P.COMPLIANCE_MANAGE,
    P.ANALYTICS_READ,
    P.ANALYTICS_READ_ALL,
  ],

  DEPARTMENT_HEAD: [
    ...SELF_SERVICE,
    ...PEOPLE_LEAD_EXTRAS,
    P.RECRUITMENT_READ,
    P.RECRUITMENT_CREATE,
    P.RECRUITMENT_APPROVE,
    P.EXPENSE_APPROVE,
    P.EXIT_APPROVE,
    P.ANALYTICS_READ_ALL,
  ],

  MANAGER: [
    ...SELF_SERVICE,
    ...PEOPLE_LEAD_EXTRAS,
    P.RECRUITMENT_READ,
    P.EXPENSE_APPROVE,
    P.EXIT_APPROVE,
  ],

  TEAM_LEAD: [...SELF_SERVICE, ...PEOPLE_LEAD_EXTRAS],

  EMPLOYEE: SELF_SERVICE,
};

export const ROLE_DISPLAY: Record<RoleName, { displayName: string; description: string }> = {
  SUPER_ADMIN: { displayName: "Super Admin", description: "Full platform control including settings, roles and audit" },
  CEO: { displayName: "CEO", description: "Executive: org-wide analytics, people overview and final approvals — no platform administration" },
  HR_ADMIN: { displayName: "HR Admin", description: "Administers all HR modules org-wide" },
  HR_EXECUTIVE: { displayName: "HR Executive", description: "Day-to-day HR operations: employees, attendance, leave, onboarding" },
  RECRUITER: { displayName: "Recruiter", description: "Owns the recruitment pipeline and candidate management" },
  FINANCE_MANAGER: { displayName: "Finance Manager", description: "Payroll processing, approvals and expense management" },
  DEPARTMENT_HEAD: { displayName: "Department Head", description: "Leads a department: approvals, hiring and analytics for their org" },
  MANAGER: { displayName: "Manager", description: "Manages a team: approvals and team analytics" },
  TEAM_LEAD: { displayName: "Team Lead", description: "First-line approvals for a small team" },
  EMPLOYEE: { displayName: "Employee", description: "Self-service access to own HR data" },
};
