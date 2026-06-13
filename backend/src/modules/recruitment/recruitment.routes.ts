import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { recruitmentService } from "./recruitment.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { BadRequestError, NotFoundError } from "../../core/errors.js";
import { upload, fileUrl } from "../files/files.routes.js";
import { prisma } from "../../config/db.js";
import { parseAndStore } from "./resume.ai.js";
import { generateJobDescription } from "./jd.ai.js";
import { audit } from "../audit/audit.service.js";

const RequisitionSchema = z.object({
  title: z.string().min(3).max(160),
  departmentId: z.string().min(1),
  headcount: z.number().int().min(1).max(100).default(1),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]).optional(),
  minExperience: z.number().min(0).max(50).optional(),
  maxExperience: z.number().min(0).max(50).optional(),
  description: z.string().max(5000).optional(),
  skillsRequired: z.array(z.string().max(60)).max(30).optional(),
});
const DecisionSchema = z.object({ remarks: z.string().max(500).optional() });
const PostingSchema = z.object({
  description: z.string().min(20).max(10000),
  location: z.string().max(120).optional(),
  isRemote: z.boolean().optional(),
});
const CandidateSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email(),
  phone: z.string().max(20).optional(),
  currentCompany: z.string().max(160).optional(),
  currentTitle: z.string().max(120).optional(),
  totalExperience: z.number().min(0).max(50).optional(),
  expectedCtc: z.number().min(0).optional(),
  noticePeriodDays: z.number().int().min(0).max(365).optional(),
  location: z.string().max(120).optional(),
  source: z.string().max(60).optional(),
  skills: z.array(z.string().max(60)).max(30).optional(),
  postingId: z.string().optional(),
});
const StageSchema = z.object({
  stage: z.enum(["APPLIED", "SCREENING", "TECHNICAL", "MANAGERIAL", "HR", "OFFER", "JOINED", "REJECTED"]),
  rejectionReason: z.string().max(500).optional(),
});
const InterviewSchema = z.object({
  applicationId: z.string().min(1),
  round: z.string().min(2).max(60),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().min(15).max(480).optional(),
  mode: z.enum(["IN_PERSON", "VIDEO", "PHONE"]).optional(),
  meetingLink: z.string().max(500).optional(),
  panelEmployeeIds: z.array(z.string()).min(1).max(8),
});
const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  recommendation: z.enum(["STRONG_HIRE", "HIRE", "NEUTRAL", "NO_HIRE", "STRONG_NO_HIRE"]),
  strengths: z.string().max(2000).optional(),
  weaknesses: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
const OfferSchema = z.object({
  applicationId: z.string().min(1),
  designation: z.string().min(2).max(120),
  annualCtc: z.number().positive(),
  joiningDate: z.coerce.date(),
});
const OfferDecisionSchema = z.object({
  decision: z.enum(["ACCEPTED", "DECLINED"]),
  declineReason: z.string().max(500).optional(),
});

export const recruitmentRouter: Router = Router();
recruitmentRouter.use(requireAuth);
const canRead = requirePermission(PERMISSIONS.RECRUITMENT_READ);
const canWrite = requirePermission(PERMISSIONS.RECRUITMENT_CREATE, PERMISSIONS.RECRUITMENT_MANAGE);

// requisitions
recruitmentRouter.get("/requisitions", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await recruitmentService.listRequisitions())));
recruitmentRouter.post("/requisitions", canWrite, validate({ body: RequisitionSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.createRequisition(req, req.body), "Requisition submitted for approval.")));
recruitmentRouter.patch("/requisitions/:id/approve", requirePermission(PERMISSIONS.RECRUITMENT_APPROVE), validate({ body: DecisionSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await recruitmentService.decideRequisition(req, req.params["id"] as string, "APPROVED", (req.body as { remarks?: string }).remarks), "Requisition approved — position is open.")));
recruitmentRouter.patch("/requisitions/:id/reject", requirePermission(PERMISSIONS.RECRUITMENT_APPROVE), validate({ body: DecisionSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await recruitmentService.decideRequisition(req, req.params["id"] as string, "REJECTED", (req.body as { remarks?: string }).remarks), "Requisition rejected.")));
recruitmentRouter.post("/requisitions/:id/postings", canWrite, validate({ body: PostingSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.publishPosting(req, req.params["id"] as string, req.body), "Job posted.")));

// postings & pipeline
recruitmentRouter.get("/postings", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await recruitmentService.listPostings())));
recruitmentRouter.get("/pipeline", canRead, asyncHandler(async (req: Request, res: Response) => void ok(res, await recruitmentService.pipeline(req.query["postingId"] as string | undefined))));

// candidates
recruitmentRouter.post("/candidates", canWrite, validate({ body: CandidateSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.createCandidate(req, req.body), "Candidate added.")));
recruitmentRouter.post(
  "/candidates/:id/resume",
  canWrite,
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("No file provided (field 'file')");
    created(res, await recruitmentService.attachResume(req, req.params["id"] as string, { url: fileUrl(req.file.filename), name: req.file.originalname }), "Resume uploaded.");
  })
);

// AI job-description generator
recruitmentRouter.post(
  "/jobs/generate-description",
  canWrite,
  validate({ body: z.object({
    title: z.string().min(2).max(160),
    department: z.string().optional(),
    employmentType: z.string().optional(),
    location: z.string().optional(),
    minExperience: z.number().min(0).max(50).optional(),
    maxExperience: z.number().min(0).max(50).optional(),
    skills: z.array(z.string()).optional(),
    notes: z.string().max(2000).optional(),
  }) }),
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await generateJobDescription(req.body as Parameters<typeof generateJobDescription>[0]), "Draft generated.");
  })
);

// AI resume parsing (+ optional match-score against a posting)
recruitmentRouter.post(
  "/candidates/:id/parse-resume",
  canWrite,
  validate({ body: z.object({ postingId: z.string().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const resume = await prisma.resume.findFirst({ where: { candidateId: req.params["id"] as string }, orderBy: { createdAt: "desc" } });
    if (!resume) throw new NotFoundError("Resume — upload one first");
    const result = await parseAndStore(resume.id, (req.body as { postingId?: string }).postingId);
    audit({ action: "recruitment.resume_parsed", entity: "Resume", entityId: resume.id, req });
    ok(res, result, "Resume parsed.");
  })
);

// applications
recruitmentRouter.patch("/applications/:id/stage", canWrite, validate({ body: StageSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { stage, rejectionReason } = req.body as z.infer<typeof StageSchema>;
  ok(res, await recruitmentService.moveStage(req, req.params["id"] as string, stage, rejectionReason));
}));

// interviews
recruitmentRouter.get("/interviews", canRead, asyncHandler(async (req: Request, res: Response) => void ok(res, await recruitmentService.listInterviews(req.query["upcoming"] !== "false"))));
recruitmentRouter.post("/interviews", canWrite, validate({ body: InterviewSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.scheduleInterview(req, req.body), "Interview scheduled — panel notified.")));
recruitmentRouter.post("/interviews/:id/feedback", canRead, validate({ body: FeedbackSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.submitFeedback(req, req.params["id"] as string, req.body), "Feedback recorded.")));

// offers
recruitmentRouter.post("/offers", requirePermission(PERMISSIONS.RECRUITMENT_MANAGE), validate({ body: OfferSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await recruitmentService.createOffer(req, req.body), "Offer sent.")));
recruitmentRouter.patch("/offers/:id/decision", requirePermission(PERMISSIONS.RECRUITMENT_MANAGE), validate({ body: OfferDecisionSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { decision, declineReason } = req.body as z.infer<typeof OfferDecisionSchema>;
  ok(res, await recruitmentService.decideOffer(req, req.params["id"] as string, decision, declineReason));
}));
