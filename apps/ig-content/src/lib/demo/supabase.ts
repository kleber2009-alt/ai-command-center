// Minimal in-memory stand-in for the Supabase JS client, supporting only the
// query shapes this app uses. Active only when IGC_DEMO=1.
import { store, DEMO_USER } from './store'

type Row = Record<string, any>
const uuid = () => 'gen-' + Math.random().toString(36).slice(2, 10)
const nowIso = () => new Date().toISOString()

function applyFilters(rows: Row[], filters: [string, any][]) {
  return rows.filter((r) => filters.every(([col, val]) => r[col] === val))
}

// Resolves an embedded `content_days(...)` projection for metrics joins.
function attachJoins(rows: Row[], cols: string): Row[] {
  if (!cols.includes('content_days(')) return rows
  return rows.map((r) => {
    const cd = store.content_days.find((d) => d.id === r.content_day_id) ?? null
    return {
      ...r,
      content_days: cd
        ? { id: cd.id, topic: cd.topic, main_hook: cd.main_hook, campaign_id: cd.campaign_id }
        : null,
    }
  })
}

class Query {
  private table: string
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private cols = '*'
  private filters: [string, any][] = []
  private orderCol: string | null = null
  private orderAsc = true
  private wantCount = false
  private headOnly = false
  private payload: Row | Row[] | null = null
  private limitN: number | null = null

  constructor(table: string) {
    this.table = table
  }

  private get rows(): Row[] {
    return (store as any)[this.table] ?? []
  }

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.cols = cols
    if (opts?.count) this.wantCount = true
    if (opts?.head) this.headOnly = true
    return this
  }
  eq(col: string, val: any) {
    this.filters.push([col, val])
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending !== false
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  insert(data: Row | Row[]) {
    this.op = 'insert'
    this.payload = data
    return this
  }
  upsert(data: Row | Row[]) {
    this.op = 'insert'
    this.payload = data
    return this
  }
  update(data: Row) {
    this.op = 'update'
    this.payload = data
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  single() {
    return this.run('single')
  }
  maybeSingle() {
    return this.run('maybe')
  }
  then(onF: (v: any) => any, onR?: (e: any) => any) {
    return this.run('many').then(onF, onR)
  }

  private async run(mode: 'single' | 'maybe' | 'many') {
    try {
      const result = this.execute()
      return this.shape(result, mode)
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'demo error' }, count: null }
    }
  }

  private execute(): Row[] {
    const arr = this.rows
    if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!]
      const inserted = items.map((it) => ({
        id: it.id ?? uuid(),
        created_at: nowIso(),
        updated_at: nowIso(),
        ...it,
      }))
      arr.push(...inserted)
      return inserted
    }
    if (this.op === 'update') {
      const matched = applyFilters(arr, this.filters)
      matched.forEach((r) => Object.assign(r, this.payload, { updated_at: nowIso() }))
      return matched
    }
    if (this.op === 'delete') {
      const keep = arr.filter((r) => !this.filters.every(([c, v]) => r[c] === v))
      const removed = arr.length - keep.length
      ;(store as any)[this.table] = keep
      return new Array(removed).fill({})
    }
    // select
    let out = applyFilters(arr, this.filters)
    if (this.orderCol) {
      const col = this.orderCol
      out = [...out].sort((a, b) => {
        const av = a[col], bv = b[col]
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (this.orderAsc ? 1 : -1)
      })
    }
    if (this.limitN != null) out = out.slice(0, this.limitN)
    return attachJoins(out, this.cols)
  }

  private shape(rows: Row[], mode: 'single' | 'maybe' | 'many') {
    if (this.wantCount && this.headOnly) {
      return { data: null, error: null, count: rows.length }
    }
    if (mode === 'single') {
      if (rows.length === 0) {
        return { data: null, error: { message: 'No rows found' }, count: 0 }
      }
      return { data: rows[0], error: null, count: rows.length }
    }
    if (mode === 'maybe') {
      return { data: rows[0] ?? null, error: null, count: rows.length }
    }
    return { data: rows, error: null, count: rows.length }
  }
}

export function createDemoClient() {
  return {
    from(table: string) {
      return new Query(table)
    },
    // Vector search is disabled in demo; callers fall back to score-ranked select.
    async rpc(_name: string, _params?: Record<string, unknown>) {
      return { data: [], error: null }
    },
    auth: {
      async getUser() {
        return { data: { user: DEMO_USER }, error: null }
      },
      async getSession() {
        return { data: { session: { user: DEMO_USER } }, error: null }
      },
      async signInWithPassword() {
        return { data: { user: DEMO_USER, session: {} }, error: null }
      },
      async signUp() {
        return { data: { user: DEMO_USER, session: {} }, error: null }
      },
      async signOut() {
        return { error: null }
      },
      async exchangeCodeForSession() {
        return { data: { user: DEMO_USER }, error: null }
      },
    },
  } as any
}
