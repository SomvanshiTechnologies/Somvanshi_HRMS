import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "../../config/db.js";
import { logger } from "../../core/logger.js";
import type { NotificationType } from "../../generated/prisma/client.js";

let io: SocketIOServer | null = null;

/** Called once at bootstrap so services can push realtime events. */
export function bindRealtime(server: SocketIOServer): void {
  io = server;
}

export interface NotifyInput {
  userId: string;
  type?: NotificationType;
  title: string;
  body?: string;
  link?: string;
  entity?: string;
  entityId?: string;
}

/** Persist a notification and push it over Socket.IO (room = user id). */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type ?? "INFO",
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
      },
    });
    io?.to(`user:${input.userId}`).emit("notification:new", row);
  } catch (err) {
    logger.error({ err, userId: input.userId }, "notification dispatch failed");
  }
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}
