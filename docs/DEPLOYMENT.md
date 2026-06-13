# Somvanshi HRMS — Deployment Guide

This guide covers running the full stack with **Docker Compose** (single VM) and a
production reference on **AWS** (RDS · S3 · ECR · ECS Fargate behind an ALB).

> Stack: React 19 + Vite (Nginx) · Node 22 / Express 5 · Prisma 7 + MySQL 8 ·
> Socket.IO · optional Redis · optional OpenAI (Sera).

---

## 1. Architecture

```
                     ┌──────────────────────────┐
   Browser  ─https─▶ │  Nginx (frontend)        │  SPA + reverse proxy
                     │   /        → static dist  │
                     │   /api/    → backend:5000 │
                     │   /socket.io → backend    │ (SSE + WebSocket)
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │  Backend API (Express)   │  JWT auth · RBAC · Prisma
                     └───┬──────────┬───────┬───┘
                         │          │       │
                  ┌──────▼──┐  ┌────▼───┐ ┌─▼────────┐
                  │ MySQL 8 │  │ Redis  │ │ S3 / disk│  uploads + receipts
                  └─────────┘  └────────┘ └──────────┘
```

- **Stateless backend** — horizontally scalable; all state in MySQL / Redis / S3.
- **Migrations** run automatically on backend boot (`prisma migrate deploy`).
- **Sera (AI)** is optional — without `OPENAI_API_KEY` the chat endpoints return a
  friendly "not configured" message and the rest of the app is unaffected.

---

## 2. Single-VM deploy (Docker Compose)

Good for staging or a small production install on one EC2 / DigitalOcean box.

```bash
git clone <repo> somhr && cd somhr
cp .env.example .env
#   → set MYSQL_*, JWT_* (openssl rand -hex 32), APP_URL=https://your-domain,
#     SMTP_*, and OPENAI_API_KEY if you want Sera.

docker compose up -d --build

# First boot only — load bootstrap config (roles, permissions, salary/leave/expense
# config) and the initial Super Admin. Idempotent; safe to re-run.
docker compose run --rm backend npx prisma db seed
```

- App: `http://<host>/`  · API: `http://<host>/api/v1`
- Logs: `docker compose logs -f backend`
- Update: `git pull && docker compose up -d --build` (migrations apply on restart).
- TLS: put this box behind a TLS terminator — Caddy, an Nginx with certbot, or an
  AWS ALB / Cloudflare in front of port 80.

### Backups
```bash
docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" somhr' > somhr-$(date +%F).sql
```

---

## 3. Production on AWS (managed services)

### 3.1 Provision

| Concern        | Service                              | Notes |
|----------------|--------------------------------------|-------|
| Database       | **RDS for MySQL 8.0**                | Multi-AZ, gp3, automated backups, deletion protection on |
| Cache (opt.)   | **ElastiCache for Redis**            | Only if `REDIS_ENABLED=true` |
| File storage   | **S3** bucket (e.g. `somhr-prod`)    | Block public access; access via IAM role |
| Images         | **ECR** repos `somhr-backend`, `somhr-frontend` | |
| Compute        | **ECS Fargate** (2 services) or EC2  | Fargate = no servers to patch |
| Ingress        | **ALB** + **ACM** TLS cert           | HTTPS:443 → target groups |
| Secrets        | **SSM Parameter Store / Secrets Manager** | JWT secrets, DB password, OpenAI key |
| DNS            | **Route 53**                         | `hr.somvanshitech.com` → ALB |

### 3.2 Database

1. Create the RDS MySQL 8 instance; note the endpoint.
2. Create the schema: `CREATE DATABASE somhr CHARACTER SET utf8mb4;`
3. Connection string (store as a secret), the backend's `DATABASE_URL`:
   ```
   mysql://somhr_user:<password>@<rds-endpoint>:3306/somhr
   ```
4. Migrations apply automatically when the backend container starts. To run them
   manually from a bastion / one-off task:
   ```bash
   DATABASE_URL=... npx prisma migrate deploy
   ```
5. **Seed once** against the prod DB (bootstrap config + first admin):
   ```bash
   DATABASE_URL=... npx prisma db seed
   ```

### 3.3 File storage (S3)

Set on the backend service:
```
STORAGE_DRIVER=s3
S3_REGION=ap-south-1
S3_BUCKET=somhr-prod
# Prefer an IAM task role over static keys. If you must use keys:
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```
Attach an IAM policy allowing `s3:PutObject/GetObject/DeleteObject` on
`arn:aws:s3:::somhr-prod/*`.

### 3.4 Build & push images

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-south-1.amazonaws.com

docker build -t somhr-backend  ./backend
docker build -t somhr-frontend ./frontend

docker tag somhr-backend  <acct>.dkr.ecr.ap-south-1.amazonaws.com/somhr-backend:latest
docker tag somhr-frontend <acct>.dkr.ecr.ap-south-1.amazonaws.com/somhr-frontend:latest
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/somhr-backend:latest
docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/somhr-frontend:latest
```

> In a hosted-Nginx setup the frontend proxies `/api` to the backend by service DNS
> name `backend`. On ECS, either run both containers in **one task** (so `backend`
> resolves via localhost links) or point `nginx.conf`'s `proxy_pass` at the backend's
> internal ALB / Cloud Map name and rebuild the frontend image.

### 3.5 ECS services

- **backend service**: container port 5000, desired count ≥2, health check
  `GET /api/v1`. Inject env from Secrets Manager (`DATABASE_URL`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `OPENAI_API_KEY`, S3 vars). Set `CORS_ORIGIN` and `APP_URL`
  to `https://hr.somvanshitech.com`.
- **frontend service**: container port 80, behind the ALB on 443.
- **ALB**: HTTPS:443 (ACM cert) → frontend target group; the frontend proxies
  `/api` and `/socket.io` onward. Enable **stickiness** / long idle timeout (3600s)
  on the target group so SSE (Sera streaming) and WebSockets stay open.

### 3.6 DNS & TLS

- ACM cert for `hr.somvanshitech.com` in the ALB's region.
- Route 53 A/ALIAS record → ALB.
- Force HTTP→HTTPS redirect on the ALB listener.

---

## 4. Required environment variables (backend)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | MySQL connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ✅ | Token signing (≥16 chars; use 32-byte hex) |
| `APP_URL`, `CORS_ORIGIN` | ✅ | Public URL — cookie domain, email links, CORS |
| `REDIS_URL`, `REDIS_ENABLED` | – | Enable for rate-limit / cache at scale |
| `SMTP_*`, `MAIL_FROM` | – | Transactional email (welcome, reset, payslips) |
| `STORAGE_DRIVER`, `S3_*` | – | `s3` for production uploads |
| `OPENAI_API_KEY`, `OPENAI_*_MODEL` | – | Sera AI assistant (RAG + tools) |

Full reference: `backend/.env.example`.

---

## 5. Post-deploy checklist

- [ ] `GET /api/v1` returns the service banner (health check green).
- [ ] Seed ran once — you can log in as the Super Admin and roles/permissions exist.
- [ ] Change the seeded admin password immediately.
- [ ] HTTPS enforced; HTTP redirects to HTTPS.
- [ ] ALB idle timeout ≥3600s (Sera SSE + Socket.IO notifications).
- [ ] RDS automated backups + Multi-AZ on; S3 versioning on.
- [ ] Secrets pulled from Secrets Manager/SSM, **not** baked into images.
- [ ] CloudWatch log groups attached to both ECS services.
- [ ] (If Sera is used) OpenAI account has active billing/credits.
```
