// Phase 5: cron scheduler. Four jobs:
//
//   - carousel  (default 0 8 * * *)  → finds today's planned/pending carousel
//   - reels     (default 0 14 * * *) → same for reels
//   - insights  (default 0 10 * * 0) → Sunday refresh proposal (saved to disk
//                                       + Telegram banner asking for approval)
//   - heartbeat (default 0 23 * * *) → daily summary in Telegram
//
// All crons read TZ from env (default Europe/Moscow). Failures are logged,
// status flipped to 'failed', and a Telegram alert is sent if delivery is
// configured.

import cron from 'node-cron';
import { runCarouselPipeline } from './pipelines/carousel.js';
import { runReelsPipeline } from './pipelines/reels.js';
import { runWeeklyInsights } from './pipelines/weekly-insights.js';
import {
  findPendingForToday,
  findStuck,
  markItem,
  readPlan,
  type ContentPlanItem,
  type PlanFormat,
} from './lib/content-plan.js';
import { log } from './lib/logger.js';
import { readBotState } from './lib/bot-toggle.js';

const TZ = process.env.TZ || 'Europe/Moscow';
const CAROUSEL_CRON = process.env.CAROUSEL_CRON || '0 8 * * *';
const REELS_CRON = process.env.REELS_CRON || '0 14 * * *';
const INSIGHTS_CRON = process.env.INSIGHTS_CRON || '0 10 * * 0';
const HEARTBEAT_CRON = process.env.HEARTBEAT_CRON || '0 23 * * *';

async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (err) {
    log.warn('Telegram alert failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

async function alert(text: string): Promise<void> {
  log.warn(`ALERT: ${text}`);
  await sendTelegramMessage(`⚠️ *AI Content Factory*\n\n${text}`);
}

async function info(text: string): Promise<void> {
  log.info(text);
  await sendTelegramMessage(`✓ *AI Content Factory*\n\n${text}`);
}

/** Picks the next item to work on: today's first, then yesterday's stuck. */
function nextItem(format: PlanFormat): ContentPlanItem | undefined {
  return findPendingForToday(format) ?? findStuck(format);
}

async function runCarousel(): Promise<void> {
  const item = nextItem('carousel');
  if (!item) {
    log.info('Carousel cron: nothing planned for today');
    return;
  }
  markItem(item.id, { status: 'generating', lastTriedAt: new Date().toISOString() });
  try {
    const result = await runCarouselPipeline({
      slug: item.rubric,
      topic: item.topic,
      episode: item.episode,
      slideCount: item.slideCount,
      deliver: true,
      rag: true,
    });
    const runId = result.outDir.split('/').pop() ?? '';
    markItem(item.id, { status: 'delivered', runId, lastError: undefined });
    log.info('Carousel cron OK', { id: item.id, runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markItem(item.id, { status: 'failed', lastError: message });
    await alert(`Carousel cron failed for *${item.id}*:\n\`${message.slice(0, 300)}\``);
  }
}

async function runReels(): Promise<void> {
  const item = nextItem('reels');
  if (!item) {
    log.info('Reels cron: nothing planned for today');
    return;
  }
  markItem(item.id, { status: 'generating', lastTriedAt: new Date().toISOString() });
  try {
    const result = await runReelsPipeline({
      slug: item.rubric,
      topic: item.topic,
      episode: item.episode,
      deliver: true,
      rag: true,
    });
    const runId = result.outDir.split('/').pop() ?? '';
    markItem(item.id, { status: 'delivered', runId, lastError: undefined });
    log.info('Reels cron OK', { id: item.id, runId, mode: result.mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markItem(item.id, { status: 'failed', lastError: message });
    await alert(`Reels cron failed for *${item.id}*:\n\`${message.slice(0, 300)}\``);
  }
}

async function runInsightsCron(): Promise<void> {
  try {
    const { reportPath, proposal } = await runWeeklyInsights();
    const summary = proposal.items
      .slice(0, 6)
      .map((p) => `• ${p.date} *${p.type}* [${p.rubric}] — ${p.topic}`)
      .join('\n');
    await info(
      `*Weekly insights*\n\nClaude предложил план на ${proposal.items.length} постов.\n\n${summary}\n…\n\nПолный proposal: \`${reportPath}\`\nПроверь и применить через UI (или \`cli/apply-plan.js\`).`,
    );
  } catch (err) {
    await alert(`Weekly insights failed: \`${err instanceof Error ? err.message : String(err)}\``);
  }
}

async function runHeartbeat(): Promise<void> {
  const plan = readPlan();
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = plan.items.filter((it) => it.date === today);
  const delivered = todayItems.filter((it) => it.status === 'delivered').length;
  const failed = todayItems.filter((it) => it.status === 'failed').length;
  const pending = todayItems.filter((it) => it.status === 'planned' || it.status === 'pending_delivery').length;
  const lines = [
    `*Daily heartbeat · ${today}*`,
    '',
    `✓ delivered: ${delivered}`,
    `✗ failed: ${failed}`,
    `… pending: ${pending}`,
  ];
  if (failed > 0) {
    const failedItems = todayItems.filter((it) => it.status === 'failed');
    lines.push('', '*Failed:*');
    for (const it of failedItems) lines.push(`• ${it.id} — \`${(it.lastError ?? 'unknown').slice(0, 200)}\``);
  }
  await sendTelegramMessage(lines.join('\n'));
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule(CAROUSEL_CRON, () => {
    if (!readBotState().carousel) { log.info('Carousel cron skipped — bot disabled via UI'); return; }
    void runCarousel();
  }, { timezone: TZ });
  cron.schedule(REELS_CRON, () => {
    if (!readBotState().reels) { log.info('Reels cron skipped — bot disabled via UI'); return; }
    void runReels();
  }, { timezone: TZ });
  cron.schedule(INSIGHTS_CRON, () => { void runInsightsCron(); }, { timezone: TZ });
  cron.schedule(HEARTBEAT_CRON, () => { void runHeartbeat(); }, { timezone: TZ });

  log.info('Scheduler started', {
    tz: TZ,
    carousel: CAROUSEL_CRON,
    reels: REELS_CRON,
    insights: INSIGHTS_CRON,
    heartbeat: HEARTBEAT_CRON,
  });
}

// Exported for manual triggers from the cabinet UI / server endpoints.
export const triggers = {
  carousel: runCarousel,
  reels: runReels,
  insights: runInsightsCron,
  heartbeat: runHeartbeat,
};
