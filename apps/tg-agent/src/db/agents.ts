// Forum agents + source routing config. One tg_agents row per forum
// topic (= a specialised AI role); tg_source_routes maps a monitored
// chat to the agent whose thread its reports land in.

import type { Db } from './index.js';
import { nowIso } from './index.js';

export interface AgentRow {
  id: number;
  thread_id: number | null;
  slug: string;
  name: string;
  system_prompt: string;
  model: string;
  tools: string; // JSON array, kept as text
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SourceRouteRow {
  source_chat_id: number;
  source_label: string | null;
  agent_id: number;
  enabled: number;
  created_at: string;
}

// Shape used to seed the default roster. thread_id is bound later, once
// the forum topics are created/discovered (see /bindthread, /topics).
export interface AgentSeed {
  slug: string;
  name: string;
  system_prompt: string;
  model: string;
  thread_id?: number | null;
}

export interface AgentService {
  list(): AgentRow[];
  listActive(): AgentRow[];
  getById(id: number): AgentRow | null;
  getBySlug(slug: string): AgentRow | null;
  getByThread(threadId: number): AgentRow | null;
  // Insert any seed whose slug isn't present yet. Existing rows are
  // left untouched so the owner can edit prompts in place.
  seedDefaults(seeds: AgentSeed[]): { inserted: number };
  // Bind a topic to an agent. Clears the thread_id off any other agent
  // first, since thread_id is UNIQUE.
  bindThread(slug: string, threadId: number): AgentRow | null;
  setSystemPrompt(slug: string, prompt: string): void;

  // Source routes.
  routeForSource(sourceChatId: number): AgentRow | null;
  upsertRoute(sourceChatId: number, agentId: number, label: string | null): void;
  listRoutes(): Array<SourceRouteRow & { agent_slug: string; agent_name: string }>;
  deleteRoute(sourceChatId: number): void;
}

export function createAgentService(db: Db): AgentService {
  const listStmt = db.prepare(`SELECT * FROM tg_agents ORDER BY id ASC`);
  const listActiveStmt = db.prepare(
    `SELECT * FROM tg_agents WHERE is_active = 1 ORDER BY id ASC`,
  );
  const byIdStmt = db.prepare(`SELECT * FROM tg_agents WHERE id = ?`);
  const bySlugStmt = db.prepare(`SELECT * FROM tg_agents WHERE slug = ?`);
  const byThreadStmt = db.prepare(`SELECT * FROM tg_agents WHERE thread_id = ?`);

  const insertStmt = db.prepare(`
    INSERT INTO tg_agents (thread_id, slug, name, system_prompt, model)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO NOTHING
  `);

  const clearThreadStmt = db.prepare(
    `UPDATE tg_agents SET thread_id = NULL, updated_at = ? WHERE thread_id = ? AND slug != ?`,
  );
  const setThreadStmt = db.prepare(
    `UPDATE tg_agents SET thread_id = ?, updated_at = ? WHERE slug = ?`,
  );
  const setPromptStmt = db.prepare(
    `UPDATE tg_agents SET system_prompt = ?, updated_at = ? WHERE slug = ?`,
  );

  const routeForSourceStmt = db.prepare(`
    SELECT a.* FROM tg_agents a
    JOIN tg_source_routes r ON r.agent_id = a.id
    WHERE r.source_chat_id = ? AND r.enabled = 1
  `);
  const upsertRouteStmt = db.prepare(`
    INSERT INTO tg_source_routes (source_chat_id, source_label, agent_id)
    VALUES (?, ?, ?)
    ON CONFLICT(source_chat_id) DO UPDATE SET
      agent_id = excluded.agent_id,
      source_label = excluded.source_label,
      enabled = 1
  `);
  const listRoutesStmt = db.prepare(`
    SELECT r.*, a.slug AS agent_slug, a.name AS agent_name
    FROM tg_source_routes r
    JOIN tg_agents a ON a.id = r.agent_id
    ORDER BY r.created_at ASC
  `);
  const deleteRouteStmt = db.prepare(
    `DELETE FROM tg_source_routes WHERE source_chat_id = ?`,
  );

  return {
    list: () => listStmt.all() as AgentRow[],
    listActive: () => listActiveStmt.all() as AgentRow[],
    getById: (id) => (byIdStmt.get(id) as AgentRow | undefined) ?? null,
    getBySlug: (slug) => (bySlugStmt.get(slug) as AgentRow | undefined) ?? null,
    getByThread: (threadId) =>
      (byThreadStmt.get(threadId) as AgentRow | undefined) ?? null,

    seedDefaults(seeds): { inserted: number } {
      let inserted = 0;
      const tx = db.transaction((rows: AgentSeed[]) => {
        for (const s of rows) {
          const res = insertStmt.run(
            s.thread_id ?? null,
            s.slug,
            s.name,
            s.system_prompt,
            s.model,
          );
          inserted += res.changes;
        }
      });
      tx(seeds);
      return { inserted };
    },

    bindThread(slug, threadId): AgentRow | null {
      const now = nowIso();
      const tx = db.transaction(() => {
        // thread_id is UNIQUE — release it from any prior owner first.
        clearThreadStmt.run(now, threadId, slug);
        setThreadStmt.run(threadId, now, slug);
      });
      tx();
      return (bySlugStmt.get(slug) as AgentRow | undefined) ?? null;
    },

    setSystemPrompt(slug, prompt): void {
      setPromptStmt.run(prompt, nowIso(), slug);
    },

    routeForSource: (sourceChatId) =>
      (routeForSourceStmt.get(sourceChatId) as AgentRow | undefined) ?? null,

    upsertRoute(sourceChatId, agentId, label): void {
      upsertRouteStmt.run(sourceChatId, label, agentId);
    },

    listRoutes() {
      return listRoutesStmt.all() as Array<
        SourceRouteRow & { agent_slug: string; agent_name: string }
      >;
    },

    deleteRoute(sourceChatId): void {
      deleteRouteStmt.run(sourceChatId);
    },
  };
}
