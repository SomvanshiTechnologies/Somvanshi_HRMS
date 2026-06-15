# Rollback strategy

Roll back the three layers independently. Decide first **whether the bad release
included a database migration** — that determines whether code-only rollback is
safe.

## Decision tree

```
Bad release?
├── Frontend only (UI bug)         → redeploy previous SPA build  (§1)  ~2 min
├── Backend, NO new migration      → redeploy previous commit     (§2)  ~3 min
└── Backend WITH a new migration   → code rollback + DB decision  (§3)  varies
```

## 1. Frontend rollback (S3 + CloudFront)

The fastest path is to rebuild the previous commit and re-sync:
```bash
git checkout <previous-good-sha>
S3_FRONTEND_BUCKET=somhr-frontend CLOUDFRONT_DISTRIBUTION_ID=E123 \
  ./deploy/frontend.sh all
git checkout main
```
Because `index.html` is uploaded with `no-cache` and the invalidation clears
`/*`, users get the previous bundle on next load. (If S3 versioning is on, you
can instead restore the previous `index.html` + assets versions.)

## 2. Backend rollback — no migration

```bash
ssh ubuntu@<host>
cd ~/app
git log --oneline -n 5                 # find the last good sha
git checkout <previous-good-sha>
./deploy/backend.sh install && ./deploy/backend.sh build && ./deploy/backend.sh start
```
PM2 reloads `somhr-api` with the old code. `git checkout main` again once you cut
a proper revert commit. (Prefer `git revert <bad-sha>` on `main` so the rollback
is recorded and CI redeploys it.)

## 3. Backend rollback — with a migration

Migrations are applied by `prisma migrate deploy` on every release and are
**roll-forward** by design. Options, in order of preference:

1. **Fix forward (preferred).** Ship a new migration that corrects the problem.
   Safest when the bad migration was additive (new column/table) — old code
   usually tolerates extra columns, so just redeploy the previous *app* commit
   while leaving the schema in place, then fix forward.
2. **Compensating migration.** If a column/constraint must be undone, write a new
   migration that reverses it and deploy that. Do **not** hand-edit the
   `_prisma_migrations` table.
3. **Point-in-time DB restore (last resort, data-losing).** If the migration
   corrupted data, restore RDS to just before the release (see
   [BACKUP.md](./BACKUP.md) §4), repoint `DATABASE_URL`, and redeploy the
   previous app commit. You lose writes made after the restore point — announce
   downtime first.

Always take a **manual RDS snapshot before a destructive release** so option 3 is
fast:
```bash
aws rds create-db-snapshot --db-instance-identifier somhr \
  --db-snapshot-identifier somhr-pre-<release>
```

## 4. Verify after any rollback

- `curl https://hr.yourdomain.com/healthz` (via CloudFront → origin) is `ok`.
- Log in; load the dashboard; download a payslip; confirm Socket.IO notifications.
- Check CloudWatch for a return to baseline error rates.

## 5. Make rollbacks boring

- Tag every release (`git tag -a vYYYY.MM.DD-<n>`) so "previous good sha" is
  obvious.
- Keep migrations small and additive; avoid drop/rename in the same release that
  ships dependent code.
- Snapshot RDS before destructive migrations.
- Practice a frontend rollback once so the muscle memory exists before you need it.
