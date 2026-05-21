// ═══════════════════════════════════════════════════════════════════
// handlers/viral_clone_sweep.js — orphan reviver для viral_pipelines
// ───────────────────────────────────────────────────────────────────
// Запускается из schedule_rules ('viral_clone_sweep', '*/5 * * * *').
//
// Сценарий, который этот sweep лечит:
//   pipeline в non-terminal стадии, но ни одного pending/running
//   scheduled_job на kind='viral_clone' с payload.pipeline_id=<id>
//   не существует. Это бывает когда:
//     • воркер падал между UPDATE stage и INSERT scheduled_jobs
//     • job был помечен failed после MAX_ATTEMPTS, но pipeline остался жив
//     • ручное вмешательство в БД
//
// Что делаем: вставляем свежий viral_clone job на NOW(). Сам handler
// (viral_clone.js) на следующем тике увидит, что stage_started_at
// просрочен по бюджету стадии, и переведёт pipeline в 'failed' с
// понятным сообщением пользователю.
// ═══════════════════════════════════════════════════════════════════

import { query } from '../lib/db.js';

export async function handle(/* job */) {
  const rows = await query(`
    SELECT p.id, p.stage, p.stage_started_at
      FROM viral_pipelines p
     WHERE p.stage NOT IN ('delivered', 'failed')
       AND NOT EXISTS (
         SELECT 1 FROM scheduled_jobs sj
          WHERE sj.kind = 'viral_clone'
            AND sj.status IN ('pending', 'running')
            AND sj.payload->>'pipeline_id' = p.id::text
       )
  `);

  if (rows.length === 0) {
    return { ok: true, swept: 0 };
  }

  let revived = 0;
  for (const r of rows) {
    await query(
      `INSERT INTO scheduled_jobs (kind, scheduled_at, status, payload)
       VALUES ('viral_clone', NOW(), 'pending', $1::jsonb)`,
      [JSON.stringify({ pipeline_id: r.id, _swept: true })],
    );
    revived++;
    console.log(
      `[viral_clone_sweep] revived orphan pipeline=${r.id} stage=${r.stage} ` +
      `stage_age=${ageMin(r.stage_started_at)}min`,
    );
  }

  return { ok: true, swept: revived };
}

function ageMin(ts) {
  if (!ts) return '?';
  return Math.round((Date.now() - new Date(ts).getTime()) / 60000);
}
