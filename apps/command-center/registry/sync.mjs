// Заливает реестр projects.mjs в дашборд через его API.
//   node apps/command-center/registry/sync.mjs            — показать, что изменится
//   node apps/command-center/registry/sync.mjs --apply    — записать
// Env CC_URL (по умолчанию https://projects.aicex.club). Запись снаружи закрыта Basic auth Caddy — передайте
// CC_AUTH=логин:пароль, либо запускайте через воркфлоу sync-projects-registry.yml (ходит в API по SSH-туннелю).
// Поля проекта берутся из реестра; ссылки, добавленные руками в дашборде и отсутствующие в реестре,
// сохраняются в конце списка. Проекты, которых нет в реестре, и roadmap не трогаются.
import { projects } from './projects.mjs'

const BASE = (process.env.CC_URL || 'https://projects.aicex.club').replace(/\/$/, '')
const APPLY = process.argv.includes('--apply')
const AUTH = process.env.CC_AUTH ? { authorization: 'Basic ' + Buffer.from(process.env.CC_AUTH).toString('base64') } : {}
const FIELDS = ['name', 'emoji', 'tagline', 'status', 'description', 'technologies', 'sort_order']

async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...AUTH },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${data.error ?? ''}`)
  return data
}

const { projects: current } = await call('GET', '/api/projects')
const bySlug = new Map(current.map(p => [p.slug, p]))
let created = 0, updated = 0, same = 0

for (const p of projects) {
  const cur = bySlug.get(p.slug)
  if (!cur) {
    console.log(`+ ${p.slug}: новый проект, ${p.links.length} ссылок`)
    if (APPLY) await call('POST', '/api/projects', p)
    created++
    continue
  }
  const known = new Set(p.links.map(l => l.url))
  const links = [...p.links, ...(cur.links ?? []).filter(l => !known.has(l.url))]
  const patch = {}
  for (const k of FIELDS) if (JSON.stringify(cur[k]) !== JSON.stringify(p[k])) patch[k] = p[k]
  if (JSON.stringify(cur.links) !== JSON.stringify(links)) patch.links = links
  const keys = Object.keys(patch)
  if (!keys.length) { same++; continue }
  console.log(`~ ${p.slug}: ${keys.join(', ')}${patch.links ? ` (ссылок ${cur.links.length} → ${links.length})` : ''}`)
  if (APPLY) await call('PATCH', `/api/projects/${p.slug}`, patch)
  updated++
}

const extra = current.filter(p => !projects.some(r => r.slug === p.slug)).map(p => p.slug)
console.log(`\nновых ${created}, обновлено ${updated}, без изменений ${same}` +
  (extra.length ? `; в дашборде есть, в реестре нет: ${extra.join(', ')}` : '') +
  (APPLY ? '' : '\nэто пробный прогон — добавьте --apply, чтобы записать'))
