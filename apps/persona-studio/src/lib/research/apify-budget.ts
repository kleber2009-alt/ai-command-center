// Месячный cap на расход Apify (ТЗ §16 «риск Apify бюджет»).
//
// Каждый успешный scrape инкрементит ResearchApifyUsage.estCostCents:
//   estCostCents += itemsScraped * env.APIFY_CENTS_PER_ITEM
//
// Перед скрейпом — проверяем не превышен ли cap. Если да — возвращаем
// сразу error, не дёргая Apify. Дополнительно при пересечении порогов
// 75/90/100% пишем WARN-лог (для алёртов).

import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import {
  scrapeAccountPosts as _scrapeAccountPosts,
  scrapeAccountDetails as _scrapeAccountDetails,
  scrapeHashtagPosts as _scrapeHashtagPosts,
  scrapeSearchReels as _scrapeSearchReels,
  type ScrapeResult,
  type ProfileResult,
} from '@/lib/parser/apify';

const ALERT_THRESHOLDS = [75, 90, 100] as const;

function currentMonth(): string {
  // YYYYMM; интернационально безопасный (UTC). Передаётся всегда явно
  // через runtime — никаких Date.now-зависимостей в schema.
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type BudgetCheck =
  | { ok: true; remainingCents: number }
  | { ok: false; reason: 'over_budget'; spentCents: number; budgetCents: number };

/**
 * Проверка перед вызовом Apify. Возвращает ok=false если бюджет
 * текущего месяца исчерпан. Вызывается из scrape-функций.
 */
export async function checkApifyBudget(): Promise<BudgetCheck> {
  const budgetCents = env.APIFY_MONTHLY_BUDGET_CENTS;
  if (budgetCents <= 0) return { ok: true, remainingCents: Infinity };

  const row = await prisma.researchApifyUsage.findUnique({
    where: { month: currentMonth() },
  });
  const spent = row?.estCostCents ?? 0;
  if (spent >= budgetCents) {
    return { ok: false, reason: 'over_budget', spentCents: spent, budgetCents };
  }
  return { ok: true, remainingCents: budgetCents - spent };
}

/**
 * Регистрация расхода после успешного скрейпа. Возвращает обновлённый
 * счётчик. Если пересекли threshold — пишем WARN.
 */
export async function recordApifyUsage(opts: {
  itemsScraped: number;
}): Promise<{ spentCents: number; budgetCents: number; pct: number }> {
  const month = currentMonth();
  const budgetCents = env.APIFY_MONTHLY_BUDGET_CENTS;
  const addCents = Math.round(opts.itemsScraped * env.APIFY_CENTS_PER_ITEM);

  const row = await prisma.researchApifyUsage.upsert({
    where: { month },
    create: {
      month,
      callsMade: 1,
      itemsScraped: opts.itemsScraped,
      estCostCents: addCents,
      lastAlertPct: 0,
    },
    update: {
      callsMade: { increment: 1 },
      itemsScraped: { increment: opts.itemsScraped },
      estCostCents: { increment: addCents },
    },
  });

  const pct = budgetCents > 0 ? Math.floor((row.estCostCents / budgetCents) * 100) : 0;
  // Алёрт когда впервые перешагнули threshold
  const crossed = ALERT_THRESHOLDS.find(
    (t) => row.estCostCents >= (budgetCents * t) / 100 && row.lastAlertPct < t,
  );
  if (crossed) {
    console.warn(
      `[apify-budget] month=${month} reached ${crossed}% — spent=${(row.estCostCents / 100).toFixed(2)}$ of ${(budgetCents / 100).toFixed(2)}$ (items=${row.itemsScraped}, calls=${row.callsMade})`,
    );
    await prisma.researchApifyUsage.update({
      where: { month },
      data: { lastAlertPct: crossed },
    });
  }

  return { spentCents: row.estCostCents, budgetCents, pct };
}

/**
 * Обёртки над scrape-функциями: guard + автоматический recordUsage на
 * успешном ответе. Caller'у не нужно помнить про budget.
 */
export async function guardedScrapeAccount(
  handle: string,
  opts: { days?: number; limit?: number } = {},
): Promise<ScrapeResult> {
  const check = await checkApifyBudget();
  if (!check.ok) {
    return { ok: false, error: `apify_budget_exceeded: ${(check.spentCents / 100).toFixed(2)}$ of ${(check.budgetCents / 100).toFixed(2)}$` };
  }
  const r = await _scrapeAccountPosts(handle, opts);
  if (r.ok) await recordApifyUsage({ itemsScraped: r.items.length });
  return r;
}

/**
 * Профиль аккаунта (followers / posts / avatar) — отдельный дешёвый вызов
 * (1 item), т.к. скрейп рилсов 'posts' не несёт счётчик подписчиков.
 */
export async function guardedScrapeDetails(handle: string): Promise<ProfileResult> {
  const check = await checkApifyBudget();
  if (!check.ok) {
    return { ok: false, error: `apify_budget_exceeded: ${(check.spentCents / 100).toFixed(2)}$ of ${(check.budgetCents / 100).toFixed(2)}$` };
  }
  const r = await _scrapeAccountDetails(handle);
  if (r.ok) await recordApifyUsage({ itemsScraped: 1 });
  return r;
}

export async function guardedScrapeHashtag(
  tag: string,
  opts: { days?: number; limit?: number } = {},
): Promise<ScrapeResult> {
  const check = await checkApifyBudget();
  if (!check.ok) {
    return { ok: false, error: `apify_budget_exceeded: ${(check.spentCents / 100).toFixed(2)}$ of ${(check.budgetCents / 100).toFixed(2)}$` };
  }
  const r = await _scrapeHashtagPosts(tag, opts);
  if (r.ok) await recordApifyUsage({ itemsScraped: r.items.length });
  return r;
}

export async function guardedSearchReels(
  query: string,
  opts: { maxPages?: number } = {},
): Promise<ScrapeResult> {
  const check = await checkApifyBudget();
  if (!check.ok) {
    return { ok: false, error: `apify_budget_exceeded: ${(check.spentCents / 100).toFixed(2)}$ of ${(check.budgetCents / 100).toFixed(2)}$` };
  }
  const r = await _scrapeSearchReels(query, opts);
  if (r.ok) await recordApifyUsage({ itemsScraped: r.items.length });
  return r;
}

/**
 * Read-only снимок для UI/admin.
 */
export async function getApifyUsage(month?: string) {
  const m = month || currentMonth();
  const row = await prisma.researchApifyUsage.findUnique({ where: { month: m } });
  const budgetCents = env.APIFY_MONTHLY_BUDGET_CENTS;
  return {
    month: m,
    spentCents: row?.estCostCents ?? 0,
    budgetCents,
    pct: budgetCents > 0 ? Math.floor(((row?.estCostCents ?? 0) / budgetCents) * 100) : 0,
    itemsScraped: row?.itemsScraped ?? 0,
    callsMade: row?.callsMade ?? 0,
  };
}
