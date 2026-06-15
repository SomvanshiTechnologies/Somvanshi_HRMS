#!/usr/bin/env bash
# SomHR — first-time server provisioning (Ubuntu 24.04 on EC2).
# Run ONCE as the `ubuntu` user after SSHing in.
#
#   git clone https://github.com/SomvanshiTechnologies/Somvanshi_HRMS.git ~/app
#   cd ~/app && ./deploy/setup.sh
#
# Before running: have your RDS endpoint + credentials ready.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Installing Node 22, Nginx, git, PM2"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm i -g pm2

echo "==> Preparing uploads dir"
mkdir -p "$APP_DIR/uploads"

# ---- backend env ----
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/deploy/backend.env.production.example" "$APP_DIR/backend/.env"
  echo ""
  echo "!!  Created backend/.env from the template."
  echo "!!  EDIT it now (DATABASE_URL + JWT secrets) before continuing:"
  echo "!!      nano $APP_DIR/backend/.env"
  echo "!!  Generate secrets with: openssl rand -hex 32"
  echo ""
  read -rp "Press Enter once backend/.env is filled in... "
fi

echo "==> Backend: install, generate, push schema, seed, build"
cd "$APP_DIR/backend"
npm ci
npx prisma generate
npx prisma db push          # create all tables on RDS
npm run seed                # roles, permissions, admin user, sample data
npm run build

echo "==> Frontend: install + build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Start API under PM2 (auto-start on reboot)"
cd "$APP_DIR"
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd | tail -n 1 | sudo bash || true

echo "==> Configure Nginx"
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/somhr
sudo ln -sf /etc/nginx/sites-available/somhr /etc/nginx/sites-enabled/somhr
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "==> Base setup complete."
echo "    1. Point your domain's A record at this server's Elastic IP."
echo "    2. Edit server_name in /etc/nginx/sites-available/somhr to your domain."
echo "    3. Enable HTTPS:"
echo "         sudo apt-get install -y certbot python3-certbot-nginx"
echo "         sudo certbot --nginx -d hr.yourdomain.com"
