# Deploying Somvanshi HRMS on AWS

Single EC2 instance (Nginx + Node/PM2) + RDS MySQL. The frontend calls the API
with relative paths, so Nginx serves the SPA and reverse-proxies the API on the
same origin — no CORS setup needed.

## Architecture

| Component            | AWS service        | Notes                                            |
| -------------------- | ------------------ | ------------------------------------------------ |
| Frontend (Vite SPA)  | Nginx on EC2       | Static `frontend/dist`, proxies `/api` + `/socket.io` |
| Backend (Express)    | EC2 via PM2        | Port 5000                                        |
| Database (MySQL 8)   | RDS for MySQL      | `db.t3.micro` to start                           |
| File uploads         | EBS (EC2 disk)     | `STORAGE_DRIVER=local`, `UPLOAD_DIR=~/app/uploads` |
| HTTPS / domain       | Route 53 + Certbot | Free Let's Encrypt TLS                           |

## 1. RDS MySQL
- RDS → Create → MySQL 8.0, `db.t3.micro`, 20 GB gp3, DB name `somhr`.
- Same VPC as EC2, **Public access: No**.
- Security group: inbound **3306** from the EC2 security group only.

## 2. EC2
- Ubuntu 24.04 LTS, `t3.small` (or `t3.medium`), 20–30 GB gp3.
- Security group inbound: **22** (your IP), **80**, **443**.
- Allocate + associate an **Elastic IP**.

## 3. Provision (one-time)
```bash
ssh -i key.pem ubuntu@<elastic-ip>
git clone https://github.com/SomvanshiTechnologies/Somvanshi_HRMS.git ~/app
cd ~/app
./deploy/setup.sh           # prompts you to edit backend/.env, then does everything
```
`setup.sh` installs Node/Nginx/PM2, builds backend + frontend, creates the schema
on RDS (`prisma db push`), seeds data, starts the API under PM2, and wires up Nginx.

## 4. Domain + HTTPS
- Route 53: A record `hr.yourdomain.com` → Elastic IP.
- Edit `server_name` in `/etc/nginx/sites-available/somhr`.
- `sudo certbot --nginx -d hr.yourdomain.com`

## 5. Redeploy after code changes
```bash
cd ~/app && ./deploy/deploy.sh
```

## Files
- `setup.sh` — first-time server provisioning
- `deploy.sh` — pull + rebuild + restart (idempotent)
- `ecosystem.config.cjs` — PM2 process definition
- `nginx.conf` — SPA + API reverse-proxy site config
- `backend.env.production.example` — production env template (copy to `backend/.env`)

## Notes
- **Email is skipped for now** — reset/notification emails are logged, not sent.
  Set `SMTP_*` (Amazon SES / Zoho / Gmail app password) before real launch.
- **AI (Sera/JD/resume)** needs `OPENAI_API_KEY` in `backend/.env`.
- **Schema workflow:** this repo uses schema-first (`prisma db push`). If you later
  commit migration files, switch `db push` → `prisma migrate deploy` in the scripts.
- **Backups:** RDS automated backups cover the DB. The `uploads/` dir lives on EBS —
  add an EBS snapshot schedule (Data Lifecycle Manager) to back up uploaded files.
