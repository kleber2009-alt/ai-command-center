// Weekly content-plan refresh. Reads analytics + current plan, asks Claude
// (Opus) for the next 14 days as a JSON list. Writes a SUGGESTED plan into
// data/analytics/weekly-reports/<date>.json and posts the diff to Telegram —
// the owner approves manually before it replaces content-plan.json.
//
// Per ТЗ §3.9: cron is Sunday 10:00 (TZ from env).

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callClaude } from '../generators/claude.js';
import { readPlan, type ContentPlanItem } from '../lib/content-plan.js';
import { dataPath } from '../lib/paths.js';
import { loadRubrics } from '../lib/rubrics.js';
import { log } from '../lib/logger.js';

interface PostMetrics {
  id: string;
  rubric: string;
  topic: string;
  publishedAt?: string;
  metrics?: { reach?: number; saves?: number; likes?: number; comments?: number; profileVisits?: number };
  hookFirstLine?: string;
}

function readAnalytics(): PostMetrics[] {
  const p = dataPath('analytics', 'posts.json');
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { posts?: PostMetrics[] };
    return raw.posts ?? [];
  } catch {
    return [];
  }
}

function nextDays(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'type', 'rubric', 'topic'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          type: { type: 'string', enum: ['carousel', 'reels'] },
          rubric: { type: 'string', minLength: 1 },
          topic: { type: 'string', minLength: 1 },
          episode: { type: 'integer', minimum: 1 },
          rationale: { type: 'string' },
        },
      },
    },
  },
} as const;

interface PlanProposal {
  items: Array<{ date: string; type: 'carousel' | 'reels'; rubric: string; topic: string; episode?: number; rationale?: string }>;
}

export async function runWeeklyInsights(): Promise<{ reportPath: string; proposal: PlanProposal }> {
  const rubrics = loadRubrics();
  const readyRubrics = Object.entries(rubrics)
    .filter(([, r]) => !r.formula.startsWith('TODO'))
    .map(([slug]) => slug);
  const analytics = readAnalytics();
  const plan = readPlan();
  const window = nextDays(14);

  const summary = analytics.length === 0
    ? 'No analytics yet — propose a balanced kickoff plan.'
    : `Last ${analytics.length} posts:\n` + analytics
        .slice(-14)
        .map((p) => `- ${p.id} [${p.rubric}] "${p.topic}" → reach=${p.metrics?.reach ?? '?'} saves=${p.metrics?.saves ?? '?'} comments=${p.metrics?.comments ?? '?'}`)
        .join('\n');

  const prompt = [
    '# Weekly content-plan refresh',
    '',
    `Available rubrics (use ONLY these slugs): ${readyRubrics.join(', ')}`,
    '',
    `Window: ${window[0]} … ${window[window.length - 1]} (${window.length} days).`,
    'Output exactly 14 days × 2 items/day (1 carousel + 1 reels) = up to 28 items. Distribute rubrics evenly. Avoid topic duplicates from the existing plan.',
    '',
    '## Current plan items (last 7 days, for reference)',
    plan.items.slice(-14).map((it) => `- ${it.date} ${it.type} [${it.rubric}] "${it.topic}" — ${it.status}`).join('\n') || '(empty)',
    '',
    '## Analytics summary',
    summary,
    '',
    '## Return',
    'JSON: { "items": [ { "date": "YYYY-MM-DD", "type": "carousel"|"reels", "rubric": "slug", "topic": "RU", "episode": <int>, "rationale": "1 предложение почему эта тема" }, ... ] }',
    'Dates strictly from the window above. Each rubric ≥ 2 items in 14 days. Vary types per day. No fluff.',
  ].join('\n');

  const proposal = await callClaude<PlanProposal>({
    prompt,
    outputSchema: planSchema,
    model: 'opus',
    maxTokens: 4096,
    temperature: 1,
  });

  const today = new Date().toISOString().slice(0, 10);
  const reportDir = dataPath('analytics', 'weekly-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${today}-proposal.json`);
  writeFileSync(reportPath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  log.info('Weekly insights generated', { reportPath, items: proposal.items.length });
  return { reportPath, proposal };
}

/** Helper used by scheduler to actually apply a proposal (after manual approval
 * arrives or in auto-mode). Generates IDs and sets status=planned. */
export function applyProposalAsPlan(proposal: PlanProposal): ContentPlanItem[] {
  return proposal.items.map((p, i) => ({
    id: `${p.date}-${p.type}-${i + 1}`,
    date: p.date,
    type: p.type,
    rubric: p.rubric,
    topic: p.topic,
    episode: p.episode ?? 1,
    status: 'planned' as const,
    rationale: p.rationale,
  }));
}
