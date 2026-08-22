# Office Core Data Model

Canonical data model for the personal AI office.

This model is designed to power both:

- `Telegram HQ`
- `Web Office` in `apps/command-center`

## Design Goals

- unify events from all products and services
- let agents triage, summarize, and escalate without duplicating work
- persist tasks, decisions, memory, and action history
- make every alert traceable back to its source

## Source Systems

Primary inputs from the current repository:

- `apps/persona-studio`
- `apps/transcribe`
- `apps/persona-train`
- `apps/tg-agent`
- `apps/ig-agent`
- `apps/command-center`
- `apps/ai-content-factory`
- `services/node/infra-worker`
- `services/python/ytdlp`
- `landings/*` and marketing surfaces

## Core Entity Model

### 1. `office_agents`

Represents the stable roster of agent roles.

Use it for:
- assigning tasks
- routing events
- recording recommendations
- tracking who owns what domain

Minimum fields:
- `slug`
- `name`
- `kind`
- `status`
- `mission`
- `cadence`
- `primary_channels`
- `source_systems`
- `default_scope`

### 2. `office_event_sources`

Registry of systems that emit signals into the office.

Use it for:
- source inventory
- routing rules
- health and ownership
- future webhook or polling configuration

Minimum fields:
- `slug`
- `system_kind`
- `display_name`
- `repo_path`
- `owner_agent_slug`
- `emits`
- `enabled`

### 3. `office_events`

The raw normalized event stream.

One row = one meaningful business or technical signal.

Examples:
- `lead.hot`
- `job.failed`
- `product.error_spike`
- `trend.batch_ready`
- `payment.failed`

Minimum fields:
- `source_id`
- `event_type`
- `severity`
- `title`
- `summary`
- `payload`
- `project_slug`
- `dedupe_key`
- `occurred_at`
- `ingested_at`

### 4. `office_event_deliveries`

Tracks which agents received or acted on each event.

Use it for:
- preventing duplicate reactions
- auditability
- measuring agent coverage

Minimum fields:
- `event_id`
- `agent_slug`
- `channel`
- `status`
- `delivered_at`
- `acknowledged_at`

### 5. `office_tasks`

The working queue of the AI office.

Tasks are created from:
- events
- manual commands
- recurring schedules
- agent recommendations

Minimum fields:
- `kind`
- `status`
- `priority`
- `title`
- `summary`
- `project_slug`
- `owner_agent_slug`
- `source_event_id`
- `due_at`

### 6. `office_task_links`

Optional link table from a task to anything relevant.

Examples:
- product route
- conversation id
- deployment
- research batch
- memory entry

Minimum fields:
- `task_id`
- `link_kind`
- `link_ref`
- `label`

### 7. `office_decisions`

Decisions waiting for your approval or already resolved.

A decision is not just a task. It is a fork that needs human judgment.

Examples:
- pause traffic
- reply manually to a hot lead
- prioritize one product over another
- ship a landing change

Minimum fields:
- `title`
- `summary`
- `status`
- `requested_by_agent_slug`
- `project_slug`
- `source_task_id`
- `recommended_option_key`
- `resolved_option_key`
- `requested_at`
- `resolved_at`

## Current Implementation Status

Already prepared in the repo:

- server read layer in `apps/command-center/src/lib/office-server.ts`
- Web Office API routes in `apps/command-center/src/app/api/office/*`
- canonical SQL draft in `docs/sql/office-core-postgres.sql`
- runnable DB migrations in `apps/aisales/db-init/018_office_core.sql`
- starter seed data in `apps/aisales/db-init/019_office_core_seed.sql`

### 8. `office_decision_options`

Decision options attached to a single decision.

Examples:
- `pause_now`
- `watch_24h`
- `rollback`
- `ship_to_beta_only`

Minimum fields:
- `decision_id`
- `option_key`
- `label`
- `tradeoffs`
- `is_recommended`

### 9. `office_memory_entries`

Long-lived memory for the office.

Use it for:
- weekly reviews
- incident postmortems
- research insights
- customer voice clusters
- product learnings
- reusable playbooks

Minimum fields:
- `kind`
- `title`
- `summary`
- `body_markdown`
- `project_slug`
- `tags`
- `importance`
- `created_by_agent_slug`

### 10. `office_memory_links`

Attaches memory entries to related objects.

Examples:
- event
- task
- decision
- project
- external URL

### 11. `office_journal_entries`

Immutable narrative log of what happened.

This is the accountability layer.

Examples:
- event created
- task triaged
- decision approved
- recommendation rejected
- weekly brief sent

Minimum fields:
- `entity_kind`
- `entity_id`
- `action_kind`
- `actor_type`
- `actor_id`
- `narrative`
- `metadata`
- `created_at`

### 12. `office_daily_briefs`

Stores generated daily brief artifacts.

Use it for:
- Telegram morning briefs
- Web Office history
- end-of-day summaries

Minimum fields:
- `brief_date`
- `channel`
- `summary`
- `priorities_json`
- `risks_json`
- `decisions_json`

## Suggested Enums

### `office_agent_kind`

- `chief_of_staff`
- `product`
- `growth`
- `research`
- `sales`
- `support`
- `ops`
- `finance`

### `office_event_severity`

- `critical`
- `high`
- `medium`
- `low`

### `office_task_status`

- `new`
- `triaged`
- `in_progress`
- `blocked`
- `waiting_approval`
- `done`
- `canceled`

### `office_task_priority`

- `p0`
- `p1`
- `p2`
- `p3`

### `office_decision_status`

- `pending`
- `approved`
- `rejected`
- `deferred`
- `expired`

### `office_memory_kind`

- `weekly_review`
- `incident`
- `research`
- `customer_voice`
- `playbook`
- `decision`
- `product_learning`

## Recommended Relationships

```text
office_event_sources 1--* office_events
office_events 1--* office_event_deliveries
office_events 1--* office_tasks
office_tasks 1--* office_task_links
office_tasks 1--* office_decisions
office_decisions 1--* office_decision_options
office_memory_entries 1--* office_memory_links
all major entities 1--* office_journal_entries
```

## Minimal MVP Schema

If you want to ship in phases, the first useful subset is:

1. `office_agents`
2. `office_event_sources`
3. `office_events`
4. `office_tasks`
5. `office_decisions`
6. `office_memory_entries`
7. `office_journal_entries`

That is enough to power:
- Telegram HQ briefs
- Web Office overview
- decision inbox
- incident and learning memory

## Recommended DB Home

For the current repo, the most natural home is the same Postgres family that
already powers `apps/command-center`.

That keeps:
- office dashboards
- project views
- decisions
- tasks
- memory

in one operational system.

## Next Build Artifact

The reference SQL draft lives in:

- [`docs/sql/office-core-postgres.sql`](./sql/office-core-postgres.sql)
