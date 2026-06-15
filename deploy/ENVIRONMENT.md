# Environment variables

## Backend (`backend/.env`)

Validated at boot by `src/config/env.ts` — a missing required var stops startup.

| Variable | Required | Example / default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | – | `production` | enables secure cookies in prod |
| `PORT` | – | `5000` | Node listen port |
| `API_PREFIX` | – | `/api/v1` | |
| `CORS_ORIGIN` | ✅ (prod) | `https://hr.yourdomain.com` | comma-separated list allowed |
| `APP_URL` | ✅ (prod) | `https://hr.yourdomain.com` | used in email links |
| `DATABASE_URL` | ✅ | `mysql://admin:pw@rds-endpoint:3306/somhr` | RDS MySQL 8 |
| `REDIS_ENABLED` | – | `false` | `true` + `REDIS_URL` for ElastiCache |
| `REDIS_URL` | – | `redis://host:6379` | only when enabled |
| `JWT_ACCESS_SECRET` | ✅ | 32-byte hex | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | ✅ | 32-byte hex | distinct from access |
| `FIELD_ENCRYPTION_KEY` | ✅ (prod) | 32 bytes base64/hex | AES-256-GCM key for PII at rest; blank → derived from `JWT_ACCESS_SECRET`. `openssl rand -base64 32` |
| `JWT_ACCESS_TTL` | – | `15m` | |
| `JWT_REFRESH_TTL` | – | `7d` | |
| `PASSWORD_RESET_TTL_MINUTES` | – | `30` | |
| `ACCOUNT_LOCK_THRESHOLD` | – | `5` | failed logins before lock |
| `ACCOUNT_LOCK_MINUTES` | – | `15` | |
| `TWO_FACTOR_ISSUER` | – | `SomHR` | TOTP issuer label |
| **Email** | | | |
| `MAIL_DRIVER` | – | `ses` \| `smtp` | `ses` uses the instance IAM role |
| `SES_REGION` | – | `ap-south-1` | falls back to `AWS_REGION`/`S3_REGION` |
| `MAIL_FROM` | ✅ (prod) | `Somvanshi HRMS <no-reply@yourdomain.com>` | SES-verified identity |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | when `MAIL_DRIVER=smtp` | — | fallback SMTP relay |
| **AWS / storage** | | | |
| `AWS_REGION` | – | `ap-south-1` | shared default region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | – | *(blank on EC2)* | omit to use instance role |
| `STORAGE_DRIVER` | – | `s3` \| `local` | `s3` in production |
| `S3_BUCKET` | when `s3` | `somhr-uploads` | uploads bucket |
| `S3_REGION` | – | `ap-south-1` | |
| `S3_KEY_PREFIX` | – | `uploads` | optional key namespace |
| `S3_ENDPOINT` | – | *(blank)* | only for MinIO/R2 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | – | *(blank on EC2)* | overrides `AWS_*` if set |
| `UPLOAD_DIR` | when `local` | `../uploads` | local-disk path |
| **AI (optional)** | | | |
| `OPENAI_API_KEY` | – | *(blank)* | enables Sera / JD / resume |
| `OPENAI_CHAT_MODEL` | – | `gpt-4o` | |
| `OPENAI_EMBEDDING_MODEL` | – | `text-embedding-3-small` | |

## Frontend (build-time)

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_API_URL` | – | Leave **unset** for the single-domain CloudFront setup (same-origin). Set to `https://api.yourdomain.com` only if the API is on a separate origin. |
| `VITE_SOCKET_URL` | – | Same idea for Socket.IO; defaults to same-origin. |

## GitHub Actions (repo → Settings → Secrets and variables → Actions)

**Secrets**

| Secret | Purpose |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | IAM role the workflow assumes via OIDC |
| `AWS_REGION` | deploy region |
| `S3_FRONTEND_BUCKET` | SPA bucket for `aws s3 sync` |
| `CLOUDFRONT_DISTRIBUTION_ID` | distribution to invalidate |
| `EC2_SSH_HOST` | backend instance public DNS/IP |
| `EC2_SSH_USER` | e.g. `ubuntu` |
| `EC2_SSH_KEY` | private key for the deploy SSH user |

**Variables** (optional)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | only for the separate-API-origin topology |
