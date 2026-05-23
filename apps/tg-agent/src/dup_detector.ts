// Duplicate-question detector.
//
// Periodically scans recent classifier-tagged messages
// (QUESTION / PRODUCT_INTEREST / PRICE_REQUEST / SUPPORT_REQUEST),
// runs each through semantic memory to find similar past messages
// from OTHER users, builds clusters, and DMs the owner when a
// cluster crosses a "real signal" threshold (≥ N unique users).
//
// Idempotent against re-runs: each delivered alert is persisted in
// tg_dup_alerts; we hash a cluster by its sorted user-id list and
// skip alerts that match a hash sent in the last `cooldownDays`.
//
// Bot-pipeline classifications come from `tg_messages.class`. We
// look at the same classes the responder takes seriously.

import { createHash } from 'node:crypto';
import type { Bot } from 'grammy';

import type { ChatService } from './db/chats.js';
import type { Db } from './db/index.js';
import type { Logger } from './logger.js';
import type { MemoryService } from './memory/service.js';

const TRACKED_CLASSES = [
  'QUESTION',
  'PRODUCT_INTEREST',
  'PRICE_REQUEST',
  'SUPPORT_REQUEST',
] as const;

export interface DupHit {
  message_id: number;
  chat_id: number;
  chat_title: string | null;
  user_id: number | null;
  username: string | null;
  text: string;
  class: string;
  created_at: string;
  score: number;
}

export interface DupCluster {
  canonical: DupHit;
  hits: DupHit[];
  uniqueUsers: number;
}

export interface FindDuplicatesOptions {
  daysBack?: number;
  minSimilarity?: number;
  minUsers?: number;
  maxSeedMessages?: number;
}

export interface DupDetectorDeps {
  db: Db;
  memory: MemoryService;
  chats: ChatService;
  logger: Logger;
}

const DEFAULT_DAYS_BACK = 7;
const DEFAULT_MIN_SIM = 0.78;
const DEFAULT_MIN_USERS = 3;
const DEFAULT_MAX_SEED = 80;

interface SchemaShape {
  exec: (sql: string) => void;
}

function ensureAlertsTable(db: Db): void {
  (db as unknown as SchemaShape).exec(`
    CREATE TABLE IF NOT EXISTS tg_dup_alerts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_hash  TEXT NOT NULL,
      unique_users  INTEGER NOT NULL,
      canonical     TEXT NOT NULL,
      payload_json  TEXT NOT NULL,
      sent_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS tg_dup_alerts_hash_idx
      ON tg_dup_alerts (cluster_hash, sent_at DESC);
  `);
}

// ── Core detector ──────────────────────────────────────────────────────────

export async function findDuplicates(
  deps: DupDetectorDeps,
  opts: FindDuplicatesOptions = {},
): Promise<DupCluster[]> {
  ensureAlertsTable(deps.db);
  const daysBack = opts.daysBack ?? DEFAULT_DAYS_BACK;
  const minSim = opts.minSimilarity ?? DEFAULT_MIN_SIM;
  const minUsers = opts.minUsers ?? DEFAULT_MIN_USERS;
  const maxSeed = opts.maxSeedMessages ?? DEFAULT_MAX_SEED;
  const sinceIso = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  // Seed: recent classifier-tagged messages worth examining. We
  // dedup by (chat_id, user_id, text) to avoid wasting embeddings
  // on the same person repeating themselves verbatim.
  const placeholders = TRACKED_CLASSES.map(() => '?').join(',');
  const seedRows = deps.db
    .prepare(
      `
      SELECT m.id, m.chat_id, m.user_id, m.text, m.class, m.created_at,
             u.username,
             (SELECT title FROM tg_chats WHERE chat_id = m.chat_id) AS chat_title
      FROM tg_messages m
      LEFT JOIN tg_users u ON u.chat_id = m.chat_id AND u.user_id = m.user_id
      WHERE m.created_at >= ?
        AND m.class IN (${placeholders})
        AND m.user_id IS NOT NULL
        AND length(trim(m.text)) > 5
      ORDER BY m.created_at DESC
      LIMIT ?
    `,
    )
    .all(sinceIso, ...TRACKED_CLASSES, maxSeed) as Array<{
    id: number;
    chat_id: number;
    user_id: number;
    text: string;
    class: string;
    created_at: string;
    username: string | null;
    chat_title: string | null;
  }>;

  if (seedRows.length === 0) {
    deps.logger.info('dup-detector: no seed messages', { daysBack });
    return [];
  }

  // Build a {message_id → hit} map for everything we look at, so we
  // can union-find on top of it. The map also fast-fails when a
  // semantic neighbour was outside our seed window (we still record
  // it from the Qdrant payload).
  const idToHit = new Map<number, DupHit>();
  for (const r of seedRows) {
    const hit: DupHit = {
      message_id: r.id,
      chat_id: r.chat_id,
      chat_title: r.chat_title,
      user_id: r.user_id,
      username: r.username,
      text: r.text,
      class: r.class,
      created_at: r.created_at,
      score: 1,
    };
    idToHit.set(r.id, hit);
  }

  // Union-find on message ids — keys are point ids derived from
  // tg-agent's pointIdFor("tg-agent", String(message_id)). We'll
  // instead use the raw db id and resolve UUIDs at lookup time.
  const parent = new Map<number, number>();
  function find(x: number): number {
    while (parent.get(x) !== x) {
      const p = parent.get(x);
      if (p === undefined) {
        parent.set(x, x);
        return x;
      }
      parent.set(x, parent.get(p) ?? p);
      x = p;
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const r of seedRows) parent.set(r.id, r.id);

  // For each seed, look up its top semantic neighbours in memory.
  // The shared point-ids in memory let us match neighbours back to
  // tg_messages.id via the payload. Bound the per-seed neighbour
  // count to keep the API cost predictable.
  for (const r of seedRows) {
    let hits;
    try {
      hits = await deps.memory.search(r.text, {
        limit: 8,
        sinceIso,
        source: 'tg-agent',
      });
    } catch (err) {
      deps.logger.warn('dup-detector: memory.search failed', {
        seedId: r.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const h of hits) {
      if (h.score < minSim) continue;
      // Skip self-matches and same-user pairs — we want *different
      // people* asking the same thing, not the same person looping.
      const otherUser = h.payload.user_id ?? -1;
      if (otherUser === r.user_id) continue;
      if (otherUser <= 0) continue;
      // Use the message's natural integer ID as the union key;
      // payload doesn't carry it directly so we reach back via a
      // SQLite lookup on (chat_id, user_id, created_at, text).
      const fk = lookupMessageId(deps.db, h.payload);
      if (fk === null) continue;
      if (!parent.has(fk)) {
        // Lazily admit out-of-window neighbours into the map.
        idToHit.set(fk, {
          message_id: fk,
          chat_id: h.payload.chat_id ?? r.chat_id,
          chat_title: h.payload.chat_title,
          user_id: otherUser,
          username: h.payload.username,
          text: h.payload.text,
          class: h.payload.class ?? r.class,
          created_at: h.payload.created_at,
          score: h.score,
        });
        parent.set(fk, fk);
      } else {
        // Refresh the score on existing hit if the neighbour
        // surfaced via a fresher query.
        const existing = idToHit.get(fk);
        if (existing && existing.score < h.score) existing.score = h.score;
      }
      union(r.id, fk);
    }
  }

  // Gather components.
  const components = new Map<number, DupHit[]>();
  for (const [id, hit] of idToHit) {
    const root = find(id);
    let arr = components.get(root);
    if (!arr) {
      arr = [];
      components.set(root, arr);
    }
    arr.push(hit);
  }

  const clusters: DupCluster[] = [];
  for (const arr of components.values()) {
    if (arr.length < 2) continue;
    const userIds = new Set(arr.map((h) => h.user_id).filter((u): u is number => u != null));
    if (userIds.size < minUsers) continue;
    // Canonical = the earliest message in the cluster (likely the
    // original question that others later echoed).
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    clusters.push({
      canonical: arr[0]!,
      hits: arr,
      uniqueUsers: userIds.size,
    });
  }
  clusters.sort((a, b) => b.uniqueUsers - a.uniqueUsers || b.hits.length - a.hits.length);
  return clusters;
}

// Resolve a memory hit back to tg_messages.id. The Qdrant payload
// carries (chat_id, user_id, text, created_at), which together pin
// down a row uniquely in practice.
function lookupMessageId(
  db: Db,
  payload: {
    chat_id: number | null;
    user_id: number | null;
    text: string;
    created_at: string;
  },
): number | null {
  if (payload.chat_id == null || payload.user_id == null) return null;
  const row = db
    .prepare(
      `SELECT id FROM tg_messages
       WHERE chat_id = ? AND user_id = ? AND created_at = ? AND text = ?
       LIMIT 1`,
    )
    .get(payload.chat_id, payload.user_id, payload.created_at, payload.text) as
    | { id: number }
    | undefined;
  return row ? row.id : null;
}

// ── Persistence ────────────────────────────────────────────────────────────

export function clusterHash(cluster: DupCluster): string {
  // Hash by sorted (chat_id:user_id) pairs — stable across runs as
  // long as the same group of people keeps echoing the same topic.
  const key = cluster.hits
    .map((h) => `${h.chat_id}:${h.user_id}`)
    .sort()
    .join('|');
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

export function wasSentRecently(db: Db, hash: string, cooldownDays = 7): boolean {
  ensureAlertsTable(db);
  const cutoff = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  const row = db
    .prepare(`SELECT 1 FROM tg_dup_alerts WHERE cluster_hash = ? AND sent_at >= ? LIMIT 1`)
    .get(hash, cutoff);
  return row !== undefined;
}

export function recordAlert(db: Db, cluster: DupCluster): void {
  ensureAlertsTable(db);
  db
    .prepare(
      `INSERT INTO tg_dup_alerts (cluster_hash, unique_users, canonical, payload_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      clusterHash(cluster),
      cluster.uniqueUsers,
      cluster.canonical.text.slice(0, 500),
      JSON.stringify(cluster.hits.slice(0, 20)),
    );
}

// ── Renderer ───────────────────────────────────────────────────────────────

export function renderClusterMarkdown(cluster: DupCluster): string {
  const lines: string[] = [];
  const escape = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  lines.push(
    `🔁 <b>Дубликат вопроса</b> — ${cluster.uniqueUsers} разных людей за неделю`,
  );
  lines.push('');
  lines.push(`<b>Что спросили</b> (первым ${escape(cluster.canonical.username ? '@' + cluster.canonical.username : 'user' + cluster.canonical.user_id)}):`);
  lines.push(`<i>${escape(cluster.canonical.text.slice(0, 300))}</i>`);
  lines.push('');
  lines.push('<b>Кто ещё спрашивал похожее:</b>');
  const seenUsers = new Set<number>();
  for (const h of cluster.hits) {
    if (h.user_id === null || h.user_id === cluster.canonical.user_id) continue;
    if (seenUsers.has(h.user_id)) continue;
    seenUsers.add(h.user_id);
    const who = h.username ? '@' + h.username : `user${h.user_id}`;
    const where = h.chat_title ?? `chat ${h.chat_id}`;
    const when = h.created_at.slice(0, 10);
    lines.push(`• ${escape(who)} в ${escape(where)} (${when}): ${escape(h.text.slice(0, 120))}`);
    if (seenUsers.size >= 6) break;
  }
  lines.push('');
  lines.push('💡 <i>Добавь ответ на этот вопрос в knowledge_base.md или сделай FAQ-пост.</i>');
  return lines.join('\n');
}

// ── Scheduler ──────────────────────────────────────────────────────────────

export interface DupSchedulerDeps extends DupDetectorDeps {
  bot: Bot;
  ownerTelegramId: number;
  intervalHours?: number;
  options?: FindDuplicatesOptions;
}

export interface DupSchedulerHandle {
  stop(): void;
  runOnce(): Promise<{ clusters: DupCluster[]; alerted: number }>;
}

export function startDupScheduler(deps: DupSchedulerDeps): DupSchedulerHandle {
  const intervalHours = deps.intervalHours ?? 24;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<{ clusters: DupCluster[]; alerted: number }> => {
    if (running) return { clusters: [], alerted: 0 };
    running = true;
    try {
      const clusters = await findDuplicates(deps, deps.options);
      let alerted = 0;
      for (const cluster of clusters) {
        const hash = clusterHash(cluster);
        if (wasSentRecently(deps.db, hash, 7)) continue;
        try {
          const md = renderClusterMarkdown(cluster);
          await deps.bot.api.sendMessage(deps.ownerTelegramId, md, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          });
          recordAlert(deps.db, cluster);
          alerted++;
        } catch (err) {
          deps.logger.error('dup-detector: alert send failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      deps.logger.info('dup-detector: sweep done', {
        clustersFound: clusters.length,
        alerted,
      });
      return { clusters, alerted };
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick().catch((err) =>
      deps.logger.error('dup-detector: tick crashed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }, intervalHours * 3_600_000);
  deps.logger.info('dup-detector scheduler armed', { intervalHours });

  return {
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce: tick,
  };
}
