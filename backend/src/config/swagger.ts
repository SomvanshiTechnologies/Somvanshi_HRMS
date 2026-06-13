import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./env.js";

/**
 * OpenAPI 3.1 document. Each module appends its paths here as it ships —
 * Phase 1: auth, rbac, org, employees, analytics, notifications, audit.
 */
const securityScheme = { bearerAuth: [] as string[] };

const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
  { name: "search", in: "query", schema: { type: "string" } },
  { name: "sort", in: "query", schema: { type: "string" } },
  { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Somvanshi HRMS API",
    version: "1.0.0",
    description:
      "Enterprise HRMS by **Somvanshi Technologies** — *People. Performance. Growth.*\n\n" +
      "All endpoints require `Authorization: Bearer <accessToken>` unless marked public. " +
      "Authorization is database-driven RBAC; the permission required by each route is noted in its description.",
  },
  servers: [{ url: env.API_PREFIX }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
          },
        },
      },
    },
  },
  security: [securityScheme],
  tags: [
    { name: "Auth" }, { name: "RBAC" }, { name: "Org" }, { name: "Employees" },
    { name: "Analytics" }, { name: "Notifications" }, { name: "Audit" },
  ],
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"], security: [], summary: "Login (public, rate-limited)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" }, deviceFingerprint: { type: "string" }, deviceName: { type: "string" } } } } } },
        responses: { "200": { description: "Tokens + user, or a 2FA challenge" }, "401": { description: "Invalid credentials / locked" } },
      },
    },
    "/auth/login/2fa": { post: { tags: ["Auth"], security: [], summary: "Complete 2FA login with TOTP or recovery code", responses: { "200": { description: "Tokens + user" } } } },
    "/auth/refresh": { post: { tags: ["Auth"], security: [], summary: "Rotate refresh token (cookie or body)", responses: { "200": { description: "New access token" } } } },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Revoke session + refresh tokens", responses: { "204": { description: "Logged out" } } } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Current user, roles, employee profile and effective permission set (drives the permission-aware UI)", responses: { "200": { description: "Profile" } } } },
    "/auth/forgot-password": { post: { tags: ["Auth"], security: [], summary: "Send password-reset email (no user enumeration)", responses: { "200": { description: "Always 200" } } } },
    "/auth/reset-password": { post: { tags: ["Auth"], security: [], summary: "Reset password with emailed token", responses: { "200": { description: "Password updated" } } } },
    "/auth/change-password": { post: { tags: ["Auth"], summary: "Change own password (live session required)", responses: { "200": { description: "Changed" } } } },
    "/auth/2fa/setup": { post: { tags: ["Auth"], summary: "Begin TOTP enrolment — returns otpauth:// URL", responses: { "200": { description: "Secret + QR URL" } } } },
    "/auth/2fa/verify": { post: { tags: ["Auth"], summary: "Verify TOTP code, enable 2FA, return recovery codes (once)", responses: { "200": { description: "Enabled" } } } },
    "/auth/2fa": { delete: { tags: ["Auth"], summary: "Disable 2FA (TOTP code required)", responses: { "200": { description: "Disabled" } } } },
    "/auth/sessions": { get: { tags: ["Auth"], summary: "List active sessions/devices", responses: { "200": { description: "Sessions" } } } },
    "/auth/sessions/{id}": { delete: { tags: ["Auth"], summary: "Revoke a session", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Revoked" } } } },
    "/auth/devices": { get: { tags: ["Auth"], summary: "List known devices", responses: { "200": { description: "Devices" } } } },

    "/rbac/roles": {
      get: { tags: ["RBAC"], summary: "List roles with permission sets — requires roles:read", responses: { "200": { description: "Roles" } } },
      post: { tags: ["RBAC"], summary: "Create role — requires roles:manage", responses: { "201": { description: "Created" } } },
    },
    "/rbac/permissions": { get: { tags: ["RBAC"], summary: "Permission catalog grouped by module — requires roles:read", responses: { "200": { description: "Catalog" } } } },
    "/rbac/roles/{id}/permissions": { put: { tags: ["RBAC"], summary: "Replace a role's permissions — requires roles:manage", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } } },
    "/rbac/users/{id}/roles": { put: { tags: ["RBAC"], summary: "Replace a user's roles — requires roles:manage", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Updated" } } } },

    "/org/company": { get: { tags: ["Org"], summary: "Company profile — org:read", responses: { "200": { description: "Company" } } }, put: { tags: ["Org"], summary: "Update company — org:manage", responses: { "200": { description: "Updated" } } } },
    "/org/departments": { get: { tags: ["Org"], summary: "Departments with heads and headcounts — org:read", responses: { "200": { description: "Departments" } } }, post: { tags: ["Org"], summary: "Create — org:manage", responses: { "201": { description: "Created" } } } },
    "/org/designations": { get: { tags: ["Org"], summary: "Designations — org:read", responses: { "200": { description: "Designations" } } }, post: { tags: ["Org"], summary: "Create — org:manage", responses: { "201": { description: "Created" } } } },
    "/org/locations": { get: { tags: ["Org"], summary: "Locations — org:read", responses: { "200": { description: "Locations" } } }, post: { tags: ["Org"], summary: "Create — org:manage", responses: { "201": { description: "Created" } } } },

    "/employees": {
      get: { tags: ["Employees"], summary: "List (paginated, scoped by role: all/department/team/self) — employees:read", parameters: [...pageParams, { name: "status", in: "query", schema: { type: "string" } }, { name: "departmentId", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Page of employees" } } },
      post: { tags: ["Employees"], summary: "Create employee (optionally provisions login + welcome mail) — employees:create", responses: { "201": { description: "Created" } } },
    },
    "/employees/{id}": {
      get: { tags: ["Employees"], summary: "Full profile with all sections — employees:read (scoped)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Employee" }, "404": { description: "Not found / out of scope" } } },
      patch: { tags: ["Employees"], summary: "Update — employees:update", responses: { "200": { description: "Updated" } } },
      delete: { tags: ["Employees"], summary: "Soft delete — employees:delete", responses: { "204": { description: "Deleted" } } },
    },
    "/employees/{id}/lifecycle": { post: { tags: ["Employees"], summary: "Lifecycle transition (state machine enforced) — employees:manage", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Transitioned" } } } },
    "/employees/{id}/timeline": { get: { tags: ["Employees"], summary: "Employment events timeline", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Events" } } } },
    "/employees/org-chart": { get: { tags: ["Employees"], summary: "Org chart tree (active employees)", responses: { "200": { description: "Tree" } } } },
    "/employees/export": { get: { tags: ["Employees"], summary: "CSV export — employees:export", responses: { "200": { description: "text/csv" } } } },

    "/analytics/overview": { get: { tags: ["Analytics"], summary: "All dashboard KPIs (live aggregates) — analytics:read", responses: { "200": { description: "KPI bundle" } } } },
    "/analytics/headcount-trend": { get: { tags: ["Analytics"], summary: "Monthly headcount/joiners/exits", parameters: [{ name: "months", in: "query", schema: { type: "integer", default: 12 } }], responses: { "200": { description: "Series" } } } },
    "/analytics/hiring-trend": { get: { tags: ["Analytics"], summary: "Applications/offers/joins per month", responses: { "200": { description: "Series" } } } },
    "/analytics/payroll-trend": { get: { tags: ["Analytics"], summary: "Payroll cost per month — payroll:read_all", responses: { "200": { description: "Series" } } } },
    "/analytics/attrition-trend": { get: { tags: ["Analytics"], summary: "Exits + attrition % per month", responses: { "200": { description: "Series" } } } },
    "/analytics/department": { get: { tags: ["Analytics"], summary: "Per-department composition", responses: { "200": { description: "Departments" } } } },

    "/notifications": { get: { tags: ["Notifications"], summary: "My notifications (paginated)", parameters: pageParams, responses: { "200": { description: "Page" } } } },
    "/notifications/read-all": { patch: { tags: ["Notifications"], summary: "Mark all read", responses: { "200": { description: "OK" } } } },

    "/audit": { get: { tags: ["Audit"], summary: "Audit trail — audit:read_all", parameters: [...pageParams, { name: "entity", in: "query", schema: { type: "string" } }, { name: "action", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Page" } } } },
  },
} as const;

export function mountSwagger(app: Express): void {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument as object, {
    customSiteTitle: "SomHR API Docs",
  }));
}
