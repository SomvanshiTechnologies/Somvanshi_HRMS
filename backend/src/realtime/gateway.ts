import type { Server as SocketIOServer, Socket } from "socket.io";
import { tokenService } from "../modules/auth/token.service.js";
import { logger } from "../core/logger.js";
import { bindRealtime } from "../modules/notifications/notifications.service.js";

/**
 * Socket.IO gateway. Clients authenticate with their JWT access token
 * (auth.token in the handshake); each user joins a private room plus one
 * room per role for targeted broadcasts.
 */
export function initRealtime(io: SocketIOServer): void {
  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth["token"] as string | undefined) ??
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) return next(new Error("unauthorized"));
      const payload = tokenService.verifyAccessToken(token);
      socket.data["userId"] = payload.sub;
      socket.data["roles"] = payload.roles;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data["userId"] as string;
    const roles = socket.data["roles"] as string[];
    void socket.join(`user:${userId}`);
    for (const role of roles) void socket.join(`role:${role}`);
    logger.debug({ userId }, "socket connected");
    socket.on("disconnect", () => logger.debug({ userId }, "socket disconnected"));
  });

  bindRealtime(io);
}
