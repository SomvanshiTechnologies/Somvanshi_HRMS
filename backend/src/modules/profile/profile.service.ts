import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";
import type { DocumentCategory, Prisma } from "../../generated/prisma/client.js";
import { APPROVAL_FIELDS, type ApprovalField, type ProfessionalInfoInput } from "./profile.schema.js";

/** Documents every employee is expected to keep on file. */
const REQUIRED_DOCUMENTS: DocumentCategory[] = ["AADHAAR", "PAN", "RESUME", "ADDRESS_PROOF"];
const EXPIRY_WINDOW_DAYS = 60;

async function requireOwnEmployee(req: Request) {
  const employeeId = req.user?.employeeId;
  if (!employeeId) throw new ForbiddenError("No employee profile linked to this account");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!employee) throw new NotFoundError("Employee");
  return employee;
}

async function notifyHrAdmins(input: { title: string; body: string; link: string }): Promise<void> {
  const hrUsers = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["HR_ADMIN", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  await notifyMany(hrUsers.map((u) => u.id), { ...input, type: "APPROVAL" });
}

/** Server-computed completion score — weights per spec section. */
function computeCompletion(e: {
  phone: string | null;
  personalEmail: string | null;
  dateOfBirth: Date | null;
  currentAddress: string | null;
  photoUrl: string | null;
  bloodGroup: string | null;
  documents: { category: DocumentCategory; isCurrent: boolean }[];
  emergencyContacts: unknown[];
  bankDetails: unknown[];
  skills: unknown[];
  certifications: unknown[];
}): { score: number; sections: Record<string, { complete: boolean; weight: number; hint: string }> } {
  const docCategories = new Set(e.documents.filter((d) => d.isCurrent).map((d) => d.category));
  const personalDone =
    [e.phone, e.personalEmail, e.dateOfBirth, e.currentAddress, e.photoUrl, e.bloodGroup].filter(Boolean).length >= 5;
  const sections = {
    personal: { complete: personalDone, weight: 25, hint: "Photo, phone, personal email, DOB, address, blood group" },
    documents: {
      complete: REQUIRED_DOCUMENTS.every((c) => docCategories.has(c)),
      weight: 25,
      hint: `Upload ${REQUIRED_DOCUMENTS.join(", ")}`,
    },
    emergencyContacts: { complete: e.emergencyContacts.length > 0, weight: 15, hint: "Add at least one emergency contact" },
    bankDetails: { complete: e.bankDetails.length > 0, weight: 15, hint: "Add your salary account" },
    skills: { complete: e.skills.length >= 3, weight: 10, hint: "Add at least 3 skills" },
    certifications: { complete: e.certifications.length > 0, weight: 10, hint: "Add a certification (or mark N/A with HR)" },
  };
  const score = Object.values(sections).reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);
  return { score, sections };
}

export const profileService = {
  /** Full self profile incl. completion score, doc health and pending request. */
  async me(req: Request) {
    const { id: employeeId } = await requireOwnEmployee(req);
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true, level: true } },
        location: { select: { id: true, name: true, city: true } },
        manager: { select: { id: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } },
        reports: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        educations: { orderBy: { endYear: "desc" } },
        experiences: { orderBy: { startDate: "desc" } },
        certifications: { orderBy: { issuedOn: "desc" } },
        skills: { include: { skill: true } },
        documents: { where: { isCurrent: true }, orderBy: { createdAt: "desc" } },
        bankDetails: true,
        emergencyContacts: true,
        profileChangeRequests: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const completion = computeCompletion(employee);
    const docCategories = new Set(employee.documents.map((d) => d.category));
    const missingDocuments = REQUIRED_DOCUMENTS.filter((c) => !docCategories.has(c));
    const expiryCutoff = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86400000);
    const expiringDocuments = employee.documents.filter((d) => d.expiresOn && d.expiresOn <= expiryCutoff);

    return {
      ...employee,
      bankDetails: employee.bankDetails.map((b) => ({ ...b, accountNumber: `••••${b.accountNumber.slice(-4)}` })),
      completion,
      missingDocuments,
      expiringDocuments,
      pendingChangeRequest: employee.profileChangeRequests[0] ?? null,
    };
  },

  /** Professional info — applies immediately, audited. */
  async updateProfessional(req: Request, input: ProfessionalInfoInput) {
    const employee = await requireOwnEmployee(req);
    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        ...(input.languages !== undefined ? { languages: input.languages } : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
        ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
        ...(input.careerInterests !== undefined ? { careerInterests: input.careerInterests } : {}),
      },
    });
    audit({ action: "profile.professional_update", entity: "Employee", entityId: employee.id, before: employee, after: updated, req });
    return updated;
  },

  /** Profile photo — applies immediately. */
  async updatePhoto(req: Request, photoUrl: string) {
    const employee = await requireOwnEmployee(req);
    const updated = await prisma.employee.update({ where: { id: employee.id }, data: { photoUrl } });
    audit({ action: "profile.photo_update", entity: "Employee", entityId: employee.id, req });
    return { photoUrl: updated.photoUrl };
  },

  /** Personal-info changes — go through the HR approval workflow. */
  async createChangeRequest(req: Request, changes: Record<string, unknown>, isDraft: boolean) {
    const employee = await requireOwnEmployee(req);

    const existing = await prisma.profileChangeRequest.findFirst({
      where: { employeeId: employee.id, status: "PENDING", isDraft: false },
    });
    if (existing && !isDraft) {
      throw new ConflictError("You already have a change request awaiting HR review. Cancel it or wait for a decision.");
    }

    // store from→to pairs for the reviewer diff
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of Object.keys(changes) as ApprovalField[]) {
      diff[field] = { from: (employee as Record<string, unknown>)[field] ?? null, to: changes[field] ?? null };
    }

    // replace any existing draft
    await prisma.profileChangeRequest.deleteMany({ where: { employeeId: employee.id, isDraft: true, status: "PENDING" } });
    const request = await prisma.profileChangeRequest.create({
      data: { employeeId: employee.id, changes: diff as Prisma.InputJsonValue, isDraft },
    });

    if (!isDraft) {
      audit({ action: "profile.change_submitted", entity: "ProfileChangeRequest", entityId: request.id, after: diff, req });
      await notifyHrAdmins({
        title: `Profile change request from ${employee.firstName} ${employee.lastName}`,
        body: `Fields: ${Object.keys(diff).join(", ")}`,
        link: "/profile-approvals",
      });
    }
    return request;
  },

  async submitDraft(req: Request, id: string) {
    const employee = await requireOwnEmployee(req);
    const draft = await prisma.profileChangeRequest.findFirst({
      where: { id, employeeId: employee.id, isDraft: true, status: "PENDING" },
    });
    if (!draft) throw new NotFoundError("Draft change request");
    const request = await prisma.profileChangeRequest.update({
      where: { id },
      data: { isDraft: false, submittedAt: new Date() },
    });
    audit({ action: "profile.change_submitted", entity: "ProfileChangeRequest", entityId: id, req });
    await notifyHrAdmins({
      title: `Profile change request from ${employee.firstName} ${employee.lastName}`,
      body: `Fields: ${Object.keys(request.changes as object).join(", ")}`,
      link: "/profile-approvals",
    });
    return request;
  },

  async myChangeRequests(req: Request) {
    const employee = await requireOwnEmployee(req);
    return prisma.profileChangeRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },

  async cancelChangeRequest(req: Request, id: string) {
    const employee = await requireOwnEmployee(req);
    const request = await prisma.profileChangeRequest.findFirst({
      where: { id, employeeId: employee.id, status: "PENDING" },
    });
    if (!request) throw new NotFoundError("Pending change request");
    await prisma.profileChangeRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    audit({ action: "profile.change_cancelled", entity: "ProfileChangeRequest", entityId: id, req });
  },

  // ---- documents (self-service, versioned) ----

  async uploadDocument(
    req: Request,
    input: { category: DocumentCategory; name: string; expiresOn?: Date | undefined },
    file: { url: string; mimeType: string; sizeBytes: number }
  ) {
    const employee = await requireOwnEmployee(req);

    const current = await prisma.employeeDocument.findFirst({
      where: { employeeId: employee.id, category: input.category, name: input.name, isCurrent: true },
    });

    const doc = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.employeeDocument.update({ where: { id: current.id }, data: { isCurrent: false } });
      }
      return tx.employeeDocument.create({
        data: {
          employeeId: employee.id,
          category: input.category,
          name: input.name,
          fileUrl: file.url,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          expiresOn: input.expiresOn ?? null,
          version: (current?.version ?? 0) + 1,
          parentId: current?.id ?? null,
        },
      });
    });
    audit({ action: "profile.document_upload", entity: "EmployeeDocument", entityId: doc.id, after: { category: doc.category, name: doc.name, version: doc.version }, req });
    return doc;
  },

  async listDocuments(req: Request) {
    const employee = await requireOwnEmployee(req);
    const docs = await prisma.employeeDocument.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ category: "asc" }, { version: "desc" }],
    });
    // group: current + history per (category, name)
    const groups = new Map<string, { current: (typeof docs)[number]; history: typeof docs }>();
    for (const doc of docs) {
      const key = `${doc.category}:${doc.name}`;
      const group = groups.get(key);
      if (!group) groups.set(key, { current: doc, history: doc.isCurrent ? [] : [doc] });
      else if (doc.isCurrent) group.current = doc;
      else group.history.push(doc);
    }
    return [...groups.values()];
  },

  // ---- HR review ----

  async listPendingRequests(status: "PENDING" | "APPROVED" | "REJECTED") {
    return prisma.profileChangeRequest.findMany({
      where: { status, isDraft: false },
      orderBy: { submittedAt: "asc" },
      include: {
        employee: {
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true,
            department: { select: { name: true } }, designation: { select: { title: true } },
            user: { select: { id: true } },
          },
        },
      },
    });
  },

  async review(req: Request, id: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
    const request = await prisma.profileChangeRequest.findUnique({
      where: { id },
      include: { employee: { select: { id: true, firstName: true, userId: true } } },
    });
    if (!request || request.status !== "PENDING" || request.isDraft) {
      throw new NotFoundError("Pending change request");
    }
    if (request.employee.userId === req.user?.id) {
      throw new BadRequestError("You cannot review your own change request");
    }

    const diff = request.changes as Record<string, { from: unknown; to: unknown }>;

    await prisma.$transaction(async (tx) => {
      if (decision === "APPROVED") {
        const data: Prisma.EmployeeUpdateInput = {};
        for (const [field, { to }] of Object.entries(diff)) {
          if (!APPROVAL_FIELDS.includes(field as ApprovalField)) continue;
          (data as Record<string, unknown>)[field] =
            field === "dateOfBirth" && to ? new Date(to as string) : to;
        }
        await tx.employee.update({ where: { id: request.employee.id }, data });
      }
      await tx.profileChangeRequest.update({
        where: { id },
        data: { status: decision, reviewedBy: req.user!.id, reviewedAt: new Date(), reviewerRemarks: remarks ?? null },
      });
    });

    audit({
      action: decision === "APPROVED" ? "profile.change_approved" : "profile.change_rejected",
      entity: "ProfileChangeRequest", entityId: id,
      before: diff, after: { decision, remarks }, req,
    });

    if (request.employee.userId) {
      await notify({
        userId: request.employee.userId,
        type: decision === "APPROVED" ? "SUCCESS" : "WARNING",
        title: decision === "APPROVED" ? "Profile changes approved" : "Profile changes rejected",
        body: remarks ?? `Fields: ${Object.keys(diff).join(", ")}`,
        link: "/profile",
      });
    }
    return prisma.profileChangeRequest.findUnique({ where: { id } });
  },
};
