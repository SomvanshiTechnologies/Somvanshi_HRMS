#!/usr/bin/env bash
# SomHR frontend — build & deploy to S3 + CloudFront.
#
#   ./deploy/frontend.sh <command>
#
# Commands:
#   install   npm ci
#   build     produce static bundle (frontend/dist)
#   deploy    sync dist/ to S3 and invalidate CloudFront
#
# Required env for `deploy` (and CI):
#   S3_FRONTEND_BUCKET            target bucket name (e.g. somhr-frontend)
#   CLOUDFRONT_DISTRIBUTION_ID    distribution to invalidate
# Optional build-time env:
#   VITE_API_URL                  only if the API is on a SEPARATE origin
#                                 (leave unset for the single-domain CloudFront setup)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$APP_DIR/frontend"

fe_install() { echo "==> install"; cd "$FE"; npm ci; }
fe_build()   { echo "==> build";   cd "$FE"; npm run build; }

fe_deploy() {
  : "${S3_FRONTEND_BUCKET:?set S3_FRONTEND_BUCKET}"
  : "${CLOUDFRONT_DISTRIBUTION_ID:?set CLOUDFRONT_DISTRIBUTION_ID}"
  echo "==> sync dist/ -> s3://$S3_FRONTEND_BUCKET"
  # hashed assets: long cache; index.html: no-cache so releases are picked up
  aws s3 sync "$FE/dist" "s3://$S3_FRONTEND_BUCKET" --delete \
    --cache-control "public,max-age=31536000,immutable" \
    --exclude "index.html"
  aws s3 cp "$FE/dist/index.html" "s3://$S3_FRONTEND_BUCKET/index.html" \
    --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"
  echo "==> invalidate CloudFront $CLOUDFRONT_DISTRIBUTION_ID"
  aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" >/dev/null
  echo "==> frontend deployed."
}

case "${1:-deploy}" in
  install) fe_install ;;
  build)   fe_build ;;
  deploy)  fe_deploy ;;
  all)     fe_install; fe_build; fe_deploy ;;
  *) echo "Unknown command: $1"; echo "Use: install|build|deploy|all"; exit 1 ;;
esac
