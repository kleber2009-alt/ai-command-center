# Repository Structure Plan

This document defines the target repository layout without forcing immediate
folder moves. It is the migration guide for turning the current monorepo into
a cleaner and lower-risk structure.

## Goals

- Make the main products obvious
- Separate product code from support services and old experiments
- Reduce confusion between active and legacy projects
- Create a structure that can be migrated incrementally

## Target Layout

```text
apps/
  products/
    persona-studio/
    transcribe/
    persona-train/
    command-center/
    ai-hub/
    ig-content/
  agents/
    tg-agent/
    ig-agent/
  internal/
    ai-content-factory/

services/
  node/
    infra-worker/
    ai-office-backend/
    aisales-worker/
  python/
    ytdlp/
    voice-circle-bot/

sites/
  landings/
  marketing/

infra/
packages/
docs/
archive/
  legacy/
    ai-sales/
    aisales/
    ai-sales-v2/
  static-sites/
    ai-office/
```

## Why This Shape

### `apps/products`

These are user-facing applications with their own runtime and product surface.
They are the default places to work day to day.

### `apps/agents`

These are productized bots or channel agents. They are important, but their
shape, dependencies, and operational model differ from the main web apps.

### `apps/internal`

These are real systems, but they function more like internal pipelines or
content engines than general-purpose end-user apps.

### `services`

These are support runtimes: bots, extractors, workers, and sidecars. Keeping
them out of `apps/` makes the repository easier to scan.

### `sites`

Static landing pages and marketing surfaces should not compete visually with
core product applications.

### `archive`

Legacy and migration-era code should stay available, but should stop implying
that it is part of the current active path.

## Migration Rules

### Naming

- Keep kebab-case for directories
- Prefer one canonical name per product
- Treat `ai-sales`, `aisales`, and `ai-sales-v2` as one legacy family

### Moves

- Move by group, not one random folder at a time
- Update internal docs and compose files in the same change as each move
- Keep legacy apps untouched until active paths are clean

### Safety

- Do not move anything with live deployment coupling until compose paths are
  audited
- Do not merge nested duplicate repository content automatically
- Do not change active workspaces and scripts until the new structure is ready

## Recommended Migration Phases

### Phase 1: Documentation And Classification

- Add a canonical inventory
- Define target groups
- Mark active vs legacy

### Phase 2: Non-Breaking Repo Hygiene

- Add links from root docs to the inventory
- Decide what stays in root workspaces
- Decide whether `sites/` will be introduced before or after `archive/`

### Phase 3: Low-Risk Physical Moves

- Move static or supporting projects first
- Move obviously isolated services next
- Leave active app paths stable until tooling is ready

### Phase 4: Active App Consolidation

- Move active Next.js apps into `apps/products/`
- Move active bots into `apps/agents/`
- Update workspaces, scripts, Docker, and docs in one pass

### Phase 5: Legacy Quarantine

- Move `ai-sales`, `aisales`, and `ai-sales-v2` into `archive/legacy/`
- Keep migration notes near those projects

## Current Recommended Physical Moves

Completed in the first move wave:

1. `services/python/ytdlp`
2. `services/python/voice-circle-bot`
3. `services/node/infra-worker`

Recommended next isolated candidate:

4. `apps/ai-office` -> `archive/static-sites/ai-office` or `sites/marketing/ai-office`

These should still come before any move of `persona-studio`, `transcribe`,
`tg-agent`, or `ig-agent`.

## Nested Duplicate Repository

There is a nested `ai-command-center/` directory inside the repository root
that appears to be a duplicate checkout or backup.

Until audited, treat it as read-only historical baggage:

- do not use it as a source of truth
- do not update docs to point into it
- do not delete it casually

The first cleanup step should be confirming whether it is:

- an accidental nested clone
- a manual backup
- a dependency for any script or deployment path

## Source Of Truth

- Inventory: [PROJECTS.md](/Users/iliapaliy/ai-command-center/PROJECTS.md)
- Active operational context: [docs/STATUS_AND_ROADMAP.md](/Users/iliapaliy/ai-command-center/docs/STATUS_AND_ROADMAP.md)
