# Projects Inventory

This file is the canonical inventory for the repository. It answers four
questions quickly:

1. What each project does
2. Whether it is active, supporting, or legacy
3. Where its code lives today
4. Where it should live in the target repository structure

## Status Labels

- `active`: current product or service under active development
- `supporting`: useful service or infra component, but not the main focus
- `maintenance`: still relevant, but not a primary build target
- `legacy`: historical or migration-era code; avoid changing without a reason

## Product Priorities

### Primary Active Surface

| Project | Current Path | Type | Status | Notes |
| --- | --- | --- | --- | --- |
| Persona Studio | `apps/persona-studio` | Next.js app | `active` | Current largest and freshest product surface |
| Transcribe | `apps/transcribe` | Next.js app | `active` | Workspace-enabled and actively runnable |
| TG Agent | `apps/tg-agent` | Node service | `active` | Telegram AI agent |
| IG Agent | `apps/ig-agent` | Node service | `active` | Instagram DM AI agent |

### Secondary Active Surface

| Project | Current Path | Type | Status | Notes |
| --- | --- | --- | --- | --- |
| Persona Train | `apps/persona-train` | Next.js app | `active` | Adjacent to Persona Studio |
| Command Center | `apps/command-center` | Next.js app | `active` | Dashboard over multiple products |
| AI Hub | `apps/ai-hub` | Next.js app | `maintenance` | Separate product with wallet/jobs stack |
| IG Content | `apps/ig-content` | Next.js app | `maintenance` | Content operating system with Supabase |
| AI Content Factory | `apps/ai-content-factory` | Node service | `maintenance` | Autonomous content pipeline |

### Supporting Services

| Project | Current Path | Type | Status | Notes |
| --- | --- | --- | --- | --- |
| ytdlp extractor | `services/python/ytdlp` | Python service | `supporting` | Companion extraction service |
| Voice Circle Bot | `services/python/voice-circle-bot` | Python bot | `supporting` | Narrow bot utility |
| Infra Worker | `services/node/infra-worker` | Node worker | `supporting` | Scheduling and office support |
| AI Office Backend | `infra/services/ai-office` | Node backend | `supporting` | Self-hosted backend for static office app |
| AI Sales Worker | `infra/services/aisales-worker` | Node worker | `supporting` | Worker tied to AI Sales ecosystem |

### Legacy And Migration Surfaces

| Project | Current Path | Type | Status | Notes |
| --- | --- | --- | --- | --- |
| AI Sales | `apps/ai-sales` | Python app + docs | `legacy` | Historical product plus prototypes and docs |
| aisales | `apps/aisales` | Python app + infra | `legacy` | Consolidated backend and compose layout |
| AI Sales v2 | `apps/ai-sales-v2` | Compose wrapper | `legacy` | Transitional deployment layout |
| AI Office Static | `apps/ai-office` | Static site | `maintenance` | Still useful, but separate from current app core |

## Current Grouping By Runtime

### Next.js Apps

- `apps/persona-studio`
- `apps/persona-train`
- `apps/transcribe`
- `apps/command-center`
- `apps/ai-hub`
- `apps/ig-content`

### Node Services

- `apps/tg-agent`
- `apps/ig-agent`
- `apps/ai-content-factory`
- `services/node/infra-worker`
- `infra/services/ai-office`
- `infra/services/aisales-worker`

### Python Services

- `services/python/ytdlp`
- `services/python/voice-circle-bot`
- `apps/ai-sales/code`
- `apps/aisales/v1`
- `apps/aisales/v2/code`

### Static Marketing Or Portal Surfaces

- `apps/ai-office`
- `landings/*`

## Target Structure Mapping

| Current Path | Target Group |
| --- | --- |
| `apps/persona-studio` | `apps/products/persona-studio` |
| `apps/transcribe` | `apps/products/transcribe` |
| `apps/persona-train` | `apps/products/persona-train` |
| `apps/command-center` | `apps/products/command-center` |
| `apps/ai-hub` | `apps/products/ai-hub` |
| `apps/ig-content` | `apps/products/ig-content` |
| `apps/tg-agent` | `apps/agents/tg-agent` |
| `apps/ig-agent` | `apps/agents/ig-agent` |
| `apps/ai-content-factory` | `apps/internal/ai-content-factory` |
| `apps/ai-office` | `archive/static-sites/ai-office` or `sites/ai-office` |
| `apps/ai-sales` | `archive/legacy/ai-sales` |
| `apps/aisales` | `archive/legacy/aisales` |
| `apps/ai-sales-v2` | `archive/legacy/ai-sales-v2` |

## Recommended Starting Points

- For current product work: `apps/persona-studio`
- For a smaller active app: `apps/transcribe`
- For compact service work: `apps/tg-agent` or `apps/ig-agent`
- For cross-product coordination: `apps/command-center`

## Repository Smells To Resolve

- Root `README.md` describes a broader product than the current root `src/`
- Root `package.json` workspaces cover only a subset of active projects
- Naming is inconsistent: `ai-sales`, `aisales`, `ai-sales-v2`
- There is a nested duplicate repository at `ai-command-center/`

These are documented intentionally so we can fix them in controlled phases.
