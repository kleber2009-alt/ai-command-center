# Migrations

Persona Studio uses **versioned Prisma migrations** (not `db push`).

- `0_init` — baseline: the full schema as it existed when migrations were
  adopted (generated offline via `prisma migrate diff --from-empty`).

## How deploys apply migrations

The deploy workflow runs `node prisma/deploy.mjs` inside the web container.
It is **baseline-aware** and idempotent:

| DB state | Action |
|---|---|
| Schema exists, no `_prisma_migrations` history (the prod DB, created via `db push`) | Record `0_init` as applied **without** re-running it, then `migrate deploy` |
| Empty DB (new environment) | `migrate deploy` creates everything |
| History already present | `migrate deploy` applies only new migrations |

So no manual step is required — the first deploy after adopting migrations
baselines the existing prod schema automatically.

### Manual baseline (fallback)

If you ever need to baseline by hand on a DB that already has the schema:

```bash
docker compose exec -T web npx -y prisma@5.22.0 migrate resolve --applied 0_init
docker compose exec -T web npx -y prisma@5.22.0 migrate deploy
```

## Adding a new migration

Locally, against a dev database:

```bash
cd apps/persona-studio
npm run db:migrate            # prisma migrate dev --name <change>
```

Commit the generated `prisma/migrations/<timestamp>_<name>/` folder. The next
deploy applies it via `migrate deploy`. Do **not** use `db push` against prod
anymore — it bypasses migration history.
