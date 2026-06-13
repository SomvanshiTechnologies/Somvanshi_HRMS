# SomHR — Enterprise HRMS Architecture

> **SomHR** · *People. Performance. Growth.*
> A product of **Somvanshi Technologies**

This document is the single source of truth for the SomHR platform architecture. It is written
to be implemented **phase by phase**. Phase 1 (this document + the Prisma schema) defines the
foundation; all later phases build against the contracts established here.

---

## 1. Product Overview

SomHR is a **modular monolith** HRMS delivered as an enterprise SaaS platform. It targets the
visual and functional bar set by Workday, Darwinbox, SAP SuccessFactors, and Oracle HCM.

| Pillar | Modules |
|---|---|
| **People** | Employee Master, Org Chart, Directory, Lifecycle, Documents |
| **Hire** | Recruitment/ATS, Onboarding |
| **Operate** | Attendance, Leave, Assets, Helpdesk, Expense |
| **Pay** | Payroll, Salary Structures, Payslips |
| **Grow** | Performance (Goals/OKR/KPI), 360 Feedback |
| **Exit** | Resignation, Clearance, FNF, Letters |
| **Intelligence** | Executive Analytics, SomAI (RAG assistant) |
| **Platform** | Auth, RBAC, Notifications, Audit, Files |

---

## 2. High-Level System Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │                  CLIENTS                      │
                          │   Web (React 19 SPA)   ·   Mobile Web (PWA)   │
                          └───────────────┬──────────────────────────────┘
                                          │  HTTPS / WSS
                          ┌───────────────▼──────────────────────────────┐
                          │                  NGINX                        │
                          │   TLS · reverse proxy · static · gzip/br      │
                          └───────────────┬──────────────────────────────┘
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
   ┌────────▼─────────┐         ┌─────────▼──────────┐        ┌─────────▼─────────┐
   │  REST API (HTTP) │         │  Realtime (Socket) │        │   AI Gateway      │
   │  Express 5 + TS  │◄───────►│  Socket.IO server  │        │  SomAI / RAG      │
   └────────┬─────────┘         └─────────┬──────────┘        └─────────┬─────────┘
            │  Clean architecture: Controller → Service → Repository    │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
        ┌───────────────┬─────────────────┼──────────────────┬────────────────┐
        │               │                 │                  │                │
 ┌──────▼─────┐  ┌──────▼──────┐   ┌───────▼──────┐   ┌────────▼──────┐ ┌───────▼──────┐
 │ PostgreSQL │  │   Redis     │   │ S3 Storage   │   │  OpenAI API   │ │  SMTP /Mail  │
 │ (Prisma)   │  │ cache·queue │   │ docs/uploads │   │  LLM + embed  │ │  Nodemailer  │
 │ + pgvector │  │ ·sessions   │   │              │   │               │ │              │
 └────────────┘  └─────────────┘   └──────────────┘   └───────────────┘ └──────────────┘
```

### 2.1 Architectural Style — Modular Monolith
A single deployable backend, internally partitioned into **bounded modules**. Each module owns
its routes, controllers, services, repositories, validators, and types. Modules talk to each
other only through **service interfaces** (never by reaching into another module's repository),
so any module can later be extracted into a microservice with minimal churn.

### 2.2 Request Lifecycle (Clean Architecture)
```
HTTP request
  → Route (defines path + RBAC guard + validator)
  → Middleware (auth → rbac → rate-limit → zod validation)
  → Controller (HTTP concern only: parse req, shape res)
  → Service (business logic, transactions, orchestration)
  → Repository (Prisma data access — the ONLY layer touching the DB)
  → Domain entities / DTOs
  ← Response (typed DTO) ← AuditLog side-effect (async)
```

**SOLID enforcement**
- **S** — controllers do HTTP only; services do logic; repositories do persistence.
- **O** — new behavior via new services/strategies, not by editing the dispatcher.
- **L** — repositories implement shared interfaces (e.g. `IReadRepository<T>`).
- **I** — narrow service interfaces per use case.
- **D** — controllers/services depend on interfaces resolved via a lightweight DI container.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, **Tailwind CSS v4**, shadcn/ui, React Query, Zustand, React Hook Form, Zod, Framer Motion, Recharts, Socket.IO client |
| Backend | Node.js 20, Express 5, TypeScript (ESM/nodenext), Prisma 7, PostgreSQL 16, Redis 7, JWT + refresh tokens, Socket.IO, Multer, Nodemailer |
| AI | OpenAI API, RAG over pgvector, internal knowledge base, conversation memory |
| Infra | Docker, Docker Compose, Nginx, AWS EC2, S3-compatible storage |

---

## 4. Enterprise Folder Structure

```
HRMS/
├── docs/                          # Architecture, ERD, API & deployment guides
│   ├── ARCHITECTURE.md            # ← this file
│   ├── ERD.md                     # Entity-relationship diagram (Mermaid)
│   └── DEPLOYMENT.md              # (Phase 7)
│
├── database/                      # SQL bootstrap, extensions, backups
│   └── init/                      # pgvector + extensions bootstrap
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # ← full data model (Phase 1)
│   │   ├── migrations/
│   │   └── seed.ts                # Seed data (Phase 3)
│   ├── src/
│   │   ├── app.ts                 # Express app assembly
│   │   ├── server.ts              # HTTP + Socket.IO bootstrap
│   │   ├── config/                # env, db, redis, mailer, s3, swagger
│   │   ├── core/                  # cross-cutting: errors, logger, di, result, http
│   │   ├── middleware/            # auth, rbac, validate, rateLimit, error, audit
│   │   ├── shared/                # utils, constants, types, pagination, mappers
│   │   ├── realtime/              # Socket.IO gateway + event registry
│   │   ├── jobs/                  # Redis-backed queues (payroll, mail, notify)
│   │   └── modules/               # ← bounded modules (one folder each)
│   │       ├── auth/              # login, refresh, 2FA, sessions, devices
│   │       ├── rbac/              # roles, permissions, assignments
│   │       ├── org/               # company, departments, designations, locations
│   │       ├── employees/         # master profile, lifecycle, documents
│   │       ├── recruitment/       # requisitions, postings, candidates, interviews, offers
│   │       ├── onboarding/        # checklists, forms, e-sign, induction
│   │       ├── attendance/        # punches, shifts, breaks, overtime, corrections
│   │       ├── leave/             # types, policies, balances, requests, calendar
│   │       ├── payroll/           # structures, components, runs, payslips, revisions
│   │       ├── performance/       # goals, okr, kpi, appraisals, 360
│   │       ├── assets/            # inventory, assignment, maintenance
│   │       ├── helpdesk/          # tickets, SLA, escalation
│   │       ├── expense/           # reports, items, OCR, reimbursement
│   │       ├── exit/              # resignation, clearance, FNF, letters
│   │       ├── notifications/     # in-app + email fan-out
│   │       ├── analytics/         # aggregated reporting endpoints
│   │       ├── files/             # upload/download, S3 adapter
│   │       └── ai/                # SomAI: RAG, knowledge base, chat, tools
│   │           └── (each module) → routes · controller · service · repository · dto · *.schema
│   ├── tests/
│   └── package.json
│
└── frontend/
    ├── public/brand/              # SomHR / Somvanshi logo assets
    └── src/
        ├── app/                   # router, providers, layout shells
        ├── design-system/         # tokens, theme, primitives (Phase 4)
        │   ├── tokens.css         # @theme design tokens (Tailwind v4)
        │   └── components/        # Button, Input, Select, Table, Modal, Drawer,
        │                          # Card, Badge, Alert, Toast, Skeleton, KpiCard…
        ├── components/            # composed widgets (charts, data-table, nav)
        ├── features/              # one folder per module (mirrors backend)
        ├── lib/                   # api client, query client, socket, utils
        ├── stores/                # Zustand stores
        ├── hooks/                 # shared hooks
        └── types/                 # shared TS types / API contracts
```

---

## 5. Data Architecture

The complete model lives in `backend/prisma/schema.prisma`. It is organized into domains:

| Domain | Core entities |
|---|---|
| **Identity & Access** | `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `RefreshToken`, `Session`, `Device`, `TwoFactorSecret`, `PasswordResetToken`, `AuditLog` |
| **Organization** | `Company`, `Location`, `Department`, `Designation`, `Band` |
| **Employee** | `Employee`, `EmploymentEvent`, `Education`, `Experience`, `Certification`, `Skill`, `EmployeeSkill`, `EmployeeDocument`, `BankDetail`, `EmergencyContact` |
| **Recruitment** | `JobRequisition`, `RequisitionApproval`, `JobPosting`, `Candidate`, `Application`, `Resume`, `ResumeScore`, `InterviewStage`, `Interview`, `InterviewFeedback`, `Offer` |
| **Onboarding** | `OnboardingTemplate`, `OnboardingTask`, `OnboardingInstance`, `DigitalForm`, `ESignature` |
| **Attendance** | `Shift`, `ShiftAssignment`, `AttendanceRecord`, `BreakLog`, `AttendanceCorrection`, `OvertimeRecord` |
| **Leave** | `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveRequest`, `HolidayCalendar`, `Holiday` |
| **Payroll** | `SalaryStructure`, `SalaryComponent`, `EmployeeSalary`, `EmployeeSalaryComponent`, `SalaryRevision`, `PayrollRun`, `Payslip`, `PayslipLine` |
| **Performance** | `AppraisalCycle`, `Goal`, `Objective`, `KeyResult`, `Kpi`, `SelfAssessment`, `ManagerReview`, `Feedback360` |
| **Assets** | `Asset`, `AssetAssignment`, `AssetMaintenance` |
| **Helpdesk** | `TicketCategory`, `SlaPolicy`, `Ticket`, `TicketComment`, `TicketEscalation` |
| **Expense** | `ExpenseCategory`, `ExpenseReport`, `ExpenseItem`, `Reimbursement` |
| **Exit** | `Resignation`, `ClearanceItem`, `ExitInterview`, `FnfSettlement` |
| **Platform** | `Notification`, `KnowledgeDocument`, `KnowledgeChunk`, `Conversation`, `ChatMessage` |

**Conventions**
- PKs are `cuid()` strings. Money stored as `Decimal(14,2)`. All tables carry `createdAt`/`updatedAt`.
- Soft-delete via `deletedAt` on long-lived records (Employee, Asset, etc.).
- Every mutation emits an `AuditLog` row (actor, action, entity, before/after, ip, ua).
- Multi-tenant-ready: every business table carries `companyId`.
- Vector search uses **pgvector**; `KnowledgeChunk.embedding` is a `vector(1536)` column queried via raw SQL cosine distance.

See **`docs/ERD.md`** for the relationship diagram.

---

## 6. Security Architecture

| Control | Implementation |
|---|---|
| **AuthN** | JWT access token (15 min) + rotating refresh token (7 d) stored hashed in DB; httpOnly cookie + Authorization header support. |
| **2FA** | TOTP (RFC 6238) with recovery codes; enforced per-role policy. |
| **AuthZ (RBAC)** | DB-driven `permission` strings (`module:action`, e.g. `payroll:run`). Roles → permissions many-to-many; `rbac` middleware checks the resolved permission set, cached in Redis. |
| **Sessions/Devices** | Each login records a `Session` + `Device` fingerprint; users can list and revoke sessions. |
| **Rate limiting** | Redis sliding-window per IP + per user on auth and sensitive endpoints. |
| **Input validation** | Zod schemas at the edge for every request body/query/params. |
| **XSS** | Output encoding on the client; `helmet` CSP; sanitize rich text. |
| **CSRF** | Double-submit cookie token for cookie-based auth flows. |
| **Transport** | TLS terminated at Nginx; HSTS. |
| **Secrets** | `.env` (never committed) → environment / secrets manager in prod. |
| **Audit** | Append-only `AuditLog` for every privileged action. |

### Role → Permission Model (9 roles, DB-driven)
`Super Admin · HR Admin · HR Executive · Recruiter · Finance Manager · Department Head · Manager · Team Lead · Employee`

Permissions are **not hard-coded** in code branches; they are seeded rows and assigned to roles,
so a Super Admin can re-wire access at runtime through the Role Management module.

---

## 7. Design System (Frontend) — Tailwind v4 + shadcn/ui

Built **CSS-first** with Tailwind v4 `@theme`. No inline CSS; no CSS Modules unless unavoidable.
All color, spacing, typography, shadow, and radius values derive from **design tokens** exposed as
CSS variables, enabling **light/dark** theming by swapping the variable layer.

### Brand tokens
| Token | Light | Role |
|---|---|---|
| `--color-primary` | `#0A3D62` | Brand / primary actions |
| `--color-secondary` | `#111827` | Headings / sidebar |
| `--color-bg` | `#F8FAFC` | App background |
| `--color-surface` | `#FFFFFF` | Cards / panels |
| `--color-text` | `#1E293B` | Body text |
| `--color-border` | `#E2E8F0` | Dividers / inputs |
| `--color-success` | `#22C55E` | Positive states |
| `--color-warning` | `#F59E0B` | Caution states |
| `--color-danger` | `#EF4444` | Destructive states |

Dark mode remaps `--color-bg`, `--color-surface`, `--color-text`, `--color-border` while keeping
brand hues, preserving WCAG AA contrast.

### Reusable primitives (Phase 4)
`Button · Input · Select · Textarea · Checkbox/Radio/Switch · Table/DataTable · Modal · Drawer ·
Card · Badge · Alert · Toast · Tooltip · Tabs · Skeleton · Avatar · Pagination · KpiCard ·
ChartCard · EmptyState · CommandPalette`

### Layout & UX
Sticky app header, collapsible sidebar navigation, responsive grid (mobile → tablet → desktop →
ultra-wide), notification center, quick actions, loading skeletons, hover/focus states, full
keyboard accessibility (focus rings, ARIA, reduced-motion support), Framer Motion transitions.

### Dashboard composition (Workday/Darwinbox/SuccessFactors class)
KPI cards row → analytics chart grid (Recharts: headcount, hiring, payroll, attrition, dept) →
data tables (recent joiners, pending approvals) → quick actions → notification center.

---

## 8. AI Layer — SomAI

```
User question
  → Intent + entity extraction (LLM)
  → If actionable (leave/ticket/payslip) → tool-call → backend service → DB
  → Else retrieve: embed query → pgvector cosine top-k over KnowledgeChunk
  → Compose grounded prompt (retrieved context + user/role scope + conversation memory)
  → OpenAI completion → cited answer
  → Persist ChatMessage (conversation memory)
```
Capabilities: leave/attendance/payslip queries, employee & policy search, ticket creation,
analytics Q&A. All answers are **scoped by the caller's RBAC** — SomAI can never reveal data the
user could not access through the normal UI.

---

## 9. Build Roadmap (Phases)

| Phase | Scope | Status |
|---|---|---|
| **1** | Architecture, folder structure, Prisma schema, ERD, brand tokens | **in progress** |
| **2** | Backend core: app/server, config, error/logging, auth (JWT/refresh/2FA/sessions), RBAC, rate-limit, validation, audit, Swagger | pending |
| **3** | Backend feature modules + Socket.IO + seed data | pending |
| **4** | Frontend foundation: Tailwind v4 design system, shell, routing, auth, dashboard widgets | pending |
| **5** | Frontend feature pages for every module | pending |
| **6** | SomAI: OpenAI + RAG + knowledge base + tools | pending |
| **7** | Docker, Compose, Nginx, deployment guide, S3 | pending |

Each phase is independently runnable and reviewed before the next begins.
