import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notifyMany } from "../notifications/notifications.service.js";
import type { ApplicationStage, Prisma } from "../../generated/prisma/client.js";

export const STAGES: ApplicationStage[] = ["APPLIED", "SCREENING", "TECHNICAL", "MANAGERIAL", "HR", "OFFER", "JOINED"];

const CANDIDATE_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true,
  currentCompany: true, currentTitle: true, totalExperience: true, expectedCtc: true,
  noticePeriodDays: true, location: true, source: true, skills: true,
  resumes: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, fileUrl: true, fileName: true } },
} satisfies Prisma.CandidateSelect;

async function notifyRecruiters(title: string, body: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["RECRUITER", "HR_ADMIN"] } } } } },
    select: { id: true },
  });
  await notifyMany(users.map((u) => u.id), { type: "INFO", title, body, link: "/jobs" });
}

export const recruitmentService = {
  /* ---------- requisitions ---------- */

  async listRequisitions() {
    return prisma.jobRequisition.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        department: { select: { id: true, name: true } },
        raisedBy: { select: { id: true, firstName: true, lastName: true } },
        postings: { select: { id: true, publishedAt: true, _count: { select: { applications: true } } } },
      },
    });
  },

  async createRequisition(req: Request, input: {
    title: string; departmentId: string; headcount: number; employmentType?: string;
    minExperience?: number; maxExperience?: number; description?: string; skillsRequired?: string[];
  }) {
    if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
    const requisition = await prisma.jobRequisition.create({
      data: {
        companyId: (await prisma.company.findFirstOrThrow()).id,
        title: input.title,
        departmentId: input.departmentId,
        raisedById: req.user.employeeId,
        headcount: input.headcount,
        employmentType: (input.employmentType as never) ?? "FULL_TIME",
        minExperience: input.minExperience ?? null,
        maxExperience: input.maxExperience ?? null,
        description: input.description ?? null,
        skillsRequired: input.skillsRequired ?? [],
        status: "PENDING_APPROVAL",
      },
    });
    audit({ action: "recruitment.requisition_create", entity: "JobRequisition", entityId: requisition.id, after: requisition, req });
    return requisition;
  },

  async decideRequisition(req: Request, id: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
    const requisition = await prisma.jobRequisition.findUnique({ where: { id } });
    if (!requisition || requisition.status !== "PENDING_APPROVAL") throw new NotFoundError("Pending requisition");
    const updated = await prisma.jobRequisition.update({
      where: { id },
      data: decision === "APPROVED" ? { status: "OPEN", openedAt: new Date() } : { status: "REJECTED" },
    });
    await prisma.requisitionApproval.create({
      data: { requisitionId: id, approverId: req.user!.id, status: decision, remarks: remarks ?? null, actedAt: new Date() },
    });
    audit({ action: `recruitment.requisition_${decision.toLowerCase()}`, entity: "JobRequisition", entityId: id, req });
    if (decision === "APPROVED") await notifyRecruiters("Requisition approved", `${requisition.title} is open for hiring.`);
    return updated;
  },

  /* ---------- postings ---------- */

  async publishPosting(req: Request, requisitionId: string, input: { description: string; location?: string; isRemote?: boolean }) {
    const requisition = await prisma.jobRequisition.findUnique({ where: { id: requisitionId } });
    if (!requisition) throw new NotFoundError("Requisition");
    if (requisition.status !== "OPEN") throw new BadRequestError("Requisition must be approved/open before posting");
    const posting = await prisma.jobPosting.create({
      data: {
        requisitionId,
        title: requisition.title,
        description: input.description,
        location: input.location ?? null,
        isRemote: input.isRemote ?? false,
        publishedAt: new Date(),
      },
    });
    audit({ action: "recruitment.posting_publish", entity: "JobPosting", entityId: posting.id, req });
    return posting;
  },

  async listPostings() {
    return prisma.jobPosting.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        requisition: { select: { id: true, headcount: true, status: true, department: { select: { name: true } } } },
        _count: { select: { applications: true } },
      },
    });
  },

  /* ---------- candidates & pipeline ---------- */

  async createCandidate(req: Request, input: {
    firstName: string; lastName: string; email: string; phone?: string;
    currentCompany?: string; currentTitle?: string; totalExperience?: number;
    expectedCtc?: number; noticePeriodDays?: number; location?: string;
    source?: string; skills?: string[]; postingId?: string;
  }) {
    const { postingId, ...data } = input;
    const candidate = await prisma.candidate.upsert({
      where: { email: input.email },
      create: { ...data, skills: data.skills ?? [] },
      update: { ...data, skills: data.skills ?? [] },
    });
    if (postingId) {
      await prisma.application.upsert({
        where: { postingId_candidateId: { postingId, candidateId: candidate.id } },
        create: { postingId, candidateId: candidate.id },
        update: {},
      });
    }
    audit({ action: "recruitment.candidate_create", entity: "Candidate", entityId: candidate.id, req });
    return candidate;
  },

  async attachResume(req: Request, candidateId: string, file: { url: string; name: string }) {
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundError("Candidate");
    const resume = await prisma.resume.create({
      data: { candidateId, fileUrl: file.url, fileName: file.name },
    });
    audit({ action: "recruitment.resume_upload", entity: "Resume", entityId: resume.id, req });
    return resume;
  },

  /** Kanban: applications grouped by stage (optionally per posting). */
  async pipeline(postingId?: string) {
    const applications = await prisma.application.findMany({
      where: { ...(postingId ? { postingId } : {}), stage: { not: "WITHDRAWN" } },
      orderBy: { stageUpdatedAt: "desc" },
      include: {
        candidate: { select: CANDIDATE_SELECT },
        posting: { select: { id: true, title: true } },
        scores: { orderBy: { createdAt: "desc" }, take: 1, select: { overallScore: true } },
        interviews: { orderBy: { scheduledAt: "desc" }, take: 1, select: { round: true, status: true, scheduledAt: true } },
        offers: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, annualCtc: true } },
      },
    });
    const columns = STAGES.map((stage) => ({
      stage,
      applications: applications.filter((a) => a.stage === stage),
    }));
    const rejected = applications.filter((a) => a.stage === "REJECTED");
    return { columns, rejected };
  },

  async moveStage(req: Request, applicationId: string, stage: ApplicationStage, rejectionReason?: string) {
    const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { candidate: true } });
    if (!application) throw new NotFoundError("Application");
    if (application.stage === stage) return application;
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        stage,
        stageUpdatedAt: new Date(),
        ...(stage === "REJECTED" ? { rejectionReason: rejectionReason ?? null } : {}),
      },
    });
    audit({
      action: "recruitment.stage_move", entity: "Application", entityId: applicationId,
      before: { stage: application.stage }, after: { stage }, req,
    });
    return updated;
  },

  /* ---------- interviews ---------- */

  async scheduleInterview(req: Request, input: {
    applicationId: string; round: string; scheduledAt: Date; durationMins?: number;
    mode?: "IN_PERSON" | "VIDEO" | "PHONE"; meetingLink?: string; panelEmployeeIds: string[];
  }) {
    const application = await prisma.application.findUnique({ where: { id: input.applicationId }, include: { candidate: true } });
    if (!application) throw new NotFoundError("Application");
    const interview = await prisma.interview.create({
      data: {
        applicationId: input.applicationId,
        round: input.round,
        scheduledAt: input.scheduledAt,
        durationMins: input.durationMins ?? 60,
        mode: input.mode ?? "VIDEO",
        meetingLink: input.meetingLink ?? null,
        panel: { connect: input.panelEmployeeIds.map((id) => ({ id })) },
      },
      include: { panel: { select: { id: true, userId: true, firstName: true } } },
    });
    const panelUserIds = interview.panel.map((p) => p.userId).filter((u): u is string => Boolean(u));
    await notifyMany(panelUserIds, {
      type: "INFO",
      title: `Interview panel: ${application.candidate.firstName} ${application.candidate.lastName}`,
      body: `${input.round} round · ${input.scheduledAt.toLocaleString("en-IN")}`,
      link: "/interviews",
    });
    audit({ action: "recruitment.interview_schedule", entity: "Interview", entityId: interview.id, req });
    return interview;
  },

  async listInterviews(upcomingOnly: boolean) {
    return prisma.interview.findMany({
      where: upcomingOnly ? { status: "SCHEDULED" } : {},
      orderBy: { scheduledAt: "asc" },
      take: 100,
      include: {
        application: {
          select: {
            id: true, stage: true,
            candidate: { select: { id: true, firstName: true, lastName: true, currentTitle: true, totalExperience: true } },
            posting: { select: { title: true } },
          },
        },
        panel: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        feedback: { select: { id: true, interviewerId: true, rating: true, recommendation: true } },
      },
    });
  },

  async submitFeedback(req: Request, interviewId: string, input: {
    rating: number; recommendation: "STRONG_HIRE" | "HIRE" | "NEUTRAL" | "NO_HIRE" | "STRONG_NO_HIRE";
    strengths?: string; weaknesses?: string; notes?: string;
  }) {
    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) throw new NotFoundError("Interview");
    if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
    const feedback = await prisma.interviewFeedback.upsert({
      where: { interviewId_interviewerId: { interviewId, interviewerId: req.user.employeeId } },
      create: { interviewId, interviewerId: req.user.employeeId, ...input },
      update: { ...input },
    });
    await prisma.interview.update({ where: { id: interviewId }, data: { status: "COMPLETED" } });
    audit({ action: "recruitment.feedback_submit", entity: "InterviewFeedback", entityId: feedback.id, req });
    return feedback;
  },

  /* ---------- offers ---------- */

  async createOffer(req: Request, input: { applicationId: string; designation: string; annualCtc: number; joiningDate: Date }) {
    const application = await prisma.application.findUnique({ where: { id: input.applicationId } });
    if (!application) throw new NotFoundError("Application");
    const offer = await prisma.offer.create({ data: { ...input, status: "SENT" } });
    await this.moveStage(req, input.applicationId, "OFFER");
    audit({ action: "recruitment.offer_create", entity: "Offer", entityId: offer.id, req });
    return offer;
  },

  async decideOffer(req: Request, offerId: string, decision: "ACCEPTED" | "DECLINED", declineReason?: string) {
    const offer = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer || !["SENT", "PENDING_APPROVAL", "DRAFT"].includes(offer.status)) throw new NotFoundError("Open offer");
    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: decision === "ACCEPTED"
        ? { status: "ACCEPTED", acceptedAt: new Date() }
        : { status: "DECLINED", declinedAt: new Date(), declineReason: declineReason ?? null },
    });
    if (decision === "ACCEPTED") {
      await this.moveStage(req, offer.applicationId, "JOINED");
      await notifyRecruiters("Offer accepted 🎉", "Candidate accepted — create their employee record to onboard them.");
    }
    audit({ action: `recruitment.offer_${decision.toLowerCase()}`, entity: "Offer", entityId: offerId, req });
    return updated;
  },
};
