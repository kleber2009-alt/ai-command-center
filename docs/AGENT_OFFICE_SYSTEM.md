# Agent Office System

Concrete operating model for your personal AI team with two interfaces:

1. `Telegram HQ` — fast command, alerts, approvals, daily brief
2. `Web Office` — persistent control room, memory, analytics, backlog

The point is not two different systems. It is one agent organization with
two surfaces over the same orchestration, events, memory, and action layer.

## Core Principle

Do not build 20 disconnected bots.

Build one operating system with:

- one event pipeline
- one memory layer
- one orchestration layer
- one shared task model
- two interfaces: Telegram and Web

## What The Team Is Optimizing For

- protect your attention
- surface only important signals
- turn noise into decisions
- coordinate products, content, sales, and ops
- keep a permanent memory of what happened and why

## Team Design

### 1. Chief of Staff

Mission:
- keep the whole portfolio in focus
- decide what deserves your attention now
- consolidate input from all other agents

Always-on responsibilities:
- morning brief
- evening wrap-up
- escalation routing
- blocked-decision queue
- weekly review assembly

Inputs:
- summaries from all other agents
- incidents from Ops
- hot leads from Sales
- product risks from Product

Outputs:
- `Today Brief`
- `Decision Inbox`
- `Weekly CEO Review`

### 2. Product Agent

Mission:
- protect product quality and product momentum

Always-on responsibilities:
- track bugs, broken flows, failed generations
- track feature requests and product friction
- keep a ranked backlog by product

Products in scope:
- `apps/persona-studio`
- `apps/transcribe`
- `apps/persona-train`
- `apps/ai-hub`
- `apps/ig-content`
- `apps/command-center`

Outputs:
- top 3 product risks today
- backlog proposals
- product health by app

### 3. Growth Agent

Mission:
- drive acquisition, messaging, distribution, and offer packaging

Always-on responsibilities:
- content ideas
- offer experiments
- funnel bottleneck hypotheses
- landing page optimization queue

Surfaces in scope:
- `landings/*`
- `apps/ai-office`
- `apps/ai-content-factory`
- `apps/ig-content`
- product launch and promo pages

Outputs:
- daily growth ideas
- weekly campaign plan
- offer and landing optimization proposals

### 4. Research Agent

Mission:
- turn the outside world into usable signals

Always-on responsibilities:
- trend scanning
- competitor monitoring
- reel and hook collection
- niche radar summaries

Systems in scope:
- `services/node/infra-worker` viral discover flows
- `apps/persona-studio` research and parser layers
- any Apify, trend, or reel indexing pipeline

Outputs:
- top 5 trend signals
- reusable hook patterns
- "worth testing this week" list

### 5. Sales Agent

Mission:
- protect pipeline, lead quality, follow-up, and conversions

Always-on responsibilities:
- hot lead detection
- stalled conversation detection
- objection clustering
- follow-up recommendations

Systems in scope:
- `apps/tg-agent`
- `apps/ig-agent`
- `apps/ai-sales`
- CRM-ish tables and message histories

Outputs:
- hot lead alerts
- end-of-day funnel summary
- lost-deal reason clusters

### 6. Support Agent

Mission:
- turn user pain into product insight and retention action

Always-on responsibilities:
- classify complaints
- cluster repeated questions
- detect churn or confusion signals
- convert pain into FAQ and product work

Inputs:
- support messages
- manual replies
- complaints from TG/IG/admin channels

Outputs:
- daily voice-of-customer summary
- repeated problem clusters
- urgent trust issues

### 7. Ops Agent

Mission:
- protect reliability across products, workers, webhooks, and deploys

Always-on responsibilities:
- health checks
- failed jobs
- queue lag
- webhook failures
- env/config drift
- deploy watch

Systems in scope:
- `infra/`
- `services/node/infra-worker`
- `services/python/ytdlp`
- worker queues in `persona-studio`
- web service health for active apps

Outputs:
- real-time incident alerts
- daily system health digest
- recovery or rollback suggestions

### 8. Finance Agent

Mission:
- keep cost, margin, and capacity visible

Always-on responsibilities:
- token usage monitoring
- infra cost visibility
- cost per workflow
- paid plan / revenue pulse

Outputs:
- weekly cost summary
- burn anomalies
- margin warnings

## Telegram HQ

Telegram is the fast operating surface.

It is for:
- quick decisions
- alerts
- morning/evening briefs
- approvals
- priority shifts

It is not for:
- deep dashboards
- historical analysis
- long-term memory browsing

### Telegram Structure

#### 1. CEO DM

Private chat with the office bot.

Use it for:
- personal daily brief
- critical alerts
- approvals
- focus changes
- voice and quick commands

#### 2. HQ Room

Shared coordination room for the agent team.

Use it for:
- cross-agent summaries
- escalations that touch multiple domains
- weekly review drafts

#### 3. Sales Room

Use it for:
- hot leads
- stuck convos
- objections
- manual takeover suggestions

#### 4. Content Room

Use it for:
- trends
- ideas
- planned content
- reusable hooks

#### 5. Ops Room

Use it for:
- incidents
- failed jobs
- deploy alerts
- cron and webhook problems

### Telegram Commands

Core commands:

- `/brief` — today's concise CEO brief
- `/portfolio` — status across all products
- `/sales` — leads, follow-ups, risks
- `/content` — ideas, trends, publishing queue
- `/ops` — incidents and system health
- `/focus <project>` — temporarily raise priority for one product
- `/decide` — unresolved decisions
- `/approve <id>` — approve queued action
- `/defer <id>` — postpone decision
- `/ship` — what is ready to deploy or publish

### Telegram Message Format

Each important agent message should follow one compact structure:

1. `Signal`
2. `Why it matters`
3. `Suggested action`
4. `Needs your decision?`

Example:

```text
Signal: persona-studio avatar generation failure rate jumped to 22%
Why it matters: users are paying tokens but a large share of jobs are failing
Suggested action: pause paid traffic, inspect worker queue and Gemini failures
Needs your decision: yes, if you want traffic paused now
```

### Telegram Cadence

Daily:
- 08:30 `Today Brief`
- 19:00 `Done / Blocked / Next`

Event-driven:
- hot lead
- prod incident
- failed payment pattern
- major trend worth shipping now
- broken product flow

Weekly:
- Monday planning
- Friday review

## Web Office

Web Office is the deep operating surface.

It is for:
- portfolio visibility
- memory
- analytics
- backlog
- workflows
- cross-product decisions

### Recommended Screens

#### 1. CEO Dashboard

Purpose:
- instant view of the whole business

Blocks:
- top priorities
- top risks
- hot leads
- product health
- incidents
- revenue and cost pulse
- decisions waiting for approval

#### 2. Projects

One card per active product:
- `persona-studio`
- `transcribe`
- `persona-train`
- `ai-hub`
- `ig-content`
- `command-center`

Each project card shows:
- status
- owner agent
- open risks
- backlog count
- recent changes
- suggested next move

#### 3. Sales And CRM

Purpose:
- monitor pipeline and conversation health

Blocks:
- hot leads
- stalled leads
- objection clusters
- TG and IG channel split
- manual takeover queue
- conversation drill-down

#### 4. Content And Research

Purpose:
- connect trends to output

Blocks:
- trend radar
- saved reels and hooks
- content ideas
- ready-to-produce queue
- published outcomes

#### 5. Operations

Purpose:
- reliability and production control

Blocks:
- service health
- failed jobs
- queue lag
- deploy history
- webhook health
- infra changes

#### 6. Decisions

Purpose:
- one place for decisions that need you

Blocks:
- pending approvals
- recommendations by agent
- rejected actions
- decision history with rationale

#### 7. Memory

Purpose:
- long-lived office brain

Blocks:
- weekly summaries
- incident postmortems
- product insights
- reusable offers
- customer pain archive
- research learnings

## One Architecture, Two Interfaces

```text
Data Sources
  -> Event Ingestion
  -> Agent Orchestrator
  -> Memory + Task Layer
  -> Telegram HQ
  -> Web Office
```

### Layer 1: Data Sources

Current repo-aligned sources:

- `apps/persona-studio`
- `apps/transcribe`
- `apps/persona-train`
- `apps/tg-agent`
- `apps/ig-agent`
- `apps/command-center`
- `apps/ai-content-factory`
- `services/node/infra-worker`
- `services/python/ytdlp`
- `landings/*` performance and change events

### Layer 2: Event Ingestion

Canonical event types:

- `lead.created`
- `lead.hot`
- `lead.stalled`
- `conversation.negative`
- `product.error_spike`
- `job.failed`
- `job.queue_lag`
- `deploy.started`
- `deploy.failed`
- `trend.batch_ready`
- `content.ready`
- `content.published`
- `payment.received`
- `payment.failed`
- `feature.requested`
- `support.cluster_detected`

### Layer 3: Agent Orchestrator

Responsibilities:
- subscribe each agent to relevant event classes
- prevent duplicate work
- rank severity
- create tasks
- request summary generation
- route output to Telegram or Web

### Layer 4: Memory And Task Layer

Split memory into three modes:

#### Operational Memory

Use for:
- tasks
- alerts
- incidents
- pending approvals
- project statuses

Good home:
- Postgres tables in a central office DB

#### Long-Term Insight Memory

Use for:
- research findings
- repeated objections
- successful offers
- product lessons
- postmortems

Good home:
- embeddings-backed document store or pgvector

#### Action Journal

Use for:
- who proposed what
- what was approved
- what changed after the action

This is critical for making the office smarter over time.

### Layer 5: Interfaces

#### Telegram HQ

Best for:
- speed
- escalation
- decisioning
- approvals

#### Web Office

Best for:
- overview
- memory
- planning
- analytics

## How Current Repo Pieces Map To The Office

### Existing Systems To Reuse

#### `apps/command-center`

Best candidate for:
- `Web Office` shell
- CEO dashboard
- project registry
- decision inbox
- team and portfolio pages

#### `services/node/infra-worker`

Best candidate for:
- scheduler
- periodic brief generation
- recurring reviews
- event-triggered orchestration jobs

#### `apps/tg-agent`

Best candidate for:
- Telegram delivery patterns
- classification signals
- lead urgency and owner notifications

#### `apps/ig-agent`

Best candidate for:
- sales/support event ingestion from Instagram
- conversation-level recommendation streams

#### `apps/persona-studio`

Best candidate for:
- research signals
- generation queue status
- paid workflow events
- content pipeline telemetry

#### `apps/transcribe`

Best candidate for:
- content generation workflow events
- transcript-to-content insights
- user usage patterns

#### `apps/ai-content-factory`

Best candidate for:
- Growth Agent execution
- content planning and generation telemetry

### New Central Capability Still Missing

You do not yet have one clean office-core that unifies:
- events
- tasks
- approvals
- memory
- cross-agent outputs

That should become the next central layer.

Recommended shape:

- `apps/command-center` becomes the main `Web Office`
- a new office-core module or service handles:
  - event normalization
  - task creation
  - decision queue
  - shared memory
  - Telegram dispatch

## Reporting Model

### Daily

#### Morning Brief

Owned by:
- Chief of Staff

Contains:
- today's top 3 priorities
- top 2 risks
- top 1 sales opportunity
- blockers needing approval

#### Evening Wrap

Owned by:
- Chief of Staff with inputs from Product, Sales, Ops

Contains:
- what moved
- what got blocked
- what rolls into tomorrow

### Weekly

#### Monday Planning

Contains:
- product focus
- shipping goals
- content plan
- lead follow-up priorities
- risk watchlist

#### Friday Review

Contains:
- wins
- failures
- incidents
- money
- learnings
- decision log

### Real-Time Alerts

Real-time alerts should be limited to:
- production incidents
- hot leads
- payment anomalies
- sudden failure spikes
- unusually strong trend signals

## Decision Flow

```text
Event
  -> Agent detects risk/opportunity
  -> Orchestrator creates recommendation
  -> Chief of Staff ranks priority
  -> Goes to Telegram approval or Web decision queue
  -> You approve / defer / reject
  -> Action is logged in journal
```

## Minimal MVP Build Order

### Phase 1: Telegram HQ MVP

Ship first:
- Chief of Staff
- Sales Agent
- Ops Agent
- Product Agent

Telegram deliverables:
- `/brief`
- `/portfolio`
- `/sales`
- `/ops`
- `/decide`

### Phase 2: Web Office MVP

Ship next:
- CEO dashboard
- Projects page
- Sales page
- Operations page
- Decisions page

### Phase 3: Memory And Research

Ship:
- trend memory
- objection memory
- incident log
- weekly summary archive

### Phase 4: Growth And Finance

Ship:
- growth experiments board
- content pipeline analytics
- cost and token monitoring

## Recommended Build Ownership

If we implement this in the current repo, the cleanest ownership split is:

- `apps/command-center` — Web Office UI and operator views
- `services/node/infra-worker` — scheduled orchestration and recurring reports
- `apps/tg-agent` or a new office-bot transport layer — Telegram HQ interaction
- central office DB tables — events, tasks, decisions, memory, journals

## What To Build Next In Code

The highest-leverage next artifacts are:

1. central office data model
2. Telegram HQ command and alert contract
3. Web Office screen map inside `apps/command-center`
4. event normalization layer between products and office-core

This document is the operating blueprint for those steps.
