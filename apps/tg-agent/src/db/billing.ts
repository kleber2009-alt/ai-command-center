import type { Db } from './index.js';
import { nowIso } from './index.js';

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type SubPlan = 'basic' | 'pro' | 'enterprise';

export interface SubRow {
  id: number;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_session_id: string | null;
  plan: SubPlan;
  status: SubStatus;
  customer_email: string;
  customer_name: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingStats {
  mrr: number;
  active: number;
  trialing: number;
  past_due: number;
  canceled: number;
}

export interface BillingService {
  listAll(): SubRow[];
  upsertBySubId(data: {
    stripe_subscription_id: string;
    stripe_customer_id: string;
    stripe_session_id?: string | null;
    plan?: SubPlan;
    status: SubStatus;
    customer_email?: string;
    customer_name?: string | null;
    trial_end?: string | null;
    current_period_end?: string | null;
    cancel_at?: string | null;
  }): void;
  stats(): BillingStats;
}

const PLAN_MRR: Record<SubPlan, number> = { basic: 49, pro: 149, enterprise: 499 };

export function createBillingService(db: Db): BillingService {
  const listStmt = db.prepare(
    `SELECT * FROM tg_subscriptions ORDER BY created_at DESC`,
  );

  const upsertStmt = db.prepare(`
    INSERT INTO tg_subscriptions (
      stripe_subscription_id, stripe_customer_id, stripe_session_id,
      plan, status, customer_email, customer_name,
      trial_end, current_period_end, cancel_at,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      stripe_customer_id   = COALESCE(excluded.stripe_customer_id, tg_subscriptions.stripe_customer_id),
      stripe_session_id    = COALESCE(excluded.stripe_session_id,  tg_subscriptions.stripe_session_id),
      plan                 = COALESCE(excluded.plan,                tg_subscriptions.plan),
      status               = excluded.status,
      customer_email       = COALESCE(excluded.customer_email,      tg_subscriptions.customer_email),
      customer_name        = COALESCE(excluded.customer_name,       tg_subscriptions.customer_name),
      trial_end            = excluded.trial_end,
      current_period_end   = excluded.current_period_end,
      cancel_at            = excluded.cancel_at,
      updated_at           = excluded.updated_at
  `);

  return {
    listAll(): SubRow[] {
      return listStmt.all() as SubRow[];
    },

    upsertBySubId(data): void {
      const now = nowIso();
      upsertStmt.run(
        data.stripe_subscription_id,
        data.stripe_customer_id,
        data.stripe_session_id ?? null,
        data.plan ?? 'basic',
        data.status,
        data.customer_email ?? '',
        data.customer_name ?? null,
        data.trial_end ?? null,
        data.current_period_end ?? null,
        data.cancel_at ?? null,
        now,
        now,
      );
    },

    stats(): BillingStats {
      const rows = listStmt.all() as SubRow[];
      const s: BillingStats = { mrr: 0, active: 0, trialing: 0, past_due: 0, canceled: 0 };
      for (const r of rows) {
        if (r.status === 'active')    { s.active++;   s.mrr += PLAN_MRR[r.plan] ?? 0; }
        if (r.status === 'trialing')  { s.trialing++; }
        if (r.status === 'past_due')  { s.past_due++; }
        if (r.status === 'canceled')  { s.canceled++; }
      }
      return s;
    },
  };
}
