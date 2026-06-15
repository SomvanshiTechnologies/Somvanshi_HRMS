#!/usr/bin/env bash
# SomHR — first-time EC2 backend provisioning (Ubuntu 24.04).
# The frontend is served by CloudFront+S3 (deployed via CI / deploy/frontend.sh),
# so this only provisions the API origin: Node + Nginx + PM2.
#
#   git clone https://github.com/SomvanshiTechnologies/Somvanshi_HRMS.git ~/app
#   cd ~/app && ./deploy/setup.sh
#
# Prereqs: RDS reachable, an S3 uploads bucket, and (for SES) a verified identity.
# The instance's IAM role should allow S3 (the uploads bucket) + SES SendRawEmail.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Installing Node 22, Nginx, git, PM2, awscli"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git unzip
sudo npm i -g pm2
command -v aws >/dev/null || { curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip; (cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install); }

# ── backend env ──
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/deploy/backend.env.production.example" "$APP_DIR/backend/.env"
  echo ""
  echo "!!  Created backend/.env from the template."
  echo "!!  EDIT it now (DATABASE_URL, JWT secrets, S3_BUCKET, SES) before continuing:"
  echo "!!      nano $APP_DIR/backend/.env"
  echo ""
  read -rp "Press Enter once backend/.env is filled in... "
fi

echo "==> Bootstrapping backend (install, build, migrate, seed, start)"
"$APP_DIR/deploy/backend.sh" all

echo "==> Configuring Nginx (API origin)"
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/somhr
sudo ln -sf /etc/nginx/sites-available/somhr /etc/nginx/sites-enabled/somhr
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "==> Enabling PM2 on boot"
pm2 startup systemd | tail -n 1 | sudo bash || true
pm2 save

echo ""
echo "==> Backend origin ready on :80 (proxying /api + /socket.io → :5000)."
echo "    Next: point CloudFront's /api/* and /socket.io/* behaviors at this"
echo "    instance (via ALB+ACM, recommended) and deploy the frontend with:"
echo "        S3_FRONTEND_BUCKET=... CLOUDFRONT_DISTRIBUTION_ID=... ./deploy/frontend.sh all"
echo "    See deploy/PRODUCTION.md for the full walkthrough."
