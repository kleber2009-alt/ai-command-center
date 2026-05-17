import type { Db } from './index.js';

export interface OverviewStats {
  total_chats: number;
  total_users: number;
  hot_leads: number;
  buyers: number;
  total_messages: number;
  messages_24h: number;
  messages_7d: number;
  drafts_pending: number;
  drafts_sent: number;
  drafts_deleted: number;
  drafts_editing: number;
}

export interface TimeBucket {
  date: string;     // YYYY-MM-DD
  count: number;
}

export interface ClassBucket {
  class: string;
  count: number;
}

export interface ActionBucket {
  action: string;
  count: number;
}

export interface StatusBucket {
  status: string;
  count: number;
}

export interface StatsService {
  overview(): OverviewStats;
  messagesByDay(days: number): TimeBucket[];
  classDistribution(days: number): ClassBucket[];
  actionDistribution(days: number): ActionBucket[];
  leadFunnel(): StatusBucket[];
}

export function createStatsService(db: Db): StatsService {
  // SQLite stores timestamps as ISO 8601 TEXT. For "last N days"
  // filtering we compare ISO strings directly — they sort
  // lexicographically when the format is fixed. For day-level
  // bucketing we use substr(created_at, 1, 10) to get YYYY-MM-DD.

  const overviewStmt = {
    chats: db.prepare(`SELECT COUNT(*) AS n FROM tg_chats`),
    users: db.prepare(`SELECT COUNT(*) AS n FROM tg_users`),
    hot: db.prepare(`SELECT COUNT(*) AS n FROM tg_users WHERE status = 'hot'`),
    buyer: db.prepare(`SELECT COUNT(*) AS n FROM tg_users WHERE status = 'buyer'`),
    messagesAll: db.prepare(`SELECT COUNT(*) AS n FROM tg_messages`),
    messagesSince: db.prepare(`SELECT COUNT(*) AS n FROM tg_messages WHERE created_at >= ?`),
    drafts: db.prepare(
      `SELECT status, COUNT(*) AS n FROM tg_drafts GROUP BY status`,
    ),
  };

  const messagesByDayStmt = db.prepare(`
    SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
    FROM tg_messages
    WHERE created_at >= ?
    GROUP BY date
    ORDER BY date ASC
  `);

  const classStmt = db.prepare(`
    SELECT class, COUNT(*) AS count
    FROM tg_messages
    WHERE created_at >= ? AND class IS NOT NULL
    GROUP BY class
    ORDER BY count DESC
  `);

  const actionStmt = db.prepare(`
    SELECT action, COUNT(*) AS count
    FROM tg_messages
    WHERE created_at >= ? AND action IS NOT NULL
    GROUP BY action
    ORDER BY count DESC
  `);

  const leadStmt = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tg_users
    GROUP BY status
  `);

  return {
    overview(): OverviewStats {
      const day = isoDaysAgo(1);
      const week = isoDaysAgo(7);

      const drafts = overviewStmt.drafts.all() as Array<{ status: string; n: number }>;
      const draftCounts: Record<string, number> = {
        pending: 0,
        editing: 0,
        sent: 0,
        deleted: 0,
      };
      for (const row of drafts) {
        draftCounts[row.status] = row.n;
      }

      return {
        total_chats: numFromCount(overviewStmt.chats.get()),
        total_users: numFromCount(overviewStmt.users.get()),
        hot_leads: numFromCount(overviewStmt.hot.get()),
        buyers: numFromCount(overviewStmt.buyer.get()),
        total_messages: numFromCount(overviewStmt.messagesAll.get()),
        messages_24h: numFromCount(overviewStmt.messagesSince.get(day)),
        messages_7d: numFromCount(overviewStmt.messagesSince.get(week)),
        drafts_pending: draftCounts.pending ?? 0,
        drafts_editing: draftCounts.editing ?? 0,
        drafts_sent: draftCounts.sent ?? 0,
        drafts_deleted: draftCounts.deleted ?? 0,
      };
    },

    messagesByDay(days): TimeBucket[] {
      const since = isoDaysAgo(days);
      const rows = messagesByDayStmt.all(since) as TimeBucket[];
      // Fill missing days with zeros so the bar chart has consistent
      // x-axis spacing.
      return fillMissingDays(rows, days);
    },

    classDistribution(days): ClassBucket[] {
      const since = isoDaysAgo(days);
      return classStmt.all(since) as ClassBucket[];
    },

    actionDistribution(days): ActionBucket[] {
      const since = isoDaysAgo(days);
      return actionStmt.all(since) as ActionBucket[];
    },

    leadFunnel(): StatusBucket[] {
      const rows = leadStmt.all() as StatusBucket[];
      // Commercial order followed by orthogonal labels — UI relies on
      // this order to render the funnel left-to-right.
      const order = ['new', 'cold', 'warm', 'hot', 'buyer', 'support', 'negative'];
      const byStatus = new Map(rows.map((r) => [r.status, r.count]));
      return order.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
    },
  };
}

function numFromCount(row: unknown): number {
  if (typeof row !== 'object' || row === null) return 0;
  const n = (row as { n?: unknown }).n;
  return typeof n === 'number' ? n : 0;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function fillMissingDays(rows: TimeBucket[], days: number): TimeBucket[] {
  const byDate = new Map(rows.map((r) => [r.date, r.count]));
  const out: TimeBucket[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }
  return out;
}
