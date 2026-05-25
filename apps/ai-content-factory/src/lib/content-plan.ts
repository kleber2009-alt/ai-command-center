// Reads & mutates data/content-plan.json — the source of truth for the
// cron scheduler. Each item is one scheduled piece of content (carousel or
// reels) for a specific date + rubric. Status walks planned → generating →
// delivered → published → analyzed (the scheduler only flips the first three).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataPath } from './paths.js';

export type PlanFormat = 'carousel' | 'reels';
export type PlanStatus = 'planned' | 'generating' | 'delivered' | 'failed' | 'pending_delivery';

export interface ContentPlanItem {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM (informational — actual cron is global)
  type: PlanFormat;
  rubric: string;
  topic: string;
  episode: number;
  slideCount?: number;
  status: PlanStatus;
  rationale?: string;
  /** Set when status === 'delivered' so the UI can link the run. */
  runId?: string;
  /** Last attempt timestamp + error message, for failed/pending. */
  lastError?: string;
  lastTriedAt?: string;
}

export interface ContentPlan {
  version: string;
  items: ContentPlanItem[];
}

const PLAN_PATH = dataPath('content-plan.json');

const EMPTY_PLAN: ContentPlan = { version: 'init', items: [] };

export function readPlan(): ContentPlan {
  if (!existsSync(PLAN_PATH)) return { ...EMPTY_PLAN };
  try {
    const raw = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as ContentPlan;
    if (!raw.items || !Array.isArray(raw.items)) return { ...EMPTY_PLAN };
    return raw;
  } catch {
    return { ...EMPTY_PLAN };
  }
}

export function writePlan(plan: ContentPlan): void {
  mkdirSync(dirname(PLAN_PATH), { recursive: true });
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Find an item for today that's still pending generation/delivery. */
export function findPendingForToday(type: PlanFormat): ContentPlanItem | undefined {
  const plan = readPlan();
  const date = today();
  return plan.items.find(
    (it) => it.date === date && it.type === type && (it.status === 'planned' || it.status === 'pending_delivery'),
  );
}

/** Stuck items from previous days (failed or pending_delivery) — pick up on the next run. */
export function findStuck(type: PlanFormat, lookbackDays = 3): ContentPlanItem | undefined {
  const plan = readPlan();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return plan.items.find(
    (it) =>
      it.type === type &&
      it.date >= cutoffStr &&
      it.date < today() &&
      (it.status === 'failed' || it.status === 'pending_delivery'),
  );
}

export function markItem(
  id: string,
  patch: Partial<Pick<ContentPlanItem, 'status' | 'runId' | 'lastError' | 'lastTriedAt'>>,
): ContentPlanItem | undefined {
  const plan = readPlan();
  const item = plan.items.find((it) => it.id === id);
  if (!item) return undefined;
  Object.assign(item, patch);
  writePlan(plan);
  return item;
}

export function upsertItem(item: ContentPlanItem): void {
  const plan = readPlan();
  const idx = plan.items.findIndex((it) => it.id === item.id);
  if (idx === -1) plan.items.push(item);
  else plan.items[idx] = item;
  // sort by date asc then by type (carousel before reels) for predictable UI
  plan.items.sort((a, b) => (a.date === b.date ? a.type.localeCompare(b.type) : a.date.localeCompare(b.date)));
  writePlan(plan);
}

export function replacePlan(items: ContentPlanItem[], version?: string): ContentPlan {
  const plan: ContentPlan = {
    version: version ?? new Date().toISOString().slice(0, 10),
    items,
  };
  writePlan(plan);
  return plan;
}

/** Window for the cabinet UI: items in [today-3d, today+14d]. */
export function planWindow(): ContentPlanItem[] {
  const plan = readPlan();
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 3);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 14);
  const lo = past.toISOString().slice(0, 10);
  const hi = future.toISOString().slice(0, 10);
  return plan.items.filter((it) => it.date >= lo && it.date <= hi);
}
