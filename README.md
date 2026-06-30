<div align="center">

# Somvanshi HRMS

### People. Performance. Growth.

**An enterprise Human Resource Management System by Somvanshi Technologies** — a full-stack,
multi-module platform covering the entire employee lifecycle: hire → onboard → work →
appraise → pay → exit, with role-based access, an approval-workflow engine, and a built-in
AI assistant (SomAI).

</div>

---

## Table of contents
1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [Project structure](#3-project-structure)
4. [User roles (complete)](#4-user-roles-complete)
5. [Permission model (RBAC)](#5-permission-model-rbac)
6. [Complete application flow](#6-complete-application-flow)
7. [Module-by-module workflows](#7-module-by-module-workflows)
8. [Getting started](#8-getting-started)
9. [API & docs](#9-api--docs)
10. [Default login & security](#10-default-login--security)

---

## 1. What it does

SomHR is organised into **bounded modules**, each owning its data and rules:

| Domain | Modules |
|--------|---------|
| **Identity & Access** | Authentication (JWT + refresh rotation, 2FA), RBAC, password reset |
| **Organization** | Company, locations, departments, designations, bands, org explorer |
| **People** | Employee master, profile self-service (ESS), documents |
| **Hiring** | Recruitment/ATS (requisitions → postings → candidates → interviews → offers), AI resume scoring |
| **Joining** | Onboarding templates, task checklists, digital forms & e-signatures |
| **Time** | Attendance (web/GPS/biometric punch), shifts, corrections, overtime |
| **Leave** | Leave types/policies, balances, requests with configurable approval chains, holidays |
| **Money** | Payroll runs, salary structures, payslips, salary revisions; expense claims & reimbursement |
| **Growth** | Performance (goals, OKRs/KPIs, self & manager reviews, 360 feedback, talent insights) |
| **Workplace** | Assets, helpdesk (tickets + SLA), EOD daily reports |
| **Exit** | Resignation, clearance, exit interview, full-&-final settlement |
| **Compliance** | Statutory IDs (PF/PT/ESI/TDS), filing calendar |
| **Engagement** | Recognition wall, announcements/company feed |
| **Platform** | Notifications (realtime), audit log, analytics dashboards, settings, branding, **SomAI** assistant |

---

## 2. Tech stack

**Backend** — Node.js · TypeScript · **Express 5** · **Prisma 7** (MariaDB adapter) · **MySQL 8** ·
Redis (ioredis, rate-limit + cache) · **Socket.IO** (realtime notifications) · JWT (`jsonwebtoken`) ·
bcryptjs · otplib (TOTP 2FA) · Zod (validation) · Multer (uploads) · AWS S3/SES · Nodemailer ·
PDFKit + pdf-parse (payslips / resume parsing) · OpenAI SDK (SomAI / RAG) · Pino (logging) ·
Helmet · Swagger UI.

**Frontend** — **React 19** · TypeScript · **Vite** · **Tailwind CSS 4** · Radix UI + shadcn-style
components · **TanStack Query** (server state) + **TanStack Table** · **Zustand** (client state) ·
React Router 7 · React Hook Form + Zod · Recharts (charts) · Framer Motion · Socket.IO client ·
Axios · Sonner (toasts) · react-markdown (SomAI chat).

**Infra** — Docker Compose (MySQL · Redis · backend · frontend/Nginx) **or** PM2 on a VM.

---

## 3. Project structure

```
Somvanshi_HRMS/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # full data model (70+ models, see db.md)
│   │   └── seed.ts                # bootstrap: permissions, roles, company, admin, configs
│   ├── src/
│   │   ├── config/                # env, db (Prisma), redis, swagger
│   │   ├── core/                  # logger, error handling, app bootstrap
│   │   ├── middleware/            # auth guard, RBAC guard, rate limit, error mw
│   │   ├── shared/                # permissions.ts (role→permission matrix), utils
│   │   ├── modules/               # 27 bounded modules (each: routes·controller·service·schema)
│   │   │   ├── auth/  rbac/  password-reset/
│   │   │   ├── org/  employees/  profile/  documents/
│   │   │   ├── recruitment/  onboarding/
│   │   │   ├── attendance/  leave/
│   │   │   ├── payroll/  expense/  compliance/
│   │   │   ├── performance/  eod/
│   │   │   ├── assets/  helpdesk/
│   │   │   ├── exit/
│   │   │   ├── engagement/  announcements/
│   │   │   ├── analytics/  audit/  notifications/
│   │   │   ├── settings/  branding/  files/
│   │   │   └── ai/                # SomAI: chat, knowledge base, RAG
│   │   ├── routes.ts              # central API router (mounts every module)
│   │   └── server.ts              # entrypoint (Express + Socket.IO)
│   └── .env                       # secrets (gitignored)
│
├── frontend/
│   ├── public/
│   └── src/
│       ├── app/                   # router, nav config, layout, providers
│       ├── components/            # shared UI (Radix/shadcn-style)
│       ├── lib/                   # axios client, query client, helpers
│       └── features/              # one folder per domain (mirrors backend modules)
│           ├── auth/  dashboard/  rbac/  org/
│           ├── employees/  profile/
│           ├── recruitment/  onboarding/
│           ├── attendance/  leave/
│           ├── payroll/  expense/  compliance/
│           ├── performance/  eod/
│           ├── assets/  helpdesk/  exit/
│           ├── engagement/  feed/  reports/
│           ├── notifications/  settings/
│           └── somai/             # AI assistant UI
│
├── database/init/                 # DB init scripts
├── deploy/ecosystem.config.cjs    # PM2 process definition
├── docker-compose.yml             # full-stack compose (MySQL·Redis·API·Nginx)
├── docs/                          # API.md · ARCHITECTURE.md · DEPLOYMENT.md · ERD.md · RBAC.md
├── db.md                          # detailed schema reference (gitignored)
└── README.md                      # this file
```

Each backend module follows the same shape: **`*.routes.ts`** (HTTP + guards) → **`*.controller.ts`**
(request/response) → **`*.service.ts`** (business logic + Prisma) → **`*.schema.ts`** (Zod validation).

---

## 4. User roles (complete)

There are **10 system roles**, seeded as `isSystem` (the Super Admin can re-wire permissions at
runtime via Role Management). Every authenticated user is also an **Employee**, so all roles inherit
the **Self-Service (ESS)** baseline on top of their elevated permissions.

| # | Role | Display | What they do |
|---|------|---------|--------------|
| 1 | `SUPER_ADMIN` | **Super Admin** | Full platform control — **all permissions**, including roles, users, settings, audit. The only true platform administrator. |
| 2 | `CEO` | **CEO** | Executive view: org-wide visibility (employees, attendance, leave, payroll, performance, expenses, exits), **final approvals**, company-wide comms (announcements/recognition), full analytics & audit. **Not** a platform admin — cannot edit roles/users/settings, run payroll, or manage recruitment; they *observe & approve*. |
| 3 | `HR_ADMIN` | **HR Admin** | Administers **all HR modules org-wide**: employees CRUD, recruitment, onboarding, attendance, leave, **payroll run**, performance, assets, helpdesk, exit, compliance, org structure, plus user provisioning, analytics, AI management and audit. |
| 4 | `HR_EXECUTIVE` | **HR Executive** | Day-to-day HR ops: create/update employees, onboarding, attendance approve/manage, leave approve, asset assignment, helpdesk handling. No payroll, no role/settings admin. |
| 5 | `RECRUITER` | **Recruiter** | Owns the recruitment pipeline end-to-end (requisitions, postings, candidates, interviews, offers) + recruitment analytics. |
| 6 | `FINANCE_MANAGER` | **Finance Manager** | Payroll processing **and approval**, expense approval/management, exit (F&F) approval, compliance management, finance analytics. |
| 7 | `DEPARTMENT_HEAD` | **Department Head** | Leads a department: team approvals (leave, attendance, expense, exit), can raise & approve hiring requisitions, org-wide analytics for their area. |
| 8 | `MANAGER` | **Manager** | Manages a team: approves their reports' leave/attendance/expense/exit, reviews performance, team analytics. Read-only recruitment. |
| 9 | `TEAM_LEAD` | **Team Lead** | First-line approver for a small team: leave/attendance/performance approval + team analytics (the "people-lead" baseline). |
| 10 | `EMPLOYEE` | **Employee** | Self-service only: own profile, punch in/out, apply leave, view payslips, raise tickets/expenses, set goals, give recognition, use SomAI. |

### Self-Service baseline (every role inherits)
Read own employee record · punch attendance · apply & view leave · view own payslips · create/update
own performance goals · view assigned assets · raise & view helpdesk tickets · create & view expense
claims · initiate & view own exit · view/update own compliance IDs · give & view recognition · read
announcements · submit EOD reports · read notifications · **use SomAI** · read org structure.

### "People-lead" extras (Team Lead, Manager, Dept Head, HR Admin)
Read team members (row-scoped to their reporting line by the service layer) · approve team
attendance · approve team leave · review team performance · team analytics.

---

## 5. Permission model (RBAC)

- Permissions are strings of the form **`module:action`** (e.g. `payroll:run`, `leave:approve`,
  `employees:read_all`). The full catalog lives in `backend/src/shared/permissions.ts` and is
  seeded into the `permissions` table.
- A role maps to a **subset** of permissions (`role_permissions`); a user holds one or more roles
  (`user_roles`). Effective permissions = union of all the user's roles.
- **Scope tiers** per module: `read` (own) → `read_all` (everyone, often row-scoped to the
  reporting line) → `create` / `update` / `approve` → `manage` (full admin of that module).
- RBAC is enforced by middleware on every protected route; checks run against **DB-resolved,
  cached** permission sets — not hard-coded — so Super Admin can re-assign permissions live.
- Permission modules: `auth, users, roles, org, employees, recruitment, onboarding, attendance, leave,
  payroll, performance, assets, helpdesk, expense, exit, compliance, analytics, recognition,
  announcement, eod, notifications, ai, audit, settings` (`auth:impersonate` enables admin
  token-exchange — see §6.A).

> Full matrix: [`docs/RBAC.md`](docs/RBAC.md) · source of truth: `backend/src/shared/permissions.ts`.

---

## 6. Complete application flow

### A. Authentication & session
```
Login (email + password)
  → bcrypt verify → (optional TOTP 2FA challenge)
  → issue short-lived JWT access token + long-lived refresh token (rotating family)
  → session + device recorded
  → access token carries user → roles → permissions (resolved & cached)
Refresh: rotate refresh token (reuse detection revokes the family)
Lockout: N failed attempts → account LOCKED until cooldown
Password reset: self (email token) OR admin-mediated (employee requests → admin approves → temp password emailed)
```

**Impersonation (token-exchange)** — a caller holding **`auth:impersonate`** (granted to `HR_ADMIN` /
`SUPER_ADMIN`) can call **`POST /auth/impersonate { employeeId }`** to mint a **short-lived** access
token (`IMPERSONATION_TTL_SECONDS`, default **10 min**, no refresh) scoped to that employee. The
token carries the **target's `employeeId`** — so every existing `/me` route and self-service write
works unchanged and is correctly filed under that employee — plus an `impersonatedBy` claim for
audit; the grant itself is audit-logged. Permissions are **least-privilege** (resolved from the
target's own login when they have one). Primary use case: a single service account (e.g. an external
chatbot) acting on each employee's behalf over one connection:
`GET /employees?search=` → `POST /auth/impersonate { employeeId }` → call `/me` reads & writes with
the returned token, then drop it at end of turn.

### B. Request lifecycle (every API call)
```
HTTP request
  → rate limiter (Redis)
  → auth guard (valid JWT?)
  → RBAC guard (has required permission?)
  → controller (validate body with Zod)
  → service (business rules + Prisma) — row-scoping applied here (e.g. managers see only reports)
  → audit log written for sensitive actions (before/after snapshots)
  → response; realtime events pushed via Socket.IO; notifications created
```

### C. Employee lifecycle (the big picture)
```
RECRUIT ──► OFFER ──► ONBOARD ──► ACTIVE (work) ──► EXIT
  ATS         accept   checklist    │                resignation
  pipeline    offer    + e-sign     ├─ Attendance (punch, shifts, OT, corrections)
                                    ├─ Leave (apply → approval chain → balance update)
                                    ├─ Payroll (monthly run → payslip → publish)
                                    ├─ Performance (goals → reviews → 360 → talent insights)
                                    ├─ Expenses (claim → approve → reimburse)
                                    ├─ Assets (assign → return)
                                    ├─ Helpdesk (ticket → SLA → resolve)
                                    └─ Engagement (recognition, announcements, EOD)
                                                       │
                                  EXIT: clearance ► exit interview ► F&F settlement ► ALUMNI
```

### D. Generic approval-workflow engine
Many actions route through a **configurable approval chain** (`workflow_configs` + per-request
`*_approval_steps`). Default leave chain is **Manager → HR**, editable at runtime by HR. Each step
resolves an approver (the requester's manager, or anyone holding a given role), advances on approve,
and stops/returns on reject or "needs more info".

---

## 7. Module-by-module workflows

**Recruitment (ATS)** — Department Head/HR raises a **requisition** → approval → **job posting** →
candidates apply (resumes parsed + **AI-scored**) → **applications** move through stages (Applied →
Screening → Technical → Managerial → HR → Offer) → **interviews** scheduled with panel feedback →
**offer** drafted/approved/sent → on accept, candidate becomes an **employee** (status ONBOARDING).

**Onboarding** — A default template (7 tasks) instantiates per new hire: upload IDs, complete
profile, sign joining/policy forms (**e-signature**), IT account creation, asset allocation, manager
induction, payroll setup. Tasks have assignee roles & due dates; instance completes when all done.

**Attendance** — Employee punches in/out (WEB/GPS/QR/BIOMETRIC); shift + grace decides late/early;
GPS validated against location geo-radius. Corrections → approval. Overtime captured per day.

**Leave** — Employee applies against a leave type (CL/SL/EL/ML/PL/CO/LOP) → balance check (entitled/
accrued/used/pending) → **approval chain** (Manager → HR by default) → on approve, balance updated &
attendance marked ON_LEAVE. Half-day units supported; some types need a document (e.g. Sick).

**Payroll** — Finance/HR opens a monthly **payroll run** → engine computes each employee's payslip
from their salary structure (BASIC 50% of CTC, HRA 50% of basic, balance Special Allowance,
statutory PF/PT/ESI/TDS) and LOP days → run goes DRAFT → PROCESSING → PENDING_APPROVAL → APPROVED →
PAID → payslips published (PDF) to employees.

**Performance** — Within an **appraisal cycle**: employee sets **goals** (weighted) & **OKRs**
(objectives → key results → KPIs) → **self-assessment** → **manager review** (rating, promotion
rec) → **360 feedback** (peers/reports, anonymous) → AI **talent insights** (promotion readiness,
attrition risk).

**Expense** — Employee builds an **expense report** with itemised claims (receipts, optional AI OCR)
→ submit → manager/finance **approval** (per-category caps enforced) → **reimbursement** (payroll or
bank transfer).

**Helpdesk** — Employee raises a **ticket** (HR/IT/Finance/Admin category) → SLA clock starts
(first-response/resolution/escalation) → assigned → comments (internal/public) → resolve/close;
breaches auto-escalate.

**Assets** — Asset registered (tag, category, serial) → **assigned** to employee → returned on exit
(condition logged); maintenance/repairs tracked.

**Exit** — Employee submits **resignation** (notice period, last working day) → accepted → **clearance
items** per department (IT/HR/Finance/Admin/Manager) → **exit interview** (AI sentiment) → **F&F
settlement** (earnings − deductions = net payable) → relieving/experience letters → status ALUMNI.

**Engagement & Comms** — Peer **recognition** wall (badges, cheers) · **announcements**/company feed
(pinned, audience-targeted, reactions, comments) · **EOD** daily reports (tasks done, blockers,
tomorrow plan) reviewed by managers.

**SomAI** — In-app AI assistant over a **knowledge base** (policies/SOPs/FAQs chunked & embedded);
answers employee questions via **RAG** (cosine similarity in-service), with per-user conversations.

**Platform** — Realtime **notifications** (Socket.IO) · immutable **audit log** (who changed what) ·
**analytics** dashboards · **settings**/**branding** · org **explorer** (interactive org chart).

---

## 8. Getting started

### Option A — Docker (full stack)
```bash
cp .env.example .env          # then edit secrets (MYSQL_*, JWT_*, etc.)
docker compose up -d --build
docker compose run --rm backend npx prisma db seed   # first boot only (bootstrap + admin)
# App:  http://localhost      API:  http://localhost/api/v1
```

### Option B — Local development
```bash
# 1) Backend
cd backend
cp .env.example .env          # set DATABASE_URL, JWT secrets, etc.
npm install
npx prisma generate
npx prisma migrate deploy     # or: prisma db push
npm run seed                  # bootstrap permissions/roles/company/admin/configs
npm run dev                   # API on :5000

# 2) Frontend
cd ../frontend
npm install
npm run dev                   # Vite dev server (proxies to the API)
```

The **seed is idempotent** (safe to re-run) and creates *bootstrap data only* — permission catalog,
the 10 roles with their matrix, the company with departments/locations/bands/designations, the 7
leave types + policies, payroll components + "Standard India CTC" structure, the default onboarding
template, helpdesk SLA/categories, expense categories, and the Super Admin login. All real records
(employees, attendance, leave, payroll) are created through the app.

---

## 9. API & docs

- **Base URL:** `/api/v1` · **Interactive docs:** `/api/docs` (Swagger UI).
- Modules are mounted in `backend/src/routes.ts`: `auth, rbac, password-resets, org, org/explorer,
  employees, analytics, notifications, audit, files, profile, leave, attendance, payroll,
  recruitment, onboarding, assets, helpdesk, expenses, exit, compliance, engagement, performance,
  announcements, settings, branding, eod, ai`.
- Deeper references in [`docs/`](docs/): `API.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `ERD.md`,
  `RBAC.md`. Full DB schema in [`db.md`](db.md).

---

## 10. Default login & security

After seeding, a single bootstrap admin exists:

| | |
|---|---|
| **Email** | `admin@somvanshitech.com` |
| **Password** | `SomHR@Admin2026` |
| **Roles** | Super Admin + HR Admin |

> ⚠️ **Change this password immediately after first login.** Generate strong JWT secrets
> (`openssl rand -hex 32`) and a dedicated `FIELD_ENCRYPTION_KEY` for production. Sensitive fields
> (bank account, statutory IDs) are encrypted at the service layer; never commit `.env` or `db.md`.

---

<div align="center">

**Somvanshi Technologies** — *People. Performance. Growth.*

</div>
