# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# Somvanshi HRMS — Backend (Node 22 · Express 5 · Prisma 7 · MySQL adapter)
# Multi-stage: compile TypeScript → run the lean dist bundle.
# ──────────────────────────────────────────────────────────────────────────────

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app

# OpenSSL is needed by Prisma at generate time
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# Generate the Prisma client into src/generated/prisma (committed path is gitignored)
RUN npx prisma generate

COPY . .
RUN npm run build

# Drop dev dependencies for a smaller runtime image
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl wget && rm -rf /var/lib/apt/lists/*

# Copy only what the server needs to run
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/assets ./assets
COPY --from=build /app/package.json ./package.json

# Local upload fallback (when STORAGE_DRIVER=local)
RUN mkdir -p /uploads && chown -R node:node /uploads /app
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/v1 >/dev/null 2>&1 || exit 1

# Apply migrations on boot, then start the API. (Idempotent — safe on every deploy.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
