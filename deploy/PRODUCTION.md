# Production deployment guide — Somvanshi HRMS on AWS

End-to-end, repeatable setup. Region used in examples: `ap-south-1` (Mumbai).

Prerequisites: an AWS account, a registered domain, the AWS CLI configured
locally, and push access to the GitHub repo.

---

## 0. Overview of what you'll create

1. RDS MySQL 8 (database)
2. S3 bucket for uploads + S3 bucket for the SPA
3. IAM roles (EC2 instance role, GitHub OIDC deploy role)
4. SES identity (email)
5. EC2 instance running the API (Nginx + PM2)
6. CloudFront distribution (single public entry point)
7. CI/CD via GitHub Actions

---

## 1. RDS MySQL

- RDS → Create database → **MySQL 8.0**, `db.t3.micro` (or larger), 20 GB gp3.
- Master user `admin` + strong password; initial DB name `somhr`.
- Same VPC as the EC2 instance, **Public access: No**, **Multi-AZ** for prod.
- Security group: inbound **3306** from the EC2 security group only.
- Enable **automated backups** (7–35 day retention) — see [BACKUP.md](./BACKUP.md).

`DATABASE_URL=mysql://admin:PW@somhr.xxxx.ap-south-1.rds.amazonaws.com:3306/somhr`

## 2. S3 buckets

**Uploads** (`somhr-uploads`) — private; the backend streams bytes through the
authenticated `/api/v1/files/:name` route, so **block all public access**.

**Frontend** (`somhr-frontend`) — holds the built SPA. Keep public access
blocked and serve it through CloudFront with an **Origin Access Control (OAC)**.

```bash
aws s3api create-bucket --bucket somhr-uploads  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
aws s3api create-bucket --bucket somhr-frontend --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

## 3. IAM

**EC2 instance role** (`somhr-ec2-role`) — attach to the instance; no keys in env:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject"],
      "Resource": "arn:aws:s3:::somhr-uploads/*" },
    { "Effect": "Allow", "Action": ["ses:SendRawEmail","ses:SendEmail"], "Resource": "*" }
  ]
}
```

**GitHub OIDC deploy role** (`somhr-gha-deploy`) — trusted by GitHub's OIDC
provider, scoped to this repo; permissions: `s3:PutObject/DeleteObject/ListBucket`
on `somhr-frontend`, and `cloudfront:CreateInvalidation`. Put its ARN in the
`AWS_DEPLOY_ROLE_ARN` GitHub secret. (See AWS docs: "Configuring OpenID Connect
in Amazon Web Services".)

## 4. SES (email)

- SES → Verified identities → verify your domain (or the `MAIL_FROM` address).
- Add the DKIM records SES gives you to Route 53.
- **Request production access** (leave the sandbox) so you can email anyone.
- The backend uses `MAIL_DRIVER=ses` with the instance role — no SMTP creds.
  Emails wired: enrollment/welcome, password reset, temp password, payslip,
  leave approved/rejected, attendance correction, ticket created/replied/resolved,
  exit document delivery, company announcements.

## 5. EC2 (API origin)

- Ubuntu 24.04, `t3.small`+, 20–30 GB gp3. Attach `somhr-ec2-role`.
- Security group inbound: **22** (your IP), **80** (from the ALB/CloudFront).
- Allocate + associate an **Elastic IP**.

```bash
ssh -i key.pem ubuntu@<elastic-ip>
git clone https://github.com/SomvanshiTechnologies/Somvanshi_HRMS.git ~/app
cd ~/app && ./deploy/setup.sh        # installs Node/Nginx/PM2/awscli, prompts for .env,
                                     # then install→build→migrate→seed→start
```
Fill `backend/.env` from `deploy/backend.env.production.example` (DATABASE_URL,
JWT secrets, `MAIL_DRIVER=ses`, `STORAGE_DRIVER=s3`, `S3_BUCKET`). Verify:
`curl http://localhost/healthz` → `{"status":"ok"...}`.

## 6. CloudFront (single entry point)

Create a distribution with **two origins**:

| Origin | Behavior (path) | Settings |
| --- | --- | --- |
| S3 `somhr-frontend` (via OAC) | `Default (*)` | cache enabled; SPA error pages: map 403/404 → `/index.html` (200) |
| EC2/ALB (the API) | `/api/*` and `/socket.io/*` | **caching disabled**, forward all headers/cookies/query, allow all HTTP methods |

- Recommended: put an **ALB + ACM certificate** in front of EC2 so CloudFront→origin
  is HTTPS; point these two behaviors at the ALB. (Simpler alternative: HTTP-only
  custom origin straight to the Elastic IP / Nginx :80.)
- Attach an **ACM cert** (in `us-east-1`) for `hr.yourdomain.com` to the distribution.
- Route 53: A/ALIAS record `hr.yourdomain.com` → the CloudFront distribution.
- Update the S3 frontend bucket policy to allow read from this distribution's OAC.

## 7. Deploy the frontend

```bash
S3_FRONTEND_BUCKET=somhr-frontend \
CLOUDFRONT_DISTRIBUTION_ID=E123ABC456 \
./deploy/frontend.sh all          # install → build → sync → invalidate
```

## 8. CI/CD (GitHub Actions)

Add the secrets/variables from [ENVIRONMENT.md](./ENVIRONMENT.md). Then every push
to `main`:

```
lint → typecheck → test → build (frontend + backend) → deploy
  deploy: frontend → S3 + CloudFront invalidation
          backend  → SSH to EC2 → ./deploy/backend.sh deploy
```

`deploy/backend.sh deploy` runs `git pull → npm ci → prisma generate →
prisma migrate deploy → build → pm2 reload`. Migrations are applied
automatically on every backend release.

## 9. Observability (CloudWatch)

- Install the CloudWatch agent on EC2; ship PM2 logs (`~/.pm2/logs/*.log`) and
  Nginx access/error logs.
- Alarms worth adding: RDS CPU / free storage / connections; EC2 CPU + status
  checks; ALB 5xx; CloudFront 5xx error rate.

---

## Manual release (without CI)

```bash
# backend
ssh ubuntu@<host> 'cd ~/app && ./deploy/backend.sh deploy'
# frontend
S3_FRONTEND_BUCKET=... CLOUDFRONT_DISTRIBUTION_ID=... ./deploy/frontend.sh all
```

See [ROLLBACK.md](./ROLLBACK.md) if a release needs to be reverted.
