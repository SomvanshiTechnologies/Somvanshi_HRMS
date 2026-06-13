import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import {
  BankDetailSchema,
  CertificationSchema,
  EducationSchema,
  EmergencyContactSchema,
  EmployeeSkillSchema,
  ExperienceSchema,
} from "./employees.schema.js";

async function assertEmployee(employeeId: string): Promise<void> {
  const exists = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true } });
  if (!exists) throw new NotFoundError("Employee");
}

export const subresourcesService = {
  // ---- education ----
  async addEducation(employeeId: string, input: z.infer<typeof EducationSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const row = await prisma.education.create({ data: { ...input, employeeId } });
    audit({ action: "employee.education_add", entity: "Education", entityId: row.id, after: row, req });
    return row;
  },
  async updateEducation(employeeId: string, id: string, input: Partial<z.infer<typeof EducationSchema>>, req?: Request) {
    const existing = await prisma.education.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Education record");
    const row = await prisma.education.update({ where: { id }, data: input });
    audit({ action: "employee.education_update", entity: "Education", entityId: id, before: existing, after: row, req });
    return row;
  },
  async deleteEducation(employeeId: string, id: string, req?: Request): Promise<void> {
    const existing = await prisma.education.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Education record");
    await prisma.education.delete({ where: { id } });
    audit({ action: "employee.education_delete", entity: "Education", entityId: id, before: existing, req });
  },

  // ---- experience ----
  async addExperience(employeeId: string, input: z.infer<typeof ExperienceSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const row = await prisma.experience.create({ data: { ...input, employeeId } });
    audit({ action: "employee.experience_add", entity: "Experience", entityId: row.id, after: row, req });
    return row;
  },
  async updateExperience(employeeId: string, id: string, input: Partial<z.infer<typeof ExperienceSchema>>, req?: Request) {
    const existing = await prisma.experience.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Experience record");
    const row = await prisma.experience.update({ where: { id }, data: input });
    audit({ action: "employee.experience_update", entity: "Experience", entityId: id, before: existing, after: row, req });
    return row;
  },
  async deleteExperience(employeeId: string, id: string, req?: Request): Promise<void> {
    const existing = await prisma.experience.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Experience record");
    await prisma.experience.delete({ where: { id } });
    audit({ action: "employee.experience_delete", entity: "Experience", entityId: id, before: existing, req });
  },

  // ---- certifications ----
  async addCertification(employeeId: string, input: z.infer<typeof CertificationSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const row = await prisma.certification.create({ data: { ...input, employeeId } });
    audit({ action: "employee.certification_add", entity: "Certification", entityId: row.id, after: row, req });
    return row;
  },
  async deleteCertification(employeeId: string, id: string, req?: Request): Promise<void> {
    const existing = await prisma.certification.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Certification");
    await prisma.certification.delete({ where: { id } });
    audit({ action: "employee.certification_delete", entity: "Certification", entityId: id, before: existing, req });
  },

  // ---- skills ----
  async setSkill(employeeId: string, input: z.infer<typeof EmployeeSkillSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const skill = await prisma.skill.upsert({
      where: { name: input.skillName },
      create: { name: input.skillName },
      update: {},
    });
    const row = await prisma.employeeSkill.upsert({
      where: { employeeId_skillId: { employeeId, skillId: skill.id } },
      create: { employeeId, skillId: skill.id, level: input.level, yearsOfExp: input.yearsOfExp ?? null },
      update: { level: input.level, yearsOfExp: input.yearsOfExp ?? null },
      include: { skill: true },
    });
    audit({ action: "employee.skill_set", entity: "EmployeeSkill", entityId: `${employeeId}:${skill.id}`, after: row, req });
    return row;
  },
  async removeSkill(employeeId: string, skillId: string, req?: Request): Promise<void> {
    await prisma.employeeSkill.delete({ where: { employeeId_skillId: { employeeId, skillId } } }).catch(() => {
      throw new NotFoundError("Skill assignment");
    });
    audit({ action: "employee.skill_remove", entity: "EmployeeSkill", entityId: `${employeeId}:${skillId}`, req });
  },

  // ---- bank details ----
  async addBankDetail(employeeId: string, input: z.infer<typeof BankDetailSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const row = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.bankDetail.updateMany({ where: { employeeId }, data: { isPrimary: false } });
      }
      return tx.bankDetail.create({ data: { ...input, employeeId } });
    });
    audit({ action: "employee.bank_add", entity: "BankDetail", entityId: row.id, req }); // no account number in audit
    return { ...row, accountNumber: `••••${row.accountNumber.slice(-4)}` };
  },
  async updateBankDetail(employeeId: string, id: string, input: Partial<z.infer<typeof BankDetailSchema>>, req?: Request) {
    const existing = await prisma.bankDetail.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Bank detail");
    const row = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.bankDetail.updateMany({ where: { employeeId, NOT: { id } }, data: { isPrimary: false } });
      return tx.bankDetail.update({ where: { id }, data: input });
    });
    audit({ action: "employee.bank_update", entity: "BankDetail", entityId: id, req });
    return { ...row, accountNumber: `••••${row.accountNumber.slice(-4)}` };
  },
  async deleteBankDetail(employeeId: string, id: string, req?: Request): Promise<void> {
    const existing = await prisma.bankDetail.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Bank detail");
    await prisma.bankDetail.delete({ where: { id } });
    audit({ action: "employee.bank_delete", entity: "BankDetail", entityId: id, req });
  },

  // ---- emergency contacts ----
  async addEmergencyContact(employeeId: string, input: z.infer<typeof EmergencyContactSchema>, req?: Request) {
    await assertEmployee(employeeId);
    const row = await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.emergencyContact.updateMany({ where: { employeeId }, data: { isPrimary: false } });
      }
      return tx.emergencyContact.create({ data: { ...input, employeeId } });
    });
    audit({ action: "employee.emergency_add", entity: "EmergencyContact", entityId: row.id, after: row, req });
    return row;
  },
  async deleteEmergencyContact(employeeId: string, id: string, req?: Request): Promise<void> {
    const existing = await prisma.emergencyContact.findFirst({ where: { id, employeeId } });
    if (!existing) throw new NotFoundError("Emergency contact");
    await prisma.emergencyContact.delete({ where: { id } });
    audit({ action: "employee.emergency_delete", entity: "EmergencyContact", entityId: id, before: existing, req });
  },
};
