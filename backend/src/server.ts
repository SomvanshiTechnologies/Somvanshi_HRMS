import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./core/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initRealtime } from "./realtime/gateway.js";

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: { origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()), credentials: true },
  });
  initRealtime(io);
  app.set("io", io);

  server.listen(env.PORT, () => {
    logger.info(`🚀 SomHR API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close();
    io.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error(err, "Failed to start SomHR backend");
  process.exit(1);
});
