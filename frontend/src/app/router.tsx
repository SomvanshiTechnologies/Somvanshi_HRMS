import { createBrowserRouter } from "react-router-dom";
import { AppLayout, RequirePermission } from "./layout/AppLayout";
import { ErrorPage } from "./ErrorPage";
import { MyProfilePage } from "@/features/profile/MyProfilePage";
import { ProfileApprovalsPage } from "@/features/profile/ProfileApprovalsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { SecurityPage } from "@/features/auth/SecurityPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { EmployeeListPage } from "@/features/employees/EmployeeListPage";
import { EmployeeDetailPage } from "@/features/employees/EmployeeDetailPage";
import { EmployeeFormPage } from "@/features/employees/EmployeeFormPage";
import { OrgChartPage } from "@/features/employees/OrgChartPage";
import { AttendancePage } from "@/features/attendance/AttendancePage";
import { ShiftsPage } from "@/features/attendance/ShiftsPage";
import { LeavePage } from "@/features/leave/LeavePage";
import { PayrollPage } from "@/features/payroll/PayrollPage";
import { PayslipsPage } from "@/features/payroll/PayslipsPage";
import { RevisionsPage } from "@/features/payroll/RevisionsPage";
import { JobsPage } from "@/features/recruitment/JobsPage";
import { CandidatesPage } from "@/features/recruitment/CandidatesPage";
import { InterviewsPage } from "@/features/recruitment/InterviewsPage";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { AssetsPage } from "@/features/assets/AssetsPage";
import { HelpdeskPage } from "@/features/helpdesk/HelpdeskPage";
import { ExpensePage } from "@/features/expense/ExpensePage";
import { ExitPage } from "@/features/exit/ExitPage";
import { CompliancePage } from "@/features/compliance/CompliancePage";
import { EventsPage } from "@/features/engagement/EventsPage";
import { PerformancePage } from "@/features/performance/PerformancePage";
import { FeedPage } from "@/features/feed/FeedPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { EodPage } from "@/features/eod/EodPage";
import { SomAIPage } from "@/features/somai/SomAIPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { OrganizationPage } from "@/features/org/OrganizationPage";
import { RolesPage } from "@/features/rbac/RolesPage";
import { AuditPage } from "@/features/audit/AuditPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "profile", element: <MyProfilePage /> },
      {
        path: "profile-approvals",
        element: (
          <RequirePermission anyOf={["employees:manage"]}>
            <ProfileApprovalsPage />
          </RequirePermission>
        ),
      },
      {
        path: "employees",
        children: [
          {
            index: true,
            element: (
              <RequirePermission anyOf={["employees:read_all"]}>
                <EmployeeListPage />
              </RequirePermission>
            ),
          },
          {
            path: "new",
            element: (
              <RequirePermission anyOf={["employees:create"]}>
                <EmployeeFormPage />
              </RequirePermission>
            ),
          },
          { path: ":id", element: <EmployeeDetailPage /> },
          {
            path: ":id/edit",
            element: (
              <RequirePermission anyOf={["employees:update", "employees:manage"]}>
                <EmployeeFormPage />
              </RequirePermission>
            ),
          },
        ],
      },
      { path: "org-chart", element: <OrgChartPage /> },
      {
        path: "organization",
        element: (
          <RequirePermission anyOf={["org:manage"]}>
            <OrganizationPage />
          </RequirePermission>
        ),
      },
      {
        path: "roles",
        element: (
          <RequirePermission anyOf={["roles:read", "roles:manage"]}>
            <RolesPage />
          </RequirePermission>
        ),
      },
      {
        path: "audit",
        element: (
          <RequirePermission anyOf={["audit:read_all"]}>
            <AuditPage />
          </RequirePermission>
        ),
      },
      { path: "security", element: <SecurityPage /> },

      { path: "attendance", element: <AttendancePage /> },
      {
        path: "shifts",
        element: (
          <RequirePermission anyOf={["attendance:manage"]}>
            <ShiftsPage />
          </RequirePermission>
        ),
      },
      { path: "leave", element: <LeavePage /> },
      { path: "leave/approvals", element: <LeavePage /> },

      // upcoming modules — branded placeholders until their phase ships
      {
        path: "payroll",
        element: (
          <RequirePermission anyOf={["payroll:read_all", "payroll:manage"]}>
            <PayrollPage />
          </RequirePermission>
        ),
      },
      { path: "payslips", element: <PayslipsPage /> },
      { path: "salary-revisions", element: <RevisionsPage /> },
      {
        path: "candidates",
        element: (
          <RequirePermission anyOf={["recruitment:read"]}>
            <CandidatesPage />
          </RequirePermission>
        ),
      },
      {
        path: "jobs",
        element: (
          <RequirePermission anyOf={["recruitment:read"]}>
            <JobsPage />
          </RequirePermission>
        ),
      },
      {
        path: "interviews",
        element: (
          <RequirePermission anyOf={["recruitment:read"]}>
            <InterviewsPage />
          </RequirePermission>
        ),
      },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "helpdesk", element: <HelpdeskPage /> },
      { path: "expenses", element: <ExpensePage /> },
      { path: "exit", element: <ExitPage /> },
      { path: "compliance", element: <CompliancePage /> },
      { path: "celebrations", element: <EventsPage /> },
      { path: "feed", element: <FeedPage /> },
      { path: "eod", element: <EodPage /> },
      {
        path: "reports",
        element: (
          <RequirePermission anyOf={["analytics:read", "analytics:read_all"]}>
            <ReportsPage />
          </RequirePermission>
        ),
      },
      {
        path: "sera",
        element: (
          <RequirePermission anyOf={["ai:use"]}>
            <SomAIPage />
          </RequirePermission>
        ),
      },
      {
        path: "settings",
        element: (
          <RequirePermission anyOf={["settings:manage"]}>
            <SettingsPage />
          </RequirePermission>
        ),
      },
    ],
  },
  { path: "*", element: <ErrorPage /> },
]);
