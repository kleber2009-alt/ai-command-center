# tg-agent — architecture (forum mode)

Single Node.js process, one bot (`@newnewnnn_bot`), embedded SQLite.
Two independent flows run through the **one bot** in a forum supergroup;
routing is by Telegram `message_thread_id` (no second bot needed).

```
                        ┌─────────────────────────────┐
  monitored chats ────▶ │  Collector (digest.ts)      │
  (existing pipeline)   │  Claude summary per chat    │
                        └──────────────┬──────────────┘
                                       │ summary + source_chat_id
                                       ▼
                            ┌────────────────────┐
                            │  ForumRouter        │ ← tg_source_routes
                            │  (forum.ts)         │   (chat → agent)
                            └─────────┬──────────┘
                                      │ no route? → Claude direction
                                      │ classifier → General
                                      ▼
                 sendMessage(chat_id=GROUP, message_thread_id=…)
                                      │
      ┌───────────────┬──────────────┼───────────────┬───────────────┐
      ▼               ▼              ▼               ▼               ▼
  [Контент]     [Продуктолог]   [Финансист]     [Ассистент]      [General]


  owner writes in a topic ─▶ update.message_thread_id ─▶ ForumAgent
        (forum_agent.ts: role + thread reports + thread history)
                          └─▶ reply in the SAME topic, persist both turns
```

## Flow 1 — reports → threads (`route_report`)

1. `buildAndDeliverDigest` (digest.ts) produces the per-chat summary as
   today, saves the `tg_digests` row.
2. If `FORUM_ROUTE_REPORTS`, it calls `ForumRouter.routeReport` with
   `dedup_key = digest:<row.id>` (idempotent — retries don't double-post).
3. Router resolves the target agent: `tg_source_routes[source_chat_id]`
   → else Claude direction-classifier (`pick_direction`, Haiku) → else
   General. Posts to `agent.thread_id` (falls back to General if the
   topic isn't bound yet, so reports are never lost).
4. Saves `tg_reports` + a `role='report'` row in `tg_thread_messages`
   (the agent's memory).
5. During cutover, `FORUM_KEEP_OWNER_DM` also DMs the owner the same
   summary, so the old single feed and the new threads run in parallel.

## Flow 2 — dialog in a topic (`handleForumMessage`)

1. `bot.ts` `message:text` branches any message in `FORUM_GROUP_ID` to
   `handleForumMessage` **before** the lead-classification pipeline — so
   the control group never produces leads or auto-replies.
2. Agent looked up by `message_thread_id` (General → 1). Owner-only
   unless `FORUM_RESPOND_TO_TEAM`.
3. `ForumAgent.ask` builds context: role + last N `tg_reports` for the
   agent + last M `tg_thread_messages` of the thread, calls the agent's
   `model`, replies in the same thread.
4. Owner question + agent reply are appended to `tg_thread_messages`.

## Data model (SQLite, `db/schema.ts`)

| table | purpose |
|-------|---------|
| `tg_agents` | one row per topic/role: `thread_id`, `slug`, `name`, `system_prompt`, `model`, `tools`, `is_active` |
| `tg_source_routes` | `source_chat_id` → `agent_id`, `enabled` |
| `tg_reports` | routed reports: `summary`, `raw`, period, `tg_message_id`, `dedup_key` (UNIQUE) |
| `tg_thread_messages` | per-thread history (`user`/`assistant`/`report`/`system`) = agent memory |

The ТЗ specified a Postgres/Supabase + pgvector schema; we mapped it
1:1 onto tg-agent's existing embedded SQLite to reuse the running
Collector, memory, and admin without a rewrite. `embedding`/pgvector is
deferred — flat recency windows are enough until a thread grows large,
and Qdrant is already wired for semantic recall when needed.

## Migration / cutover

`FORUM_ENABLED=false` by default → installing the release changes
nothing. Enable per `.env.example`: set `FORUM_GROUP_ID`, flip
`FORUM_ENABLED=true`, bind topics, add `tg_source_routes`. Run with
`FORUM_KEEP_OWNER_DM=true` for 1–2 days to verify against the old DM
feed, then set it to `false` to complete the move.

## Telegram setup

Bot must be a **group admin with Manage Topics**, BotFather privacy mode
**Disabled** (so it sees all topic messages). The group must be a forum.
