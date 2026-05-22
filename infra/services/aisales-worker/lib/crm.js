// ═══════════════════════════════════════════════════════════════════
// lib/crm.js — read-only summaries of the CRM (clients table)
// ───────────────────────────────────────────────────────────────────
// Currently the `clients` table is NOT user-scoped — there's no
// owner_user_id column. So getPipelineSummary() reads the whole
// table; when multi-tenant is added, filter by ownerUserId.
//
// Used by orchestrator-type handlers (Алиса) to ground answers in
// actual deal data instead of generic platitudes.
// ═══════════════════════════════════════════════════════════════════

import { query } from './db.js';

/**
 * Aggregate the CRM pipeline.
 *
 * @param {object} opts
 * @param {string|null} [opts.ownerUserId] — reserved for future multi-tenant
 * @param {number} [opts.staleDays=5] — days without contact = stale
 * @returns {Promise<{
 *   total: number,
 *   open: number,
 *   byStage: Array<{stage: string, n: number, sumPredicted: number, avgQual: number}>,
 *   stale: Array<{display_name: string, stage: string, days_silent: number}>,
 *   highQuality: Array<{display_name: string, stage: string, qual: number, predicted: number}>,
 *   weighted: number,
 *   closedWon: {n: number, sum: number}
 * } | null>}
 */
export async function getPipelineSummary({ ownerUserId = null, staleDays = 5 } = {}) {
  // _ownerUserId reserved — table has no such column yet
  void ownerUserId;

  const byStage = await query(`
    SELECT funnel_stage::text AS stage,
           count(*) AS n,
           COALESCE(SUM(predicted_deal_amount), 0)::numeric AS sum_predicted,
           ROUND(AVG(qual_score)::numeric, 1) AS avg_qual
      FROM clients
     GROUP BY funnel_stage
     ORDER BY count(*) DESC
  `);
  if (byStage.length === 0) return null;

  const total = byStage.reduce((s, r) => s + Number(r.n), 0);
  const openStages = byStage.filter((r) => r.stage !== 'closed_won' && r.stage !== 'closed_lost');
  const open = openStages.reduce((s, r) => s + Number(r.n), 0);

  // Weighted pipeline (rough industry-standard weights per stage)
  const STAGE_WEIGHTS = {
    hello: 0.05,
    discovery: 0.2,
    pitch: 0.4,
    objections: 0.55,
    close: 0.75,
    followup: 0.25,
  };
  const weighted = openStages.reduce((s, r) => {
    const w = STAGE_WEIGHTS[r.stage] ?? 0.1;
    return s + Number(r.sum_predicted) * w;
  }, 0);

  // Closed won this period
  const closedRow = byStage.find((r) => r.stage === 'closed_won') || { n: 0, sum_predicted: 0 };
  const closedWon = {
    n: Number(closedRow.n),
    sum: Number(closedRow.sum_predicted),
  };

  // Stale deals — open AND silent for ≥ staleDays
  const stale = await query(
    `
    SELECT COALESCE(display_name, ig_username, tg_username, email, 'unknown') AS display_name,
           funnel_stage::text AS stage,
           EXTRACT(DAY FROM (NOW() - last_contact_at))::int AS days_silent
      FROM clients
     WHERE funnel_stage NOT IN ('closed_won', 'closed_lost')
       AND last_contact_at < NOW() - ($1 || ' days')::interval
     ORDER BY last_contact_at ASC NULLS LAST
     LIMIT 5
  `,
    [String(staleDays)],
  );

  // High-quality open deals
  const highQuality = await query(`
    SELECT COALESCE(display_name, ig_username, tg_username, email, 'unknown') AS display_name,
           funnel_stage::text AS stage,
           qual_score AS qual,
           COALESCE(predicted_deal_amount, 0)::numeric AS predicted
      FROM clients
     WHERE qual_score >= 70
       AND funnel_stage NOT IN ('closed_won', 'closed_lost')
     ORDER BY qual_score DESC, predicted_deal_amount DESC NULLS LAST
     LIMIT 5
  `);

  return {
    total,
    open,
    byStage: byStage.map((r) => ({
      stage: r.stage,
      n: Number(r.n),
      sumPredicted: Number(r.sum_predicted),
      avgQual: r.avg_qual !== null ? Number(r.avg_qual) : null,
    })),
    stale: stale.map((r) => ({
      display_name: r.display_name,
      stage: r.stage,
      days_silent: Number(r.days_silent),
    })),
    highQuality: highQuality.map((r) => ({
      display_name: r.display_name,
      stage: r.stage,
      qual: Number(r.qual),
      predicted: Number(r.predicted),
    })),
    weighted: Math.round(weighted),
    closedWon,
  };
}

/**
 * Compact rendering of a pipeline summary suitable for injection into
 * an LLM system prompt. Keeps it under ~600 chars.
 */
export function renderPipelineForPrompt(s) {
  if (!s) return 'CRM пуст или нет данных — расскажи о готовности команды без апелляции к воронке.';
  const stages = s.byStage
    .map((r) => `${r.stage}:${r.n}${r.sumPredicted ? `(${Math.round(r.sumPredicted / 1000)}k)` : ''}`)
    .join(' ');
  const lines = [
    `Воронка: ${s.total} клиентов, открытых ${s.open}.`,
    `Стадии: ${stages}.`,
    `Взвешенный pipeline: ${Math.round(s.weighted / 1000)}k ₽. Closed won: ${s.closedWon.n} × ${Math.round(s.closedWon.sum / 1000)}k ₽.`,
  ];
  if (s.stale.length > 0) {
    lines.push(`Застоявшиеся сделки: ${s.stale.map((x) => `${x.display_name} (${x.stage}, ${x.days_silent}д)`).join(', ')}.`);
  }
  if (s.highQuality.length > 0) {
    lines.push(`Высокий qual_score: ${s.highQuality.map((x) => `${x.display_name} (${x.stage}, q=${x.qual}, ${Math.round(x.predicted / 1000)}k)`).join(', ')}.`);
  }
  return lines.join('\n');
}
