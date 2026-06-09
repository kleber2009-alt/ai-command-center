// Baseline-aware migration deploy for Persona Studio.
//
// The prod database was originally created with `prisma db push` (declarative,
// no migration history). The first time we adopt versioned migrations, a plain
// `migrate deploy` would try to run 0_init's CREATE TABLEs against a schema that
// already exists and fail. This script detects that situation and baselines
// instead:
//
//   - schema exists, no _prisma_migrations history  → resolve 0_init as applied
//                                                      (record it WITHOUT running
//                                                      its SQL), then deploy.
//   - empty database (no history, no schema)         → deploy creates everything.
//   - history already present                        → deploy applies new ones.
//
// Run inside the web container: `node prisma/deploy.mjs`. Idempotent — safe to
// run on every deploy.
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const BASELINE = '0_init';
const prisma = new PrismaClient();
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

try {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_history,
            to_regclass('public."User"')             IS NOT NULL AS has_schema`,
  );
  const { has_history, has_schema } = rows[0];

  if (!has_history && has_schema) {
    console.log(`[migrate] existing schema without migration history → baselining ${BASELINE}`);
    run(`npx -y prisma@5.22.0 migrate resolve --applied ${BASELINE}`);
  }

  console.log('[migrate] applying pending migrations (migrate deploy)…');
  run('npx -y prisma@5.22.0 migrate deploy');
  console.log('[migrate] done');
} finally {
  await prisma.$disconnect();
}
