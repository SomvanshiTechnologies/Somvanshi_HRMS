import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from "../../core/errors.js";
import { buildMeta, type PageMeta } from "../../core/http.js";
import { toSkipTake, safeOrderBy } from "../../shared/pagination.js";
import { audit } from "../audit/audit.service.js";
import { mailService } from "../notifications/mail.service.js";
import { decryptSafe } from "../../core/fieldCrypto.js";
import { getCompanyId } from "../org/org.service.js";
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  LifecycleTransitionInput,
  UpdateEmployeeInput,
} from "./employees.schema.js";
import type { Prisma, EmployeeStatus } from "../../generated/prisma/client.js";

/** Row visibility, resolved by the controller from the caller's permissions. */
export type EmployeeScope =
  | { kind: "all" }
  | { kind: "team"; managerEmployeeId: string } // reporting line (direct + indirect)
  | { kind: "department"; departmentId: string }
  | { kind: "self"; employeeId: string };

const LIST_SELECT = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  displayName: true,
  email: true,
  phone: true,
  photoUrl: true,
  status: true,
  employmentType: true,
  dateOfJoining: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EmployeeSelect;

/** Collect a manager's full reporting line (BFS over managerId). */
async function reportingLineIds(managerEmployeeId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [managerEmployeeId];
  while (frontier.length) {
    const reports = await prisma.employee.findMany({
      where: { managerId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    frontier = reports.map((r) => r.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

async function scopeWhere(scope: EmployeeScope): Promise<Prisma.EmployeeWhereInput> {
  switch (scope.kind) {
    case "all":
      return {};
    case "team":
      return { id: { in: [...(await reportingLineIds(scope.managerEmployeeId)), scope.managerEmployeeId] } };
    case "department":
      return { departmentId: scope.departmentId };
    case "self":
      return { id: scope.employeeId };
  }
}

async function nextEmployeeCode(): Promise<string> {
  const last = await prisma.employee.findFirst({
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });
  const lastNum = last ? parseInt(last.employeeCode.replace(/\D/g, ""), 10) : 0;
  return `SOM-${String(lastNum + 1).padStart(4, "0")}`;
}

const VALID_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  CANDIDATE: ["ONBOARDING", "TERMINATED"],
  ONBOARDING: ["PROBATION", "ACTIVE", "TERMINATED"],
  PROBATION: ["ACTIVE", "TERMINATED", "RESIGNED"],
  ACTIVE: ["RESIGNED", "TERMINATED"],
  RESIGNED: ["ALUMNI", "ACTIVE"], // ACTIVE = resignation retracted
  TERMINATED: ["ALUMNI"],
  ALUMNI: ["ONBOARDING"], // rehire
};

export const employeesService = {
  async list(query: EmployeeListQuery, scope: EmployeeScope): Promise<{ data: unknown[]; meta: PageMeta }> {
    const { skip, take } = toSkipTake(query);
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...(await scopeWhere(scope)),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.designationId ? { designationId: query.designationId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search } },
              { lastName: { contains: query.search } },
              { email: { contains: query.search } },
              { employeeCode: { contains: query.search } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const orderBy = safeOrderBy(
      query.sort,
      query.order,
      ["firstName", "lastName", "employeeCode", "dateOfJoining", "createdAt", "status"] as const,
      "createdAt"
    );

    const [rows, total] = await prisma.$transaction([
      prisma.employee.findMany({ where, select: LIST_SELECT, orderBy, skip, take }),
      prisma.employee.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(query.page, query.limit, total) };
  },

  async getById(id: string, scope: EmployeeScope) {
    const where = { id, deletedAt: null, AND: [await scopeWhere(scope)] };
    const employee = await prisma.employee.findFirst({
      where,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true, level: true } },
        location: { select: { id: true, name: true, city: true } },
        manager: { select: { id: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } },
        reports: {
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } },
        },
        educations: { orderBy: { endYear: "desc" } },
        experiences: { orderBy: { startDate: "desc" } },
        certifications: { orderBy: { issuedOn: "desc" } },
        skills: { include: { skill: true } },
        documents: { orderBy: { createdAt: "desc" } },
        bankDetails: true,
        emergencyContacts: true,
        user: { select: { id: true, email: true, status: true, twoFactorEnabled: true, lastLoginAt: true, roles: { select: { role: { select: { id: true, name: true, displayName: true } } } } } },
      },
    });
    if (!employee) throw new NotFoundError("Employee");
    // mask bank account numbers — full value only via dedicated endpoint+permission
    return {
      ...employee,
      bankDetails: employee.bankDetails.map((b) => ({ ...b, accountNumber: `••••${(decryptSafe(b.accountNumber) ?? "").slice(-4)}` })),
    };
  },

  async create(input: CreateEmployeeInput, req?: Request) {
    const companyId = await getCompanyId();
    const exists = await prisma.employee.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictError("An employee with this email already exists");

    const { createLoginAccount, employeeCode: requestedCode, ...data } = input;
    let employeeCode: string;
    if (requestedCode) {
      const codeTaken = await prisma.employee.findUnique({ where: { employeeCode: requestedCode } });
      if (codeTaken) throw new ConflictError(`Employee code ${requestedCode} is already in use`);
      employeeCode = requestedCode;
    } else {
      employeeCode = await nextEmployeeCode();
    }

    let tempPassword: string | null = null;
    const employee = await prisma.$transaction(async (tx) => {
      let userId: string | null = null;
      if (createLoginAccount) {
        tempPassword = `Som@${crypto.randomBytes(4).toString("hex")}`;
        const employeeRole = await tx.role.findUnique({ where: { name: "EMPLOYEE" } });
        if (!employeeRole) throw new BadRequestError("EMPLOYEE role missing — run the seed");
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: await bcrypt.hash(tempPassword, 12),
            status: "ACTIVE",
            roles: { create: [{ roleId: employeeRole.id }] },
          },
        });
        userId = user.id;
      }

      const created = await tx.employee.create({
        data: {
          ...data,
          companyId,
          employeeCode,
          userId,
          displayName: `${input.firstName} ${input.lastName}`,
        },
      });

      await tx.employmentEvent.create({
        data: {
          employeeId: created.id,
          type: "CREATED",
          toValue: { status: created.status },
          effectiveOn: input.dateOfJoining ?? new Date(),
          remarks: "Employee record created",
          createdBy: req?.user?.id ?? null,
        },
      });
      return created;
    });

    if (tempPassword) {
      await mailService.sendWelcome(input.email, input.firstName, tempPassword);
    }
    audit({ action: "employee.create", entity: "Employee", entityId: employee.id, after: employee, req });
    return employee;
  },

  async update(id: string, input: UpdateEmployeeInput, scope: EmployeeScope, req?: Request) {
    const existing = await prisma.employee.findFirst({ where: { id, deletedAt: null, AND: [await scopeWhere(scope)] } });
    if (!existing) throw new NotFoundError("Employee");
    if (input.managerId === id) throw new BadRequestError("An employee cannot be their own manager");

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...input,
        ...(input.firstName || input.lastName
          ? { displayName: `${input.firstName ?? existing.firstName} ${input.lastName ?? existing.lastName}` }
          : {}),
      },
    });

    // material org changes land on the timeline
    const orgChanged =
      (input.departmentId !== undefined && input.departmentId !== existing.departmentId) ||
      (input.designationId !== undefined && input.designationId !== existing.designationId) ||
      (input.managerId !== undefined && input.managerId !== existing.managerId);
    if (orgChanged) {
      await prisma.employmentEvent.create({
        data: {
          employeeId: id,
          type: "ORG_CHANGE",
          fromValue: { departmentId: existing.departmentId, designationId: existing.designationId, managerId: existing.managerId },
          toValue: { departmentId: updated.departmentId, designationId: updated.designationId, managerId: updated.managerId },
          effectiveOn: new Date(),
          createdBy: req?.user?.id ?? null,
        },
      });
    }

    audit({ action: "employee.update", entity: "Employee", entityId: id, before: existing, after: updated, req });
    return updated;
  },

  async softDelete(id: string, req?: Request): Promise<void> {
    const existing = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Employee");
    await prisma.$transaction([
      prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } }),
      ...(existing.userId
        ? [prisma.user.update({ where: { id: existing.userId }, data: { status: "DEACTIVATED" } })]
        : []),
    ]);
    audit({ action: "employee.delete", entity: "Employee", entityId: id, before: existing, req });
  },

  async transition(id: string, input: LifecycleTransitionInput, req?: Request) {
    const existing = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Employee");

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(input.status)) {
      throw new BadRequestError(
        `Invalid lifecycle transition ${existing.status} → ${input.status}. Allowed: ${allowed.join(", ")}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === "ACTIVE" && existing.status === "PROBATION" ? { confirmedAt: input.effectiveOn } : {}),
          ...(["RESIGNED", "TERMINATED", "ALUMNI"].includes(input.status) ? { exitedAt: input.effectiveOn } : {}),
        },
      });
      await tx.employmentEvent.create({
        data: {
          employeeId: id,
          type: "STATUS_CHANGE",
          fromValue: { status: existing.status },
          toValue: { status: input.status },
          effectiveOn: input.effectiveOn,
          remarks: input.remarks ?? null,
          createdBy: req?.user?.id ?? null,
        },
      });
      // exits also deactivate the login
      if (["TERMINATED", "ALUMNI"].includes(input.status) && existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { status: "DEACTIVATED" } });
      }
      return emp;
    });

    audit({ action: "employee.lifecycle", entity: "Employee", entityId: id, before: { status: existing.status }, after: { status: input.status }, req });
    return updated;
  },

  async timeline(id: string, scope: EmployeeScope) {
    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null, AND: [await scopeWhere(scope)] }, select: { id: true } });
    if (!employee) throw new NotFoundError("Employee");
    return prisma.employmentEvent.findMany({ where: { employeeId: id }, orderBy: { effectiveOn: "desc" } });
  },

  /** Whole-org chart: roots = employees without managers. */
  async orgChart() {
    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ["ONBOARDING", "PROBATION", "ACTIVE"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        managerId: true,
        designation: { select: { title: true } },
        department: { select: { id: true, name: true } },
      },
    });
    type Node = (typeof employees)[number] & { children: Node[] };
    const byId = new Map<string, Node>(employees.map((e) => [e.id, { ...e, children: [] }]));
    const roots: Node[] = [];
    for (const node of byId.values()) {
      if (node.managerId && byId.has(node.managerId)) byId.get(node.managerId)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  },

  /** CSV export of the (scoped, filtered) employee list. */
  async exportCsv(query: EmployeeListQuery, scope: EmployeeScope): Promise<string> {
    const { data } = await this.list({ ...query, page: 1, limit: 100 }, scope);
    // fetch everything matching, not just one page
    const all: typeof data = [];
    let page = 1;
    let batch = data;
    while (batch.length) {
      all.push(...batch);
      page += 1;
      const next = await this.list({ ...query, page, limit: 100 }, scope);
      batch = next.data;
      if (all.length >= next.meta.total) break;
    }
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Code", "First Name", "Last Name", "Email", "Phone", "Status", "Type", "Department", "Designation", "Location", "Manager", "Joined"];
    const lines = (all as Array<Record<string, any>>).map((e) =>
      [
        e["employeeCode"], e["firstName"], e["lastName"], e["email"], e["phone"],
        e["status"], e["employmentType"], e["department"]?.name, e["designation"]?.title,
        e["location"]?.name,
        e["manager"] ? `${e["manager"].firstName} ${e["manager"].lastName}` : "",
        e["dateOfJoining"] ? new Date(e["dateOfJoining"]).toISOString().slice(0, 10) : "",
      ].map(esc).join(",")
    );
    return [header.map(esc).join(","), ...lines].join("\r\n");
  },

  /** Guard helper: employees may edit only their own sub-resources unless privileged. */
  assertSelfOrPrivileged(targetEmployeeId: string, req: Request, privileged: boolean): void {
    if (!privileged && req.user?.employeeId !== targetEmployeeId) {
      throw new ForbiddenError("You can only modify your own profile");
    }
  },
};
