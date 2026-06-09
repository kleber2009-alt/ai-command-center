// Runtime forum data: reports routed into threads, and the per-thread
// conversation history that doubles as each agent's memory.

import type { Db } from './index.js';

export interface ReportRow {
  id: number;
  agent_id: number | null;
  source_chat_id: number | null;
  summary: string;
  raw: string | null;
  period_start: string | null;
  period_end: string | null;
  tg_message_id: number | null;
  dedup_key: string | null;
  created_at: string;
}

export interface SaveReportInput {
  agentId: number | null;
  sourceChatId: number | null;
  summary: string;
  raw?: unknown;
  periodStart?: string | null;
  periodEnd?: string | null;
  tgMessageId?: number | null;
  // Idempotency key — typically `${sourceChatId}:${periodEnd}`. When a
  // report with the same key already exists, save is a no-op.
  dedupKey?: string | null;
}

export type ThreadRole = 'user' | 'assistant' | 'report' | 'system';

export interface ThreadMessageRow {
  id: number;
  agent_id: number | null;
  thread_id: number;
  role: ThreadRole;
  content: string;
  tg_message_id: number | null;
  created_at: string;
}

export interface ForumStore {
  // Returns the inserted row, or null when the dedup_key already
  // existed (retry / duplicate period).
  saveReport(input: SaveReportInput): ReportRow | null;
  reportExists(dedupKey: string): boolean;
  recentReportsForAgent(agentId: number, limit: number): ReportRow[];

  appendThreadMessage(input: {
    agentId: number | null;
    threadId: number;
    role: ThreadRole;
    content: string;
    tgMessageId?: number | null;
  }): void;
  recentThreadMessages(threadId: number, limit: number): ThreadMessageRow[];
}

export function createForumStore(db: Db): ForumStore {
  const insertReportStmt = db.prepare(`
    INSERT INTO tg_reports
      (agent_id, source_chat_id, summary, raw, period_start, period_end, tg_message_id, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedup_key) DO NOTHING
    RETURNING *
  `);
  const reportExistsStmt = db.prepare(
    `SELECT 1 FROM tg_reports WHERE dedup_key = ? LIMIT 1`,
  );
  const recentReportsStmt = db.prepare(`
    SELECT * FROM tg_reports
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const insertThreadMsgStmt = db.prepare(`
    INSERT INTO tg_thread_messages (agent_id, thread_id, role, content, tg_message_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const recentThreadMsgStmt = db.prepare(`
    SELECT * FROM tg_thread_messages
    WHERE thread_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    saveReport(input): ReportRow | null {
      const row = insertReportStmt.get(
        input.agentId,
        input.sourceChatId,
        input.summary,
        input.raw !== undefined ? JSON.stringify(input.raw) : null,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.tgMessageId ?? null,
        input.dedupKey ?? null,
      ) as ReportRow | undefined;
      return row ?? null;
    },

    reportExists(dedupKey): boolean {
      return reportExistsStmt.get(dedupKey) !== undefined;
    },

    recentReportsForAgent(agentId, limit): ReportRow[] {
      return recentReportsStmt.all(agentId, limit) as ReportRow[];
    },

    appendThreadMessage(input): void {
      insertThreadMsgStmt.run(
        input.agentId,
        input.threadId,
        input.role,
        input.content,
        input.tgMessageId ?? null,
      );
    },

    recentThreadMessages(threadId, limit): ThreadMessageRow[] {
      // Newest-first from SQL; callers reverse to chronological order.
      return recentThreadMsgStmt.all(threadId, limit) as ThreadMessageRow[];
    },
  };
}
