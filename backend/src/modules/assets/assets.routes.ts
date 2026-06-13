import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { BadRequestError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify } from "../notifications/notifications.service.js";

const CATEGORIES = ["LAPTOP", "MONITOR", "MOBILE", "SIM", "ACCESS_CARD", "KEYBOARD", "MOUSE", "HEADSET", "FURNITURE", "SOFTWARE_LICENSE", "OTHER"] as const;

const CreateAssetSchema = z.object({
  assetTag: z.string().min(2).max(40).regex(/^[A-Z0-9-]+$/, "Uppercase letters, digits, dashes"),
  category: z.enum(CATEGORIES),
  name: z.string().min(2).max(120),
  brand: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  serialNumber: z.string().max(120).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().min(0).optional(),
  warrantyEndsAt: z.coerce.date().optional(),
  vendor: z.string().max(120).optional(),
});
const AssignSchema = z.object({ employeeId: z.string().min(1), remarks: z.string().max(500).optional() });
const ReturnSchema = z.object({ returnCondition: z.string().max(200).optional(), remarks: z.string().max(500).optional() });
const MaintenanceSchema = z.object({
  type: z.enum(["REPAIR", "REPLACEMENT", "SERVICE", "UPGRADE"]),
  description: z.string().min(2).max(1000),
  cost: z.number().min(0).optional(),
  vendor: z.string().max(120).optional(),
});

const ASSET_INCLUDE = {
  assignments: {
    where: { status: "ASSIGNED" as const },
    take: 1,
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true } } },
  },
  _count: { select: { maintenance: true } },
};

export const assetsRouter: Router = Router();
assetsRouter.use(requireAuth);
const canManage = requirePermission(PERMISSIONS.ASSETS_MANAGE);
const canAssign = requirePermission(PERMISSIONS.ASSETS_ASSIGN, PERMISSIONS.ASSETS_MANAGE);

// summary counts for dashboard cards
assetsRouter.get("/summary", requirePermission(PERMISSIONS.ASSETS_READ_ALL), asyncHandler(async (_req: Request, res: Response) => {
  const [byStatus, byCategory, total, warranty] = await Promise.all([
    prisma.asset.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.asset.groupBy({ by: ["category"], where: { deletedAt: null }, _count: true }),
    prisma.asset.count({ where: { deletedAt: null } }),
    prisma.asset.count({ where: { deletedAt: null, warrantyEndsAt: { gte: new Date(), lte: new Date(Date.now() + 60 * 86400000) } } }),
  ]);
  ok(res, {
    total,
    warrantyExpiring: warranty,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
  });
}));

// list (org assets)
assetsRouter.get(
  "/",
  requirePermission(PERMISSIONS.ASSETS_READ_ALL),
  validate({ query: z.object({ status: z.string().optional(), category: z.string().optional(), search: z.string().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, category, search } = req.query as Record<string, string | undefined>;
    const assets = await prisma.asset.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(category ? { category: category as never } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { assetTag: { contains: search } }, { serialNumber: { contains: search } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: ASSET_INCLUDE,
      take: 300,
    });
    ok(res, assets);
  })
);

// my assets (ESS)
assetsRouter.get("/me", requirePermission(PERMISSIONS.ASSETS_READ), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) return void ok(res, []);
  const assignments = await prisma.assetAssignment.findMany({
    where: { employeeId: req.user.employeeId, status: "ASSIGNED" },
    include: { asset: true },
    orderBy: { assignedAt: "desc" },
  });
  ok(res, assignments);
}));

assetsRouter.post("/", canManage, validate({ body: CreateAssetSchema }), asyncHandler(async (req: Request, res: Response) => {
  const exists = await prisma.asset.findUnique({ where: { assetTag: req.body.assetTag } });
  if (exists) throw new BadRequestError(`Asset tag ${req.body.assetTag} already exists`);
  const asset = await prisma.asset.create({ data: req.body });
  audit({ action: "asset.create", entity: "Asset", entityId: asset.id, after: asset, req });
  created(res, asset, "Asset added.");
}));

assetsRouter.get("/:id", requirePermission(PERMISSIONS.ASSETS_READ_ALL), asyncHandler(async (req: Request, res: Response) => {
  const asset = await prisma.asset.findUnique({
    where: { id: req.params["id"] as string },
    include: {
      assignments: { orderBy: { assignedAt: "desc" }, include: { employee: { select: { id: true, firstName: true, lastName: true, photoUrl: true, employeeCode: true } } } },
      maintenance: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!asset) throw new NotFoundError("Asset");
  ok(res, asset);
}));

// assign
assetsRouter.post("/:id/assign", canAssign, validate({ body: AssignSchema }), asyncHandler(async (req: Request, res: Response) => {
  const assetId = req.params["id"] as string;
  const { employeeId, remarks } = req.body as z.infer<typeof AssignSchema>;
  const asset = await prisma.asset.findFirst({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset");
  if (asset.status === "ASSIGNED") throw new BadRequestError("Asset is already assigned — return it first");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, userId: true, firstName: true } });
  if (!employee) throw new NotFoundError("Employee");

  const assignment = await prisma.$transaction(async (tx) => {
    const a = await tx.assetAssignment.create({ data: { assetId, employeeId, assignedBy: req.user!.id, remarks: remarks ?? null } });
    await tx.asset.update({ where: { id: assetId }, data: { status: "ASSIGNED" } });
    return a;
  });
  if (employee.userId) await notify({ userId: employee.userId, type: "INFO", title: "Asset assigned to you", body: `${asset.name} (${asset.assetTag})`, link: "/assets" });
  audit({ action: "asset.assign", entity: "Asset", entityId: assetId, after: { employeeId }, req });
  created(res, assignment, "Asset assigned.");
}));

// return
assetsRouter.post("/:id/return", canAssign, validate({ body: ReturnSchema }), asyncHandler(async (req: Request, res: Response) => {
  const assetId = req.params["id"] as string;
  const { returnCondition, remarks } = req.body as z.infer<typeof ReturnSchema>;
  const assignment = await prisma.assetAssignment.findFirst({ where: { assetId, status: "ASSIGNED" } });
  if (!assignment) throw new BadRequestError("Asset is not currently assigned");
  await prisma.$transaction([
    prisma.assetAssignment.update({ where: { id: assignment.id }, data: { status: "RETURNED", returnedAt: new Date(), returnCondition: returnCondition ?? null, remarks: remarks ?? assignment.remarks } }),
    prisma.asset.update({ where: { id: assetId }, data: { status: "AVAILABLE" } }),
  ]);
  audit({ action: "asset.return", entity: "Asset", entityId: assetId, req });
  ok(res, null, "Asset returned to inventory.");
}));

// maintenance
assetsRouter.post("/:id/maintenance", canManage, validate({ body: MaintenanceSchema }), asyncHandler(async (req: Request, res: Response) => {
  const assetId = req.params["id"] as string;
  const asset = await prisma.asset.findFirst({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw new NotFoundError("Asset");
  const record = await prisma.$transaction(async (tx) => {
    const m = await tx.assetMaintenance.create({ data: { assetId, ...req.body } });
    await tx.asset.update({ where: { id: assetId }, data: { status: req.body.type === "REPLACEMENT" ? "REPLACED" : "IN_REPAIR" } });
    return m;
  });
  audit({ action: "asset.maintenance", entity: "Asset", entityId: assetId, after: req.body, req });
  created(res, record, "Maintenance logged.");
}));

assetsRouter.patch("/:id/maintenance/:mid/complete", canManage, asyncHandler(async (req: Request, res: Response) => {
  const assetId = req.params["id"] as string;
  await prisma.assetMaintenance.update({ where: { id: req.params["mid"] as string }, data: { completedAt: new Date() } });
  await prisma.asset.update({ where: { id: assetId }, data: { status: "AVAILABLE" } });
  audit({ action: "asset.maintenance_complete", entity: "Asset", entityId: assetId, req });
  ok(res, null, "Marked available.");
}));
