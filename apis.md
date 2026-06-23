# Somvanshi HRMS — API Reference

> **Base URL:** `/api/v1`
> All endpoints except Auth (login/register/reset) require a valid `Authorization: Bearer <token>` header.

---

## Auth

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/auth/login` | Public | Login with email + password |
| POST | `/auth/login/2fa` | Public | Complete login with 2FA code |
| POST | `/auth/refresh` | Public | Refresh access token using refresh token |
| POST | `/auth/forgot-password` | Public | Send password reset link to email |
| POST | `/auth/reset-password` | Public | Reset password using token from email |
| POST | `/auth/logout` | Authenticated | Logout and invalidate session |
| GET | `/auth/me` | Authenticated | Get current user profile + permissions |
| POST | `/auth/change-password` | Authenticated | Change own password (requires current password) |
| POST | `/auth/2fa/setup` | Authenticated | Generate 2FA secret + QR code |
| POST | `/auth/2fa/verify` | Authenticated | Verify and enable 2FA |
| DELETE | `/auth/2fa` | Authenticated | Disable 2FA (requires verification code) |
| GET | `/auth/sessions` | Authenticated | List active sessions |
| DELETE | `/auth/sessions/:id` | Authenticated | Revoke a specific session |
| GET | `/auth/devices` | Authenticated | List known devices |

---

## RBAC (Roles & Permissions)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/rbac/roles` | `roles:read` | List all roles with their permissions |
| GET | `/rbac/permissions` | `roles:read` | List all permission codes |
| GET | `/rbac/users` | `roles:manage` | List users with their assigned roles |
| POST | `/rbac/roles` | `roles:manage` | Create a new role |
| POST | `/rbac/roles/:id/clone` | `roles:manage` | Clone an existing role |
| PATCH | `/rbac/roles/:id` | `roles:manage` | Update role name/description |
| DELETE | `/rbac/roles/:id` | `roles:manage` | Delete a role |
| PUT | `/rbac/roles/:id/permissions` | `roles:manage` | Set permissions for a role |
| PUT | `/rbac/users/:id/roles` | `roles:manage` | Assign roles to a user |

---

## Password Resets (Admin)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/password-resets/:userId` | `users:manage` | Admin-initiated password reset for a user |
| GET | `/password-resets` | `users:manage` | List all password reset requests |
| GET | `/password-resets/:id` | `users:manage` | Get a specific reset request |
| POST | `/password-resets/:id/approve` | `users:manage` | Approve a password reset |
| POST | `/password-resets/:id/reject` | `users:manage` | Reject a password reset |

---

## Organization

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/org/company` | `org:read` | Get company profile |
| PUT | `/org/company` | `org:manage` | Update company profile |
| GET | `/org/locations` | `org:read` | List all locations |
| POST | `/org/locations` | `org:manage` | Create a location |
| PATCH | `/org/locations/:id` | `org:manage` | Update a location |
| DELETE | `/org/locations/:id` | `org:manage` | Delete a location |
| GET | `/org/departments` | `org:read` | List all departments |
| POST | `/org/departments` | `org:manage` | Create a department |
| PATCH | `/org/departments/:id` | `org:manage` | Update a department |
| DELETE | `/org/departments/:id` | `org:manage` | Delete a department |
| GET | `/org/designations` | `org:read` | List all designations |
| POST | `/org/designations` | `org:manage` | Create a designation |
| PATCH | `/org/designations/:id` | `org:manage` | Update a designation |
| DELETE | `/org/designations/:id` | `org:manage` | Delete a designation |
| GET | `/org/bands` | `org:read` | List all salary bands |
| POST | `/org/bands` | `org:manage` | Create a salary band |

---

## Org Explorer

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/org/explorer/overview` | `org:read` | Org-wide department overview with headcounts |
| GET | `/org/explorer/department/:id` | `org:read` | Department detail: members, breakdown, managers |
| GET | `/org/explorer/manager/:id` | `org:read` | Manager view: direct reports, nested counts |

---

## Employees

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/employees` | `employees:read_all` | List employees (paginated, filterable) |
| GET | `/employees/search` | `employees:read_all` | Search employees by name/code |
| GET | `/employees/export` | `employees:export` | Export employees as CSV |
| POST | `/employees` | `employees:create` | Create a new employee + login account |
| GET | `/employees/:id` | `employees:read` | Get employee detail |
| PATCH | `/employees/:id` | `employees:update` | Update employee fields |
| DELETE | `/employees/:id` | `employees:delete` | Soft-delete an employee |
| POST | `/employees/:id/reset-password` | `users:manage` | Admin reset password for an employee |
| POST | `/employees/:id/photo` | Self or privileged | Upload employee photo |
| GET | `/employees/:id/timeline` | `employees:read` | Employee activity timeline |
| POST | `/employees/:id/educations` | Self or privileged | Add education record |
| PATCH | `/employees/:id/educations/:itemId` | Self or privileged | Update education record |
| DELETE | `/employees/:id/educations/:itemId` | Self or privileged | Delete education record |
| POST | `/employees/:id/experiences` | Self or privileged | Add work experience |
| PATCH | `/employees/:id/experiences/:itemId` | Self or privileged | Update work experience |
| DELETE | `/employees/:id/experiences/:itemId` | Self or privileged | Delete work experience |
| POST | `/employees/:id/certifications` | Self or privileged | Add certification |
| DELETE | `/employees/:id/certifications/:itemId` | Self or privileged | Delete certification |
| PUT | `/employees/:id/skills` | Self or privileged | Set/update a skill |
| DELETE | `/employees/:id/skills/:skillId` | Self or privileged | Remove a skill |
| POST | `/employees/:id/bank-details` | Self or privileged | Add bank account |
| PUT | `/employees/:id/bank-details/:itemId` | Self or privileged | Update bank account |
| DELETE | `/employees/:id/bank-details/:itemId` | Self or privileged | Delete bank account |
| POST | `/employees/:id/emergency-contacts` | Self or privileged | Add emergency contact |
| DELETE | `/employees/:id/emergency-contacts/:itemId` | Self or privileged | Delete emergency contact |

---

## Attendance

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/attendance/today` | `attendance:read` | Today's punch state for the caller |
| POST | `/attendance/check-in` | `attendance:create` | Check in (with optional GPS) |
| POST | `/attendance/check-out` | `attendance:create` | Check out |
| POST | `/attendance/breaks/start` | `attendance:create` | Start a break |
| POST | `/attendance/breaks/end` | `attendance:create` | End active break |
| GET | `/attendance/me` | `attendance:read` | My month calendar + summary. Query: `month`, `year` |
| POST | `/attendance/corrections` | `attendance:create` | Request attendance correction |
| GET | `/attendance/corrections/me` | `attendance:read` | My correction requests |
| GET | `/attendance/corrections/pending` | `attendance:approve` | Pending corrections to approve |
| PATCH | `/attendance/corrections/:id/approve` | `attendance:approve` | Approve a correction |
| PATCH | `/attendance/corrections/:id/reject` | `attendance:approve` | Reject a correction |
| GET | `/attendance/day` | `attendance:read_all` | Day roster for team/org. Query: `date`, `departmentId` |
| GET | `/attendance/employee/:id` | `attendance:read_all` | Month calendar for a specific employee |
| POST | `/attendance/manual` | `attendance:manage` | Admin: mark attendance directly (no approval) |
| POST | `/attendance/manual/bulk` | `attendance:manage` | Admin: bulk mark status for multiple employees |
| GET | `/attendance/report` | `attendance:read_all` | Monthly or yearly attendance report. Query: `year`, `month?`, `departmentId?` |
| GET | `/attendance/export` | `attendance:export` | Download attendance CSV. Query: `year`, `month?`, `departmentId?` |
| GET | `/attendance/shifts` | `attendance:read` | List all shifts |
| POST | `/attendance/shifts` | `attendance:manage` | Create a shift |
| POST | `/attendance/shifts/assign` | `attendance:manage` | Assign shift to employee |

---

## Leave

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/leave/types` | `leave:read` | List active leave types |
| GET | `/leave/admin/types` | `leave:manage` | List all leave types (including inactive) |
| POST | `/leave/admin/types` | `leave:manage` | Create a leave type |
| PUT | `/leave/admin/types/:id` | `leave:manage` | Update a leave type |
| POST | `/leave/admin/policies` | `leave:manage` | Create a leave policy |
| PUT | `/leave/admin/policies/:id` | `leave:manage` | Update a leave policy |
| DELETE | `/leave/admin/policies/:id` | `leave:manage` | Delete a leave policy |
| GET | `/leave/balances/me` | `leave:read` | My leave balances. Query: `year?` |
| POST | `/leave/requests` | `leave:create` | Apply for leave |
| GET | `/leave/requests/me` | `leave:read` | My leave requests. Query: `year?` |
| PUT | `/leave/requests/:id` | `leave:create` | Edit a pending leave request |
| DELETE | `/leave/requests/:id` | `leave:create` | Cancel a leave request |
| GET | `/leave/approvals` | `leave:approve` | Pending requests for approver |
| PATCH | `/leave/requests/:id/approve` | `leave:approve` | Approve a leave request |
| PATCH | `/leave/requests/:id/reject` | `leave:approve` | Reject a leave request |
| PATCH | `/leave/requests/:id/request-info` | `leave:approve` | Request clarification from employee |
| POST | `/leave/requests/bulk-approve` | `leave:approve` | Bulk approve multiple requests |
| GET | `/leave/calendar` | `leave:read` | Team/org leave calendar. Query: `month`, `year`, `scope` |
| GET | `/leave/holidays` | Authenticated | List holidays. Query: `year` |
| POST | `/leave/holidays` | `leave:manage` | Add a holiday |
| DELETE | `/leave/holidays/:id` | `leave:manage` | Remove a holiday |
| GET | `/leave/workflow` | `leave:approve` | Get approval workflow config |
| PUT | `/leave/workflow` | `leave:manage` | Set approval workflow steps |

---

## Payroll

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/payroll/components` | `payroll:manage` | List salary components |
| POST | `/payroll/components` | `payroll:manage` | Create a salary component |
| PUT | `/payroll/components/:id` | `payroll:manage` | Update a salary component |
| GET | `/payroll/structures` | `payroll:read_all` | List salary structures |
| POST | `/payroll/structures` | `payroll:manage` | Create a salary structure |
| PUT | `/payroll/structures/:id` | `payroll:manage` | Update a salary structure |
| GET | `/payroll/statutory-config` | `payroll:manage` | Get PF/ESI/PT/TDS configuration |
| PUT | `/payroll/statutory-config` | `payroll:manage` | Update statutory configuration |
| GET | `/payroll/employees` | `payroll:read_all` | List employees with salary details |
| PUT | `/payroll/employees/:id/salary` | `payroll:manage` | Set/update employee salary |
| GET | `/payroll/revisions` | `payroll:read` | Salary revision history |
| GET | `/payroll/runs` | `payroll:read_all` | List payroll runs |
| GET | `/payroll/runs/:id` | `payroll:read_all` | Get a payroll run with payslips |
| POST | `/payroll/runs` | `payroll:run` | Process payroll for a month/year |
| PATCH | `/payroll/runs/:id/approve` | `payroll:approve` | Approve a payroll run |
| PATCH | `/payroll/runs/:id/mark-paid` | `payroll:approve` | Mark payroll run as paid |
| GET | `/payroll/runs/:id/register` | `payroll:export` | Download salary register CSV |
| POST | `/payroll/payslips/import-single` | `payroll:manage` | Import a single payslip PDF |
| POST | `/payroll/payslips/manual` | `payroll:manage` | Create a manual/historical payslip |
| GET | `/payroll/payslips/me` | `payroll:read` | My payslips |
| GET | `/payroll/payslips/:id` | `payroll:read` | Get payslip detail |
| PATCH | `/payroll/payslips/:id` | `payroll:manage` | Edit a payslip (amounts, lines, payment info) |
| POST | `/payroll/payslips/:id/email` | `payroll:read` | Email payslip to employee |
| GET | `/payroll/payslips/:id/pdf` | `payroll:read` | Download payslip PDF |

---

## Recruitment

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/recruitment/requisitions` | `recruitment:read` | List job requisitions |
| POST | `/recruitment/requisitions` | `recruitment:create` | Create a requisition |
| PATCH | `/recruitment/requisitions/:id/approve` | `recruitment:approve` | Approve requisition |
| PATCH | `/recruitment/requisitions/:id/reject` | `recruitment:approve` | Reject requisition |
| POST | `/recruitment/requisitions/:id/postings` | `recruitment:create` | Publish a job posting |
| GET | `/recruitment/postings` | `recruitment:read` | List job postings |
| GET | `/recruitment/pipeline` | `recruitment:read` | ATS pipeline view. Query: `postingId?` |
| POST | `/recruitment/candidates` | `recruitment:create` | Create a candidate |
| POST | `/recruitment/candidates/apply` | `recruitment:create` | Apply candidate to a posting |
| POST | `/recruitment/candidates/:id/resume` | `recruitment:create` | Upload candidate resume |
| POST | `/recruitment/applications/:id/move` | `recruitment:update` | Move application to next stage |
| PATCH | `/recruitment/applications/:id/stage` | `recruitment:update` | Set application stage |
| GET | `/recruitment/interviews` | `recruitment:read` | List interviews |
| POST | `/recruitment/interviews` | `recruitment:create` | Schedule an interview |
| POST | `/recruitment/interviews/:id/feedback` | `recruitment:read` | Submit interview feedback |
| POST | `/recruitment/offers` | `recruitment:manage` | Create an offer |
| PATCH | `/recruitment/offers/:id/decision` | `recruitment:manage` | Accept/withdraw offer |

---

## Onboarding

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/onboarding` | `onboarding:read` | List onboarding checklists |
| GET | `/onboarding/:id` | `onboarding:read` | Get checklist detail |
| POST | `/onboarding` | `onboarding:create` | Create onboarding checklist for employee |
| PATCH | `/onboarding/:id/tasks/:taskId` | `onboarding:update` | Update task status |
| POST | `/onboarding/templates` | `onboarding:manage` | Create/update onboarding template |

---

## Assets

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/assets/summary` | `assets:read_all` | Asset inventory summary |
| GET | `/assets` | `assets:read_all` | List all assets |
| GET | `/assets/me` | `assets:read` | My assigned assets |
| POST | `/assets` | `assets:manage` | Create an asset |
| GET | `/assets/:id` | `assets:read_all` | Get asset detail |
| POST | `/assets/:id/assign` | `assets:assign` | Assign asset to employee |
| POST | `/assets/:id/return` | `assets:assign` | Return an asset |
| POST | `/assets/:id/maintenance` | `assets:manage` | Log maintenance record |
| PATCH | `/assets/:id/maintenance/:mid/complete` | `assets:manage` | Mark maintenance complete |

---

## Helpdesk

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/helpdesk/categories` | Authenticated | List ticket categories |
| GET | `/helpdesk/summary` | `helpdesk:assign` | Helpdesk dashboard summary |
| GET | `/helpdesk/tickets` | Authenticated | List tickets (own or all based on role) |
| GET | `/helpdesk/tickets/:id` | Authenticated | Get ticket detail |
| POST | `/helpdesk/tickets` | `helpdesk:create` | Create a support ticket |
| POST | `/helpdesk/tickets/:id/comments` | Authenticated | Add comment to ticket |
| PATCH | `/helpdesk/tickets/:id/assign` | `helpdesk:assign` | Assign ticket to agent |
| PATCH | `/helpdesk/tickets/:id/status` | Authenticated | Update ticket status |

---

## Expenses

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/expenses/categories` | Authenticated | List expense categories |
| POST | `/expenses/categories` | `expense:manage` | Create expense category |
| GET | `/expenses/summary` | `expense:approve` | Expense approval summary |
| GET | `/expenses` | Authenticated | List expense reports |
| GET | `/expenses/:id` | Authenticated | Get expense report detail |
| POST | `/expenses` | `expense:create` | Create an expense report |
| PATCH | `/expenses/:id` | Self | Update expense report |
| POST | `/expenses/:id/items` | Self | Add line item |
| DELETE | `/expenses/:id/items/:itemId` | Self | Remove line item |
| POST | `/expenses/:id/submit` | Self | Submit for approval |
| PATCH | `/expenses/:id/decide` | `expense:approve` | Approve or reject |
| POST | `/expenses/:id/reimburse` | `expense:manage` | Mark as reimbursed |

---

## Exit Management

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/exit/summary` | `exit:approve` | Exit pipeline summary |
| GET | `/exit` | Authenticated | List exit requests |
| GET | `/exit/:id` | Authenticated | Get exit detail |
| POST | `/exit` | `exit:create` | Submit resignation |
| POST | `/exit/:id/retract` | Self | Retract resignation |
| PATCH | `/exit/:id/accept` | `exit:approve` | Accept resignation + set last working day |
| POST | `/exit/:id/clearance` | `exit:manage` | Add clearance checklist item |
| PATCH | `/exit/:id/clearance/:itemId` | `exit:approve` | Complete/waive clearance item |
| POST | `/exit/:id/interview` | `exit:approve` | Record exit interview |
| POST | `/exit/:id/fnf/calculate` | `exit:manage` | Calculate full & final settlement |
| PATCH | `/exit/:id/fnf` | `exit:approve` | Approve/reject FnF |
| GET | `/exit/:id/documents/:type` | Authenticated | Download exit documents (experience/relieving letter) |
| POST | `/exit/:id/documents/:type/email` | `exit:approve` | Email exit documents |

---

## Compliance

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/compliance/me` | `compliance:read` | My statutory details (PAN, Aadhaar, etc.) |
| PUT | `/compliance/me` | `compliance:update` | Update my statutory details |
| GET | `/compliance` | `compliance:read_all` | List all employee statutory records |
| PUT | `/compliance/employee/:id` | `compliance:manage` | Update/verify employee statutory details |
| GET | `/compliance/reports` | `compliance:read_all` | Generate compliance reports (PF/ESI/PT) |
| GET | `/compliance/tasks` | `compliance:read_all` | List compliance tasks |
| POST | `/compliance/tasks` | `compliance:manage` | Create a compliance task |
| PATCH | `/compliance/tasks/:id` | `compliance:manage` | Update compliance task |
| DELETE | `/compliance/tasks/:id` | `compliance:manage` | Delete compliance task |
| POST | `/compliance/tasks/generate` | `compliance:manage` | Auto-generate compliance tasks |
| GET | `/compliance/document-expiry` | `compliance:read_all` | Documents expiring soon |
| GET | `/compliance/summary` | `compliance:read_all` | Compliance dashboard summary |

---

## Engagement (Recognition Wall)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/engagement/recognition` | `recognition:read` | Recognition feed |
| GET | `/engagement/recognition/leaderboard` | `recognition:read` | Recognition leaderboard |
| GET | `/engagement/recognition/wall/:employeeId` | `recognition:read` | Employee's recognition wall |
| POST | `/engagement/recognition` | `recognition:create` | Give recognition to a colleague |
| POST | `/engagement/recognition/:id/cheer` | `recognition:read` | Cheer/react to a recognition |
| DELETE | `/engagement/recognition/:id` | `recognition:read` | Delete own recognition |
| GET | `/engagement/new-joiners` | Authenticated | Recent new joiners. Query: `days?` |

---

## Performance

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/performance/cycles` | `performance:read` | List appraisal cycles |
| POST | `/performance/cycles` | `performance:manage` | Create an appraisal cycle |
| PATCH | `/performance/cycles/:id` | `performance:manage` | Update cycle status |
| GET | `/performance/goals` | `performance:read` | List goals. Query: `cycleId?`, `employeeId?` |
| POST | `/performance/goals` | `performance:create` | Create a goal |
| PATCH | `/performance/goals/:id` | Self | Update goal progress |
| DELETE | `/performance/goals/:id` | Self | Delete a goal |
| POST | `/performance/goals/:id/kpis` | Self | Add KPI to a goal |
| PATCH | `/performance/kpis/:id` | Self | Update KPI progress |
| DELETE | `/performance/kpis/:id` | Self | Delete a KPI |
| GET | `/performance/objectives` | `performance:read` | List OKRs. Query: `cycleId?`, `employeeId?` |
| POST | `/performance/objectives` | `performance:create` | Create an objective |
| DELETE | `/performance/objectives/:id` | Self | Delete an objective |
| POST | `/performance/objectives/:id/key-results` | Self | Add key result |
| PATCH | `/performance/key-results/:id` | Self | Update key result progress |
| DELETE | `/performance/key-results/:id` | Self | Delete key result |
| GET | `/performance/self-assessment` | `performance:read` | Get self-assessment. Query: `cycleId` |
| PUT | `/performance/self-assessment` | `performance:create` | Submit self-assessment |
| GET | `/performance/reviews/team` | `performance:approve` | Team reviews for manager. Query: `cycleId` |
| GET | `/performance/reviews/me` | `performance:read` | My reviews. Query: `cycleId?` |
| PUT | `/performance/reviews` | `performance:approve` | Submit manager review |
| POST | `/performance/reviews/:id/acknowledge` | Self | Acknowledge a review |
| POST | `/performance/feedback` | `performance:create` | Submit 360 feedback |
| GET | `/performance/feedback` | `performance:read_all` | Get feedback. Query: `cycleId`, `subjectId` |
| GET | `/performance/promotions` | `performance:read_all` | Promotion recommendations. Query: `cycleId?` |
| GET | `/performance/dashboard` | `performance:read_all` | Performance dashboard. Query: `cycleId` |
| GET | `/performance/top-performers` | `performance:read_all` | Top performers. Query: `cycleId` |

---

## Announcements (Company Feed)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/announcements` | `announcement:read` | Feed of announcements (filtered by audience) |
| GET | `/announcements/:id` | `announcement:read` | Get announcement with comments |
| POST | `/announcements` | `announcement:manage` | Create an announcement (notifies audience) |
| PATCH | `/announcements/:id` | `announcement:manage` | Update an announcement |
| DELETE | `/announcements/:id` | `announcement:manage` | Delete an announcement |
| POST | `/announcements/:id/react` | `announcement:read` | Toggle reaction (emoji) |
| POST | `/announcements/:id/comments` | `announcement:read` | Add a comment |
| DELETE | `/announcements/:id/comments/:cid` | Self or admin | Delete a comment |

---

## Settings

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/settings` | Authenticated | Get system settings |
| PUT | `/settings` | `settings:manage` | Update system settings |

---

## Branding

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/branding` | Authenticated | Get company branding (colors, logo) |
| PUT | `/branding` | `settings:manage` | Update branding settings |
| POST | `/branding/logo` | `settings:manage` | Upload company logo |
| GET | `/branding/payslip-logo` | Authenticated | Get payslip logo |
| POST | `/branding/payslip-logo` | `settings:manage` | Upload payslip logo |

---

## EOD (End of Day Reports)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/eod/me` | `eod:read` | My EOD reports. Query: `from?`, `to?` |
| GET | `/eod/me/by-date` | `eod:read` | My EOD for a specific date |
| PUT | `/eod` | `eod:create` | Submit/update today's EOD |
| DELETE | `/eod/:id` | `eod:read` | Delete an EOD entry |
| GET | `/eod/summary` | `eod:read` | My weekly/monthly EOD summary |
| GET | `/eod/team` | `eod:read_all` | Team EOD reports for a date |
| GET | `/eod/team/summary` | `eod:read_all` | Team EOD summary over a date range |
| PATCH | `/eod/:id/review` | `eod:review` | Manager review of an EOD |
| GET | `/eod/dashboard` | `eod:read_all` | EOD dashboard (submission rates) |
| GET | `/eod/analytics/projects` | `eod:read_all` | Project time analytics from EODs |

---

## AI (Sera)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/ai/status` | Authenticated | Check if Sera is configured |
| GET | `/ai/conversations` | `ai:use` | List user's conversations |
| POST | `/ai/conversations` | `ai:use` | Create a new conversation |
| GET | `/ai/conversations/:id/messages` | `ai:use` | Get conversation messages |
| POST | `/ai/conversations/:id/messages` | `ai:use` | Send a message (SSE streaming response) |
| DELETE | `/ai/conversations/:id` | `ai:use` | Delete a conversation |
| GET | `/ai/knowledge` | `ai:manage` | List knowledge base documents |
| POST | `/ai/knowledge` | `ai:manage` | Add a knowledge document (auto-indexed) |
| DELETE | `/ai/knowledge/:id` | `ai:manage` | Delete a knowledge document |

---

## Imports (Bulk Excel Engine)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/imports/:type/template` | Per-type permission | Download import template (.xlsx) |
| POST | `/imports/:type/preview` | Per-type permission | Upload + validate (preview, no commit) |
| POST | `/imports/:type/commit` | Per-type permission | Upload + import valid rows |
| GET | `/imports` | Per-type permission | Import history (scoped to allowed types) |
| GET | `/imports/:id` | Per-type permission | Get import batch detail |
| GET | `/imports/:id/errors` | Per-type permission | Download error report (.xlsx) |
| POST | `/imports/:id/rollback` | Per-type permission | Rollback an import (delete created records) |

**Import types:** `attendance`, `leave_balance`, `leave_txn`, `payslip`, `holiday`

---

## Profile (Self-Service)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/profile/me` | Authenticated | Full employee profile |
| PATCH | `/profile/me/personal` | Authenticated | Update personal details |
| PATCH | `/profile/me/contact` | Authenticated | Update contact details |
| POST | `/profile/me/photo` | Authenticated | Upload profile photo |
| POST | `/profile/me/change-request` | Authenticated | Create a field change request (HR review) |
| GET | `/profile/me/change-requests` | Authenticated | My pending change requests |
| POST | `/profile/me/change-requests/:id/submit` | Authenticated | Submit draft for review |
| DELETE | `/profile/me/change-requests/:id` | Authenticated | Delete a draft change request |
| GET | `/profile/me/documents` | Authenticated | My uploaded documents |
| POST | `/profile/me/documents` | Authenticated | Upload a document |
| GET | `/profile/change-requests` | `employees:update` | HR: pending change requests |
| PATCH | `/profile/change-requests/:id/approve` | `employees:update` | HR: approve change request |
| PATCH | `/profile/change-requests/:id/reject` | `employees:update` | HR: reject change request |

---

## Files

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/files` | Authenticated | Upload a file |
| GET | `/files/:name` | Authenticated | Download/stream a file |

---

## Notifications

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/notifications` | Authenticated | My notifications (paginated) |
| GET | `/notifications/unread-count` | Authenticated | Unread notification count |
| PATCH | `/notifications/:id/read` | Authenticated | Mark notification as read |
| PATCH | `/notifications/read-all` | Authenticated | Mark all notifications as read |

---

## Audit

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/audit` | `audit:read_all` | Audit log (paginated). Query: `entity?`, `action?`, `userId?`, `from?`, `to?` |

---

## Analytics

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/analytics/overview` | `analytics:read` | Dashboard overview (headcount, attendance, etc.) |
| GET | `/analytics/headcount-trend` | `analytics:read` | Headcount over time. Query: `months?` |
| GET | `/analytics/hiring-trend` | `analytics:read` | Hiring trend. Query: `months?` |
| GET | `/analytics/payroll-trend` | `analytics:read_all` | Payroll cost trend. Query: `months?` |
| GET | `/analytics/attrition-trend` | `analytics:read` | Attrition trend. Query: `months?` |
| GET | `/analytics/department` | `analytics:read` | Department breakdown analytics |
| GET | `/analytics/leave-trends` | `analytics:read` | Leave usage trends. Query: `months?` |
| GET | `/analytics/hiring-funnel` | `analytics:read` | Recruitment funnel analytics |
| GET | `/analytics/attendance-trend` | `analytics:read` | Attendance trend. Query: `months?` |
| GET | `/analytics/celebrations` | Authenticated | Upcoming birthdays + work anniversaries |
