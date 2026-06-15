# Backup strategy

Three things hold state: **RDS** (the database), **S3 uploads** (documents,
logos, signatures, resumes), and the **app secrets**. Each has its own backup +
restore path. Code is in Git and rebuildable, so it isn't "backed up" here.

## 1. Database — RDS MySQL

**Automated backups (primary).**
- Enable automated backups with **7–35 day** retention (35 for prod).
- Set the backup window outside business hours; enables point-in-time recovery
  (PITR) to any second within the retention window.
- Enable **Multi-AZ** so a hardware failure fails over without data loss.

**Manual snapshots (before risky changes).**
```bash
aws rds create-db-snapshot \
  --db-instance-identifier somhr \
  --db-snapshot-identifier somhr-pre-release-$(date +%Y%m%d)
```
Take one before any release that includes a destructive migration.

**Logical dump (portable, off-AWS copy).** Run from a host that can reach RDS:
```bash
mysqldump --single-transaction --routines --triggers \
  -h <rds-endpoint> -u admin -p somhr | gzip > somhr-$(date +%F).sql.gz
aws s3 cp somhr-$(date +%F).sql.gz s3://somhr-backups/db/
```
Schedule this weekly (cron / a small Lambda / the `/schedule` routine) and apply
an S3 lifecycle rule to expire old dumps.

## 2. Uploads — S3

- Enable **Versioning** on `somhr-uploads` so overwrites/deletes are recoverable.
- Enable **Cross-Region Replication** (or same-region replication) to a second
  bucket for disaster recovery.
- Optionally enable **S3 Object Lock** (governance mode) on the documents prefix
  for tamper-evident retention of exit letters / payslips.
- Lifecycle: transition old objects to Infrequent Access / Glacier to cut cost.

## 3. Secrets

- Store `backend/.env` as an **SSM Parameter Store SecureString** (or Secrets
  Manager). That is itself versioned and is the source of truth — re-fetch it on
  a fresh instance instead of hand-editing.
- Keep JWT secrets and DB credentials out of Git (already gitignored).

## 4. Restore procedures

**Restore the database (PITR) to a new instance:**
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier somhr \
  --target-db-instance-identifier somhr-restored \
  --restore-time 2026-06-15T09:30:00Z
```
Then repoint `DATABASE_URL` at `somhr-restored`, `pm2 reload`, verify, and (once
healthy) rename/replace the old instance.

**Restore from a snapshot:**
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier somhr-restored \
  --db-snapshot-identifier somhr-pre-release-20260615
```

**Restore from a logical dump:**
```bash
gunzip < somhr-2026-06-15.sql.gz | mysql -h <rds-endpoint> -u admin -p somhr
```

**Restore an upload** (versioned bucket): list versions and copy the wanted one
back over the current key:
```bash
aws s3api list-object-versions --bucket somhr-uploads --prefix uploads/<file>
aws s3api copy-object --bucket somhr-uploads --key uploads/<file> \
  --copy-source somhr-uploads/uploads/<file>?versionId=<VERSION>
```

## 5. Test your backups

A backup you haven't restored is a hope, not a backup. Quarterly: restore the
latest snapshot to a throwaway instance, point a staging deploy at it, and log
in. Record the **RPO** (≤ minutes with PITR) and **RTO** (restore + cutover time)
you actually observe.
