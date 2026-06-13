import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { aiService } from "./ai.service.js";
import { indexDocument } from "./ai.rag.js";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import { BadRequestError } from "../../core/errors.js";
import { isAiConfigured } from "../../config/openai.js";
import { heavyLimiter } from "../../middleware/rateLimit.middleware.js";
import { audit } from "../audit/audit.service.js";

export const aiRouter: Router = Router();
aiRouter.use(requireAuth);

aiRouter.get("/status", asyncHandler(async (_req: Request, res: Response) => void ok(res, { configured: isAiConfigured() })));

// ---- conversations ----
aiRouter.get("/conversations", requirePermission(PERMISSIONS.AI_USE), asyncHandler(async (req: Request, res: Response) => void ok(res, await aiService.listConversations(req.user!.id))));
aiRouter.post("/conversations", requirePermission(PERMISSIONS.AI_USE), asyncHandler(async (req: Request, res: Response) => void created(res, await aiService.createConversation(req.user!.id))));
aiRouter.get("/conversations/:id/messages", requirePermission(PERMISSIONS.AI_USE), asyncHandler(async (req: Request, res: Response) => void ok(res, await aiService.getMessages(req.user!.id, req.params["id"] as string))));
aiRouter.delete("/conversations/:id", requirePermission(PERMISSIONS.AI_USE), asyncHandler(async (req: Request, res: Response) => { await aiService.deleteConversation(req.user!.id, req.params["id"] as string); noContent(res); }));

// ---- streaming chat (SSE) ----
aiRouter.post(
  "/conversations/:id/messages",
  requirePermission(PERMISSIONS.AI_USE),
  heavyLimiter,
  validate({ body: z.object({ message: z.string().min(1).max(4000) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAiConfigured()) throw new BadRequestError("Sera is not configured — an OpenAI API key is required");
    await aiService.streamChat(req, res, req.params["id"] as string, (req.body as { message: string }).message);
  })
);

// ---- knowledge base ----
aiRouter.get(
  "/knowledge",
  requirePermission(PERMISSIONS.AI_MANAGE),
  asyncHandler(async (_req: Request, res: Response) =>
    void ok(res, await prisma.knowledgeDocument.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, category: true, isActive: true, updatedAt: true, _count: { select: { chunks: true } } },
    }))
  )
);

aiRouter.post(
  "/knowledge",
  requirePermission(PERMISSIONS.AI_MANAGE),
  validate({ body: z.object({ title: z.string().min(2).max(200), category: z.string().min(2).max(40), content: z.string().min(20).max(200_000) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAiConfigured()) throw new BadRequestError("Sera is not configured — an OpenAI API key is required");
    const { title, category, content } = req.body as { title: string; category: string; content: string };
    const doc = await prisma.knowledgeDocument.create({ data: { title, category, content, createdBy: req.user!.id } });
    const chunks = await indexDocument(doc.id);
    audit({ action: "ai.knowledge_add", entity: "KnowledgeDocument", entityId: doc.id, req });
    created(res, { id: doc.id, chunks }, `Document indexed into ${chunks} chunks.`);
  })
);

aiRouter.delete(
  "/knowledge/:id",
  requirePermission(PERMISSIONS.AI_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.knowledgeDocument.delete({ where: { id: req.params["id"] as string } });
    audit({ action: "ai.knowledge_delete", entity: "KnowledgeDocument", entityId: req.params["id"] as string, req });
    noContent(res);
  })
);
