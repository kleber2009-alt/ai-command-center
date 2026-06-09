# Forum agents — roster & roles

In **forum mode** the bot lives in one Telegram forum supergroup
("Мои агенты"). Each **topic (thread) is a separate AI agent** with its
own role, model, and memory. One bot, one group, many specialised
agents — routing is entirely by Telegram's `message_thread_id`.

The roster is seeded on first startup into `tg_agents`
(`src/forum.ts` → `defaultAgentSeeds`). System prompts are drafts the
owner can edit in place (the seeder never overwrites an existing slug).

| slug        | name (topic) | thread_id    | role |
|-------------|--------------|--------------|------|
| `content`   | Контент      | bound at setup | Контент-маркетолог: Reels-сценарии, заголовки, контент-план, разбор контент-метрик из отчётов |
| `product`   | Продуктолог  | bound at setup | Продакт: архитектура продукта, юнит-экономика, приоритизация фич, гипотезы |
| `finance`   | Финансист    | bound at setup | Финдир: P&L, прогнозы, бюджеты, разбор финансовых отчётов |
| `assistant` | Ассистент    | bound at setup | Личный ассистент: задачи, напоминания, саммари по сотрудникам и встречам |
| `general`   | General      | 1            | Диспетчер: общие вопросы и подсказка, в какую ветку писать |

`thread_id` is bound to a topic at setup — automatically when a topic's
title matches the agent name (`forum_topic_created`), or manually with
`/bindthread <slug|имя>` inside the topic / `/createtopics`.

## What each agent sees

An agent answers **only within its lane** and treats the data of its
direction as primary context. On every question in a topic, the agent's
context is three layers (`src/forum_agent.ts`):

1. **Role** — `tg_agents.system_prompt`.
2. **Direction data** — the last N `tg_reports` routed to this agent
   (default 10).
3. **Thread memory** — the last M `tg_thread_messages` of this thread
   (default 20). Both the owner's questions and the agent's replies are
   persisted, so follow-ups have context.

(Depth N/M tunable; embeddings over `tg_thread_messages` are a future
add when a thread outgrows a flat window — pgvector/Qdrant is already in
the stack.)

## Per-agent model & tools

Each row has its own `model` (seeded from `FORUM_AGENT_MODEL`, default
Sonnet) and a `tools` JSON column (empty on start). Wiring per-agent
tools (e.g. финance data for Финансист, a research module for Контент)
is the next milestone; today agents run on role + context only.

## Managing the roster

- `/topics` — list agents and their bound threads.
- `/bindthread <slug|имя>` — bind the current topic to an agent.
- `/createtopics` — create + bind topics for any unbound agents.
- `/route <source_chat_id> <slug>` / `/unroute` / `/routes` — map which
  monitored chat's reports land in which agent's thread.

Editing prompts/models directly in `tg_agents` (SQLite) is supported;
the bot reads them per request.
