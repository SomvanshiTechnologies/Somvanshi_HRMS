# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# Somvanshi HRMS — Frontend (React 19 · Vite · TS) served by Nginx
# Multi-stage: build the static bundle → serve it from a tiny nginx image.
# ──────────────────────────────────────────────────────────────────────────────

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime
# SPA routing + reverse-proxy /api → backend
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
