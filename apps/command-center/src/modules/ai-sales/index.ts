import type { ModuleEntry } from '../_types'

const aiSales: ModuleEntry = {
  slug: 'ai-sales',
  name: 'AI Sales System',
  tagline:
    'Multi-agent sales-система для IG + TG: 4 агента (Inbound, Qualifier, Closer, Follow-up) на FastAPI + LangGraph.',
  status: 'production',
  baseUrl: 'https://sales.aicex.club',
  docsPath: 'apps/ai-sales/CLAUDE.md',
  capabilities: [
    '4 LangGraph-агента в одном пайплайне',
    'Caddy mount для медиа и dashboard',
    'Postgres + Redis + Qdrant (RAG) + MinIO',
    'Dashboard: crm.aicex.club',
  ],
  backend: [
    { label: 'API v2', path: 'apps/ai-sales-v2' },
    { label: 'Agents', path: 'apps/ai-sales/src/agents' },
    { label: 'Compose', path: 'apps/ai-sales/docker-compose.yml' },
  ],
  ui: [
    { label: 'Landing', path: 'sales.aicex.club' },
    { label: 'Operator dashboard', path: 'crm.aicex.club' },
  ],
  notes:
    'Полноценная мульти-агентная система. Embed-вариант = «подключи свой IG/TG к нашему оркестратору» через REST + Bearer + webhook callbacks.',
}

export default aiSales
