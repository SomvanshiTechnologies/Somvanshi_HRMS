# Deploying Somvanshi HRMS on AWS

Production topology: the SPA is served by **CloudFront + S3**; the API runs on
**EC2** (Node + PM2 behind Nginx); data lives in **RDS MySQL**; uploads go to
**S3**; email is sent via **SES**; logs/metrics flow to **CloudWatch**.

CloudFront is the single public entry point: it serves the SPA by default and
routes `/api/*` + `/socket.io/*` to the EC2 origin. That keeps the app
same-origin, so the strict httpOnly auth cookie and relative API paths work
unchanged. (You can instead split the API onto `api.yourdomain.com` and set
`VITE_API_URL` at build time — see [PRODUCTION.md](./PRODUCTION.md).)

## 1. Infrastructure diagram

```
                            ┌──────────────┐
        Users ─────────────▶│   Route 53   │  hr.yourdomain.com
                            └──────┬───────┘
                                   ▼
                          ┌─────────────────┐
                          │   CloudFront    │   ACM TLS · single domain
                          └───┬─────────┬───┘
                  default /*  │         │  /api/*  /socket.io/*
                              ▼         ▼
                    ┌──────────────┐  ┌──────────────┐
                    │   S3 bucket  │  │  ALB (HTTPS) │   (or HTTP origin)
                    │  SPA / static│  └──────┬───────┘
                    └──────────────┘         ▼
                                     ┌──────────────────┐
                                     │  EC2  (Ubuntu)   │
                                     │  Nginx :80       │
                                     │   └─ PM2 → Node  │  somhr-api :5000
                                     └───┬───────┬───┬──┘
                          ┌──────────────┘       │   └──────────────┐
                          ▼                       ▼                  ▼
                 ┌────────────────┐     ┌──────────────────┐  ┌───────────┐
                 │  RDS MySQL 8   │     │  S3 (uploads)    │  │   SES     │
                 │  (Multi-AZ)    │     │  documents/logos │  │  email    │
                 └────────────────┘     └──────────────────┘  └───────────┘
                          │                                          ▲
                          └──── automated backups          IAM role ─┘
                                                            (S3 + SES)

   CloudWatch  ◀── EC2 (CloudWatch agent: PM2/Nginx logs, metrics)
               ◀── RDS / ALB / CloudFront metrics & alarms
```

IAM: the EC2 instance role grants `s3:*Object` on the uploads bucket and
`ses:SendRawEmail` — so no AWS keys live in `.env`. GitHub Actions assumes a
separate deploy role via OIDC.

## 2. Documents

| Deliverable | File |
| --- | --- |
| Production deployment guide | [PRODUCTION.md](./PRODUCTION.md) |
| Environment variables | [ENVIRONMENT.md](./ENVIRONMENT.md) |
| Backup strategy | [BACKUP.md](./BACKUP.md) |
| Rollback strategy | [ROLLBACK.md](./ROLLBACK.md) |
| CI/CD workflow | [../.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml) |

## 3. Scripts

| Script | Purpose |
| --- | --- |
| `deploy/setup.sh` | First-time EC2 backend provisioning (Node, Nginx, PM2, env, bootstrap) |
| `deploy/backend.sh <cmd>` | `install · build · migrate · seed · start · deploy · all` |
| `deploy/frontend.sh <cmd>` | `install · build · deploy` (S3 sync + CloudFront invalidation) |
| `deploy/ecosystem.config.cjs` | PM2 process definition (`somhr-api`) |
| `deploy/nginx.conf` | API-origin reverse proxy (`/api` + `/socket.io` → :5000) |
| `deploy/backend.env.production.example` | Production env template |

## 4. TL;DR

```bash
# backend (on EC2, first time)
git clone https://github.com/SomvanshiTechnologies/Somvanshi_HRMS.git ~/app
cd ~/app && ./deploy/setup.sh

# frontend (from CI or locally with AWS creds)
S3_FRONTEND_BUCKET=somhr-frontend \
CLOUDFRONT_DISTRIBUTION_ID=E123ABC \
./deploy/frontend.sh all

# thereafter: push to main → GitHub Actions builds, tests, and deploys both.
```
