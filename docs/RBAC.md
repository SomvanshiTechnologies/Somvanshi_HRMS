# SomHR — RBAC Design (Database-Driven)

Permissions are **rows, not code branches**. The `rbac` middleware resolves a user's effective
permission set (union of all assigned roles' permissions, cached in Redis, invalidated on role
change) and checks it against the permission code declared on each route.

## Permission code format

```
<module>:<action>
```

Actions: `read` `read_all` `create` `update` `delete` `approve` `assign` `export` `run` `manage`

- `read` = own/self-scoped data (e.g. my payslips)
- `read_all` = org-wide data (e.g. all payslips)
- `manage` = full module administration (implies all others within the module)

## Permission catalog (seeded)

| Module | Permissions |
|---|---|
| `users` | read, read_all, create, update, delete, manage |
| `roles` | read, manage |
| `org` | read, manage (departments, designations, locations, bands) |
| `employees` | read, read_all, create, update, delete, export, manage |
| `recruitment` | read, create, update, approve, manage |
| `onboarding` | read, create, update, manage |
| `attendance` | read, read_all, create (punch), update, approve (corrections/OT), export, manage (shifts) |
| `leave` | read, read_all, create, approve, manage (types/policies/holidays) |
| `payroll` | read (own payslips), read_all, run, approve, export, manage (structures/components) |
| `performance` | read, read_all, create, update, approve, manage (cycles) |
| `assets` | read, read_all, assign, manage |
| `helpdesk` | read, create, update, assign, manage |
| `expense` | read, read_all, create, approve, manage |
| `exit` | read, read_all, create, approve, manage |
| `analytics` | read (team), read_all (org-wide) |
| `notifications` | read |
| `ai` | use, manage (knowledge base) |
| `audit` | read_all |
| `settings` | manage |

## Role → permission matrix (seed defaults; editable at runtime by Super Admin)

| Module:Action | Super Admin | HR Admin | HR Exec | Recruiter | Finance Mgr | Dept Head | Manager | Team Lead | Employee |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| users:manage | ✅ | — | — | — | — | — | — | — | — |
| roles:manage | ✅ | — | — | — | — | — | — | — | — |
| org:manage | ✅ | ✅ | — | — | — | — | — | — | — |
| employees:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| employees:read_all | ✅ | ✅ | ✅ | ✅ | ✅ | dept | team | team | — |
| employees:create/update | ✅ | ✅ | ✅ | — | — | — | — | — | self-limited |
| employees:delete | ✅ | ✅ | — | — | — | — | — | — | — |
| recruitment:manage | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| recruitment:approve | ✅ | ✅ | — | — | budget | ✅ | — | — | — |
| onboarding:manage | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| attendance:create (punch) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| attendance:approve | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | — |
| attendance:manage (shifts) | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| leave:create | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| leave:approve | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | — |
| leave:manage | ✅ | ✅ | — | — | — | — | — | — | — |
| payroll:read (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| payroll:read_all | ✅ | ✅ | — | — | ✅ | — | — | — | — |
| payroll:run / approve | ✅ | run | — | — | ✅ | — | — | — | — |
| payroll:manage | ✅ | ✅ | — | — | ✅ | — | — | — | — |
| performance:approve | ✅ | ✅ | — | — | — | ✅ | ✅ | ✅ | — |
| performance:manage (cycles) | ✅ | ✅ | — | — | — | — | — | — | — |
| assets:assign / manage | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| helpdesk:create | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| helpdesk:assign/manage | ✅ | ✅ | ✅ | — | dept | — | — | — | — |
| expense:create | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| expense:approve | ✅ | — | — | — | ✅ | ✅ | ✅ | — | — |
| exit:approve / manage | ✅ | ✅ | ✅ | — | FNF | accept | accept | — | — |
| analytics:read (team) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| analytics:read_all | ✅ | ✅ | — | hiring | payroll | dept | — | — | — |
| ai:use | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ai:manage (KB) | ✅ | ✅ | — | — | — | — | — | — | — |
| audit:read_all | ✅ | ✅ | — | — | — | — | — | — | — |
| settings:manage | ✅ | — | — | — | — | — | — | — | — |

Notes
- "dept"/"team" = permission granted but **row-scoped** by the service layer (department or
  reporting-line filter). Scoping is enforced server-side, never in the UI.
- SomAI inherits the caller's permission set — every AI tool call passes through the same
  service layer + RBAC scope as the REST API.
- Account locking: 5 failed logins → `LOCKED` with exponential `lockedUntil`.
