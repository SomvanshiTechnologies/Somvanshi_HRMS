#!/usr/bin/env bash
# SomHR backend — deployment task runner (run on the EC2 instance).
#
#   ./deploy/backend.sh <command>
#
# Commands (as required by the deployment spec):
#   install   npm ci + prisma generate
#   build     compile TypeScript -> dist/
#   migrate   apply Prisma migrations to RDS (prisma migrate deploy)
#   seed      seed roles, permissions, admin user, reference data
#   start     (re)start the API under PM2
#   deploy    full release: pull → install → build → migrate → restart
#   all       install → build → migrate → seed → start  (first-time bootstrap)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BE="$APP_DIR/backend"

be_install() { echo "==> install"; cd "$BE"; npm ci; npx prisma generate; }
be_build()   { echo "==> build";   cd "$BE"; npm run build; }
be_migrate() { echo "==> migrate"; cd "$BE"; npx prisma migrate deploy; }
be_seed()    { echo "==> seed";    cd "$BE"; npm run seed; }
be_start()   { echo "==> start";   cd "$APP_DIR"; pm2 startOrReload deploy/ecosystem.config.cjs; pm2 save; }

case "${1:-deploy}" in
  install) be_install ;;
  build)   be_build ;;
  migrate) be_migrate ;;
  seed)    be_seed ;;
  start)   be_start ;;
  all)     be_install; be_build; be_migrate; be_seed; be_start ;;
  deploy)
    echo "==> release"
    cd "$APP_DIR" && git pull --ff-only
    be_install; be_build; be_migrate; be_start
    echo "==> backend released."
    ;;
  *) echo "Unknown command: $1"; echo "Use: install|build|migrate|seed|start|deploy|all"; exit 1 ;;
esac
