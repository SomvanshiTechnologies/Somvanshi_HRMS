# SomHR — REST API Structure

Base URL: `/api/v1` · Auth: `Authorization: Bearer <access>` (or httpOnly cookie) ·
Errors: RFC-7807-style `{ success:false, error:{ code, message, details } }` ·
Lists: `?page&limit&sort&order&search` → `{ data, meta:{ page, limit, total, totalPages } }` ·
Docs: Swagger UI at `/api/docs` (OpenAPI 3.1, generated from Zod schemas).

Every route declares: **permission code** (RBAC), **Zod validator**, **rate-limit tier**.

## Auth — `/auth`
| Method | Path | Permission |
|---|---|---|
| POST | /auth/login | public (rate-limited) |
| POST | /auth/login/2fa | public |
| POST | /auth/refresh | refresh cookie |
| POST | /auth/logout | authenticated |
| POST | /auth/forgot-password | public |
| POST | /auth/reset-password | public (token) |
| GET/DELETE | /auth/sessions, /auth/sessions/:id | authenticated |
| GET | /auth/devices | authenticated |
| POST/DELETE | /auth/2fa/setup · /auth/2fa/verify · /auth/2fa | authenticated |
| GET | /auth/me | authenticated |

## RBAC — `/roles`, `/permissions`
CRUD on roles, permission catalog list, `PUT /roles/:id/permissions`, `PUT /users/:id/roles` — `roles:manage`.

## Org — `/org`
CRUD: `/org/company` · `/org/locations` · `/org/departments` · `/org/designations` · `/org/bands` — read: `org:read`, write: `org:manage`.

## Employees — `/employees`
| Method | Path | Permission |
|---|---|---|
| GET | /employees (search/filter/paginate) | employees:read_all (scoped) |
| POST | /employees | employees:create |
| GET/PATCH/DELETE | /employees/:id | read / update / delete |
| GET | /employees/:id/timeline | employees:read |
| GET | /employees/org-chart · /employees/:id/reports | employees:read |
| CRUD | /employees/:id/{educations,experiences,certifications,skills,documents,bank-details,emergency-contacts} | self or employees:update |
| POST | /employees/:id/lifecycle (status transition) | employees:manage |
| GET | /employees/export | employees:export |

## Recruitment — `/recruitment`
Requisitions CRUD + `POST /requisitions/:id/submit|approve|reject` · postings CRUD + publish ·
candidates CRUD + `POST /candidates/:id/resumes` (multipart) · applications CRUD +
`PATCH /applications/:id/stage` · interviews CRUD + `POST /interviews/:id/feedback` ·
offers CRUD + send/accept/decline · AI: `POST /applications/:id/score`,
`GET /requisitions/:id/matches`.

## Onboarding — `/onboarding`
Templates CRUD · instances (start, list, get) · `PATCH /tasks/:id` (complete/skip) ·
forms `GET/PUT /forms/:id` + `POST /forms/:id/sign` · asset-allocation hook.

## Attendance — `/attendance`
`POST /attendance/check-in` · `POST /attendance/check-out` (body: source WEB/MOBILE/GPS/QR, lat/lng) ·
`POST /attendance/breaks/start|stop` · `GET /attendance/me?month=` · `GET /attendance` (scoped) ·
corrections: POST + `PATCH /corrections/:id/approve|reject` · overtime: POST + approve ·
shifts CRUD + `POST /shifts/assign` · `GET /attendance/summary` (dashboard).

## Leave — `/leave`
`GET /leave/balances/me` · `GET /leave/balances/:employeeId` · requests CRUD +
`PATCH /requests/:id/approve|reject|cancel` · `GET /leave/calendar?month=` (team view) ·
holiday calendars CRUD · leave types/policies CRUD (`leave:manage`).

## Payroll — `/payroll`
Components CRUD · structures CRUD · `PUT /employees/:id/salary` · revisions CRUD + approve ·
runs: `POST /payroll/runs` (process month) → `PATCH /runs/:id/approve` → `PATCH /runs/:id/mark-paid` ·
`GET /payslips/me` · `GET /payslips/:id/pdf` (stream) · `GET /payroll/register?month=&year=` ·
`GET /payroll/summary` (dashboard).

## Performance — `/performance`
Cycles CRUD · goals/objectives/key-results/KPIs CRUD (self + manager scoped) ·
self-assessments `GET/PUT/POST .../submit` · manager-reviews same · 360 feedback create/submit ·
AI: `GET /performance/insights?kind=ATTRITION_RISK|PROMOTION_READINESS|HIGH_PERFORMER`.

## Assets — `/assets`
Assets CRUD · `POST /assets/:id/assign` · `POST /assets/:id/return` · maintenance CRUD ·
`GET /assets/summary` (counts by category/status).

## Helpdesk — `/helpdesk`
Tickets CRUD + comments + `PATCH /tickets/:id/assign|status` · SLA policies & categories CRUD ·
escalations auto-created by SLA job · `GET /helpdesk/summary`.

## Expense — `/expense`
Reports CRUD + `POST /reports/:id/submit` + approve/reject · items CRUD with receipt upload ·
`POST /items/ocr` (AI receipt extraction) · reimbursements list/mark-paid.

## Exit — `/exit`
`POST /exit/resignations` · accept/retract · clearance items list/clear ·
exit-interview schedule/submit · FNF calculate/approve/settle ·
`GET /exit/:id/letters/relieving|experience` (PDF).

## Notifications — `/notifications`
`GET /notifications` · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all`.
Realtime push via Socket.IO `notification:new`.

## Analytics — `/analytics` (dashboard = these APIs only)
`GET /analytics/overview` (all KPI cards: total/active employees, new joiners, attrition %, payroll cost, open positions, attendance %, leave utilization) ·
`/analytics/headcount-trend` · `/analytics/hiring-funnel` · `/analytytics/payroll-trend` ·
`/analytics/attrition-trend` · `/analytics/department` · `/analytics/attendance` ·
`/analytics/leave-trends` — all parameterized by date range, all computed from live DB aggregates.

## Files — `/files`
`POST /files` (multipart, Multer → S3) · `GET /files/:id` (signed URL redirect) — ownership-checked.

## SomAI — `/ai`
`POST /ai/conversations` · `GET /ai/conversations` · `POST /ai/conversations/:id/messages`
(SSE streaming response; tool-calling against leave/attendance/payroll/employee/ticket/analytics
services with the caller's RBAC scope) · knowledge base: `POST /ai/knowledge` (upload+embed),
`GET/DELETE /ai/knowledge/:id`, `POST /ai/knowledge/:id/reindex` (`ai:manage`).

## Audit — `/audit`
`GET /audit?entity=&userId=&from=&to=` — `audit:read_all`.

## Realtime events (Socket.IO, JWT-authenticated, room-per-user + role rooms)
`notification:new` · `attendance:updated` · `leave:status` · `ticket:updated` ·
`payroll:run-status` · `ai:stream` (token stream fallback).
