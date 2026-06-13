import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import type {
  CreateBandInput,
  CreateDepartmentInput,
  CreateDesignationInput,
  CreateLocationInput,
  UpdateDepartmentInput,
  UpdateDesignationInput,
  UpdateLocationInput,
  UpsertCompanyInput,
} from "./org.schema.js";

/** Single-tenant install: the one company row (created by seed). */
export async function getCompanyId(): Promise<string> {
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new BadRequestError("Company not configured — run the seed");
  return company.id;
}

export const orgService = {
  async getCompany() {
    const company = await prisma.company.findFirst();
    if (!company) throw new NotFoundError("Company");
    return company;
  },

  async updateCompany(input: UpsertCompanyInput, req?: Request) {
    const company = await prisma.company.findFirst();
    if (!company) throw new NotFoundError("Company");
    const updated = await prisma.company.update({ where: { id: company.id }, data: input });
    audit({ action: "org.company_update", entity: "Company", entityId: company.id, before: company, after: updated, req });
    return updated;
  },

  // ---- locations ----
  async listLocations() {
    return prisma.location.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { employees: true } } },
    });
  },

  async createLocation(input: CreateLocationInput, req?: Request) {
    const companyId = await getCompanyId();
    const location = await prisma.location.create({ data: { ...input, companyId } });
    audit({ action: "org.location_create", entity: "Location", entityId: location.id, after: location, req });
    return location;
  },

  async updateLocation(id: string, input: UpdateLocationInput, req?: Request) {
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Location");
    const updated = await prisma.location.update({ where: { id }, data: input });
    audit({ action: "org.location_update", entity: "Location", entityId: id, before: existing, after: updated, req });
    return updated;
  },

  async deleteLocation(id: string, req?: Request): Promise<void> {
    const inUse = await prisma.employee.count({ where: { locationId: id } });
    if (inUse > 0) throw new BadRequestError(`Location has ${inUse} employees — move them first`);
    await prisma.location.delete({ where: { id } });
    audit({ action: "org.location_delete", entity: "Location", entityId: id, req });
  },

  // ---- departments ----
  async listDepartments() {
    return prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { employees: true, children: true } },
      },
    });
  },

  async createDepartment(input: CreateDepartmentInput, req?: Request) {
    const companyId = await getCompanyId();
    const codeTaken = await prisma.department.findUnique({ where: { code: input.code } });
    if (codeTaken) throw new ConflictError(`A department with code "${input.code}" already exists`);
    const dept = await prisma.department.create({ data: { ...input, companyId } });
    audit({ action: "org.department_create", entity: "Department", entityId: dept.id, after: dept, req });
    return dept;
  },

  async updateDepartment(id: string, input: UpdateDepartmentInput, req?: Request) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Department");
    if (input.parentId === id) throw new BadRequestError("A department cannot be its own parent");
    const updated = await prisma.department.update({ where: { id }, data: input });
    audit({ action: "org.department_update", entity: "Department", entityId: id, before: existing, after: updated, req });
    return updated;
  },

  async deleteDepartment(id: string, req?: Request): Promise<void> {
    const counts = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, children: true } } },
    });
    if (!counts) throw new NotFoundError("Department");
    if (counts._count.employees > 0 || counts._count.children > 0) {
      throw new BadRequestError("Department has employees or sub-departments — move them first");
    }
    await prisma.department.delete({ where: { id } });
    audit({ action: "org.department_delete", entity: "Department", entityId: id, req });
  },

  // ---- designations ----
  async listDesignations() {
    return prisma.designation.findMany({
      orderBy: [{ level: "asc" }, { title: "asc" }],
      include: { band: true, _count: { select: { employees: true } } },
    });
  },

  async createDesignation(input: CreateDesignationInput, req?: Request) {
    const companyId = await getCompanyId();
    const designation = await prisma.designation.create({ data: { ...input, companyId } });
    audit({ action: "org.designation_create", entity: "Designation", entityId: designation.id, after: designation, req });
    return designation;
  },

  async updateDesignation(id: string, input: UpdateDesignationInput, req?: Request) {
    const existing = await prisma.designation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Designation");
    const updated = await prisma.designation.update({ where: { id }, data: input });
    audit({ action: "org.designation_update", entity: "Designation", entityId: id, before: existing, after: updated, req });
    return updated;
  },

  async deleteDesignation(id: string, req?: Request): Promise<void> {
    const inUse = await prisma.employee.count({ where: { designationId: id } });
    if (inUse > 0) throw new BadRequestError(`Designation has ${inUse} employees — reassign them first`);
    await prisma.designation.delete({ where: { id } });
    audit({ action: "org.designation_delete", entity: "Designation", entityId: id, req });
  },

  // ---- bands ----
  async listBands() {
    return prisma.band.findMany({ orderBy: { name: "asc" } });
  },

  async createBand(input: CreateBandInput, req?: Request) {
    const companyId = await getCompanyId();
    const band = await prisma.band.create({ data: { ...input, companyId } });
    audit({ action: "org.band_create", entity: "Band", entityId: band.id, after: band, req });
    return band;
  },
};
