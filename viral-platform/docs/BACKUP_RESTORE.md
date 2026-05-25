# viral-platform — Backup & Migration

Everything you need to back up the stack and move it to another server.

## 1. Where the state lives

| State | Where | Backup strategy | Critical? |
|---|---|---|---|
| **Postgres DB** (users, projects, clips, broll_plans, **user_assets + pgvector embeddings**, collections, credits ledger, renders, subscriptions) | container `vp-postgres`, volume `vp_pg_data` | `scripts/backup.sh` → custom-format dump | **YES** — the only irreplaceable on-box data |
| **Media** (source videos, renders, library assets + thumbnails) | **Cloudflare R2** buckets `viral-videos`, `user-library` | R2 is off-box & durable; enable bucket **versioning**, or `rclone sync` to a second bucket | YES (but lives in R2, not on the server) |
| **Secrets** | `/etc/viral-platform.env` | copy to a password manager / secrets vault (NOT git) | YES |
| **Redis** (BullMQ queues + SSE progress cache) | container `vp-redis`, volume `vp_redis_data` | not backed up — transient; the pipeline is idempotent, lost jobs are re-triggered | no |
| **App code** | git (`viral-platform/`) | already in the repo | no |
| **Generated artifacts** (`.next`, `dist`, images) | rebuilt from source | none | no |

> Key point: a **server move does not move media** — videos/renders/library
> assets stay in R2. You only carry the **Postgres dump** + **secrets** to the
> new box. Touch R2 only if you also switch R2 account/provider (see §5).

## 2. Backup (Postgres)

Manual:
```bash
cd /root/ai-command-center-vp/viral-platform   # or wherever the worktree lives
./scripts/backup.sh
# → /root/backups/viral-platform/vp_pg_YYYYMMDD_HHMMSS.dump
```

Scheduled (cron, daily 03:17 UTC, 14-day local retention):
```cron
17 3 * * *  /root/ai-command-center-vp/viral-platform/scripts/backup.sh >> /var/log/vp-backup.log 2>&1
```

Off-box copy (recommended) — set `VP_RCLONE_REMOTE` and have `rclone` configured:
```bash
VP_RCLONE_REMOTE=r2:vp-db-backups ./scripts/backup.sh
```

Tunables (env): `VP_PG_CONTAINER`, `VP_ENV_FILE`, `VP_BACKUP_DIR`,
`VP_BACKUP_RETAIN_DAYS`, `VP_RCLONE_REMOTE`.

The dump is custom-format (`pg_dump -Fc`), includes `CREATE EXTENSION vector`
and the data, and restores standalone into the pgvector image.

## 3. Restore (same or new box)

```bash
# stop writers so nothing changes mid-restore
docker compose -f docker-compose.prod.yml stop vp-web \
  vp-worker-transcribe vp-worker-detect vp-worker-broll \
  vp-worker-library vp-worker-render

./scripts/restore.sh /path/to/vp_pg_YYYYMMDD_HHMMSS.dump   # drops+recreates, idempotent

docker compose -f docker-compose.prod.yml --env-file /etc/viral-platform.env up -d
```
`restore.sh` ensures the `vector` extension, runs `pg_restore --clean
--if-exists`, then prints a table/HNSW-index count to confirm.

> The target Postgres must be the **pgvector image ≥ 0.8** (halfvec HNSW). The
> compose file already pins `pgvector/pgvector:pg16`.

## 4. Full migration to a NEW server

1. **Provision** Docker + Docker Compose v2 on the new box. Open ports as needed
   (only the web host port `3018` needs to reach Caddy; Postgres/Redis stay internal).
2. **Code**: `git clone git@github.com:kleber2009-alt/ai-command-center.git`
   then `git worktree add /root/ai-command-center-vp origin/<branch>` (or, once
   merged, plain `main`). Self-contained — only `viral-platform/` is needed to build.
3. **Secrets**: recreate `/etc/viral-platform.env` from your vault
   (`chmod 600`). If only the server changes (same R2/Clerk/etc.), the values
   are unchanged.
4. **Latest dump**: copy `vp_pg_*.dump` to the new box (or pull from R2 with rclone).
5. **Bring up DB + restore**:
   ```bash
   cd /root/ai-command-center-vp/viral-platform
   C="docker compose -f docker-compose.prod.yml --env-file /etc/viral-platform.env"
   $C build
   $C up -d vp-postgres vp-redis
   ./scripts/restore.sh /root/vp_pg_LATEST.dump      # restores schema + data
   $C up -d                                          # web + workers
   ```
   (If you prefer a clean schema instead of a dump — e.g. first ever deploy —
   run `$C run --rm vp-worker-broll pnpm --filter @vp/db migrate` instead of restore.)
6. **Caddy / DNS**: new IP ⇒ new host. Append a route (see
   `deploy/Caddyfile.snippet`, change the host to the new IP's nip.io or your
   domain), `caddy reload`. Point DNS at the new box if using a custom domain.
7. **Rotate webhook URLs** to the new domain:
   - Clerk → `https://<new-host>/api/webhooks/clerk`
   - Stripe (once billing is wired) → the new endpoint.
8. **Verify**: `$C ps`, `curl -fsS http://localhost:3018/`, sign in, open `/library`.
9. **Decommission old box** only after the new one serves traffic and a fresh
   backup has been taken there.

## 5. Moving the media (only if changing R2 account/provider)

Media normally stays put in R2. If you must relocate it, use `rclone` between
S3-compatible remotes:
```bash
rclone sync old-r2:viral-videos  new-r2:viral-videos  --transfers=16
rclone sync old-r2:user-library  new-r2:user-library  --transfers=16
```
Then update `R2_*` in `/etc/viral-platform.env` and recreate the stack.
DB rows store **R2 keys** (not absolute URLs), so as long as the bucket
names/keys match, no DB changes are needed.

## 6. Disaster-recovery drill (do this once)

1. Take a backup on prod.
2. On a scratch box: bring up `vp-postgres` (pgvector image), run `restore.sh`.
3. Confirm row counts and that `SELECT ... ORDER BY embedding::halfvec(3072) <=> ...`
   returns rows (pgvector search works).
4. Note the wall-clock restore time → that's your RTO.
