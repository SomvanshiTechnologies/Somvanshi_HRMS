#!/usr/bin/env bash
# SomHR — redeploy script (run on the EC2 server after the first-time setup).
#
#   cd /home/ubuntu/app && ./deploy/deploy.sh
#
# Pulls latest code, rebuilds backend + frontend, syncs the DB schema, and
# restarts the API under PM2. Nginx serves the new frontend/dist immediately.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Backend: install, generate, migrate, build"
cd "$APP_DIR/backend"
npm ci
npx prisma generate
npx prisma db push          # sync schema to RDS (schema-first workflow)
npm run build

echo "==> Frontend: install + build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Restart API (PM2)"
cd "$APP_DIR"
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo "==> Done. Frontend served from frontend/dist, API restarted."
