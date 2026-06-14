import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { rbacRouter } from "./modules/rbac/rbac.routes.js";
import { passwordResetRouter } from "./modules/password-reset/passwordReset.routes.js";
import { orgRouter } from "./modules/org/org.routes.js";
import { explorerRouter } from "./modules/org/explorer.routes.js";
import { employeesRouter } from "./modules/employees/employees.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { filesRouter } from "./modules/files/files.routes.js";
import { profileRouter } from "./modules/profile/profile.routes.js";
import { leaveRouter } from "./modules/leave/leave.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { payrollRouter } from "./modules/payroll/payroll.routes.js";
import { recruitmentRouter } from "./modules/recruitment/recruitment.routes.js";
import { onboardingRouter } from "./modules/onboarding/onboarding.routes.js";
import { assetsRouter } from "./modules/assets/assets.routes.js";
import { helpdeskRouter } from "./modules/helpdesk/helpdesk.routes.js";
import { expenseRouter } from "./modules/expense/expense.routes.js";
import { exitRouter } from "./modules/exit/exit.routes.js";
import { complianceRouter } from "./modules/compliance/compliance.routes.js";
import { engagementRouter } from "./modules/engagement/engagement.routes.js";
import { performanceRouter } from "./modules/performance/performance.routes.js";
import { announcementsRouter } from "./modules/announcements/announcements.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { brandingRouter } from "./modules/branding/branding.routes.js";
import { eodRouter } from "./modules/eod/eod.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";
import { apiLimiter } from "./middleware/rateLimit.middleware.js";

/**
 * Central API router. Each bounded module registers its own sub-router here
 * (Phase 1: auth/rbac/org/employees/analytics/notifications/audit ·
 *  Phase 2+: attendance, leave, payroll, recruitment, …).
 */
export const apiRouter: Router = Router();

apiRouter.use(apiLimiter);

apiRouter.get("/", (_req, res) => {
  res.json({
    name: "Somvanshi HRMS API",
    company: "Somvanshi Technologies",
    tagline: "People. Performance. Growth.",
    version: "v1",
    docs: "/api/docs",
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/rbac", rbacRouter);
apiRouter.use("/password-resets", passwordResetRouter);
apiRouter.use("/org", orgRouter);
apiRouter.use("/org/explorer", explorerRouter);
apiRouter.use("/employees", employeesRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/files", filesRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/leave", leaveRouter);
apiRouter.use("/attendance", attendanceRouter);
apiRouter.use("/payroll", payrollRouter);
apiRouter.use("/recruitment", recruitmentRouter);
apiRouter.use("/onboarding", onboardingRouter);
apiRouter.use("/assets", assetsRouter);
apiRouter.use("/helpdesk", helpdeskRouter);
apiRouter.use("/expenses", expenseRouter);
apiRouter.use("/exit", exitRouter);
apiRouter.use("/compliance", complianceRouter);
apiRouter.use("/engagement", engagementRouter);
apiRouter.use("/performance", performanceRouter);
apiRouter.use("/announcements", announcementsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/branding", brandingRouter);
apiRouter.use("/eod", eodRouter);
apiRouter.use("/ai", aiRouter);
