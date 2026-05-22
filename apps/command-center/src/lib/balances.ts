// ─────────────────────────────────────────────────────────────────────────────
// Balance fetchers per provider.
// Each fetcher returns ProviderResult shape so the UI can render uniformly.
// In-memory cache 60s — providers like Apify rate-limit /users/me hard.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderStatus = 'ok' | 'low' | 'empty' | 'error' | 'no-api'
export type ProviderCategory = 'llm' | 'video' | 'voice' | 'data' | 'media' | 'payment'

export type ProviderResult = {
  slug: string
  name: string
  category: ProviderCategory
  status: ProviderStatus
  // canonical numeric balance + unit (e.g. credits / characters / $ / minutes)
  balance: { value: number | null; unit: string; display: string } | null
  used?: { value: number | null; unit: string; display: string }
  total?: { value: number | null; unit: string; display: string }
  // free-form extra info — plan name, expiry, etc.
  detail?: string
  dashboardUrl?: string
  error?: string
  fetchedAt: string
  // used by sort + grouping in UI
  pillBg?: string
  pillText?: string
}

const ABORT_MS = 7000

function abortable(ms = ABORT_MS): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) }
}

function nowIso() { return new Date().toISOString() }

function classifyAmount(balance: number, lowThresh: number): ProviderStatus {
  if (balance <= 0) return 'empty'
  if (balance <= lowThresh) return 'low'
  return 'ok'
}

// ─── HeyGen ───────────────────────────────────────────────────────────────────
// docs: GET /v2/user/remaining_quota → { data: { remaining_quota: <seconds> } }
async function fetchHeyGen(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'heygen', name: 'HeyGen', category: 'video',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://app.heygen.com/settings/subscription',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.heygen.com/v2/user/remaining_quota', {
      headers: { 'X-API-KEY': key, accept: 'application/json' },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    const seconds = j?.data?.remaining_quota ?? j?.remaining_quota
    if (typeof seconds !== 'number') throw new Error('no remaining_quota in response')
    const minutes = seconds / 60
    return {
      ...base,
      status: classifyAmount(minutes, 5),
      balance: { value: minutes, unit: 'min', display: `${minutes.toFixed(1)} мин` },
      detail: 'видео-аватары · Reels Cloner, Persona Studio',
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────
// GET /v1/user/subscription → { tier, character_count, character_limit, next_character_count_reset_unix, ... }
async function fetchElevenLabs(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'elevenlabs', name: 'ElevenLabs', category: 'voice',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://elevenlabs.io/app/subscription',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key, accept: 'application/json' },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    const used = Number(j?.character_count ?? 0)
    const limit = Number(j?.character_limit ?? 0)
    const remaining = Math.max(0, limit - used)
    const resetTs = j?.next_character_count_reset_unix
    const resetStr = resetTs ? new Date(resetTs * 1000).toLocaleDateString('ru-RU') : null
    return {
      ...base,
      status: classifyAmount(remaining, 2000),
      balance: { value: remaining, unit: 'chars', display: `${remaining.toLocaleString('ru-RU')} симв` },
      used:   { value: used,      unit: 'chars', display: `${used.toLocaleString('ru-RU')}` },
      total:  { value: limit,     unit: 'chars', display: `${limit.toLocaleString('ru-RU')}` },
      detail: `план: ${j?.tier ?? 'free'}${resetStr ? ' · сброс ' + resetStr : ''}`,
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// ─── Apify ────────────────────────────────────────────────────────────────────
// GET /v2/users/me → { data: { plan: { availableMonthlyUsageUsd, ... }, usageCycle: { usageUsd } } }
async function fetchApify(token: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'apify', name: 'Apify', category: 'data',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://console.apify.com/billing',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.apify.com/v2/users/me', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    const data = j?.data ?? {}
    // Apify менял имена полей: пробуем все известные варианты
    const monthly = Number(
      data?.plan?.maxMonthlyUsageUsd ??
      data?.plan?.availableMonthlyUsageUsd ??
      data?.plan?.monthlyUsageHardLimitUsd ??
      0
    )
    const used = Number(
      data?.usageCycle?.usageUsd ??
      data?.usage?.monthlyServiceUsage?.totalUsageCredits ??
      data?.usage?.usageUsd ??
      0
    )
    const remaining = Math.max(0, monthly - used)
    return {
      ...base,
      status: classifyAmount(remaining, 1),
      balance: { value: remaining, unit: 'USD', display: `$${remaining.toFixed(2)}` },
      used:   { value: used,      unit: 'USD', display: `$${used.toFixed(2)}` },
      total:  { value: monthly,   unit: 'USD', display: `$${monthly.toFixed(2)}` },
      detail: `план: ${data?.plan?.id ?? 'free'} · парсинг IG/TikTok для viral_clone`,
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// ─── Replicate ────────────────────────────────────────────────────────────────
// GET /v1/account — auth check only, no balance in public API. Show as no-api.
async function fetchReplicate(token: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'replicate', name: 'Replicate', category: 'media',
    status: 'no-api', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://replicate.com/account/billing',
    detail: 'баланс не отдаётся через API · смотри dashboard',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.replicate.com/v1/account', {
      headers: { authorization: `Token ${token}`, accept: 'application/json' },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    return {
      ...base,
      detail: `ключ валиден · ${j?.username ?? 'auth ok'} · баланс — в dashboard`,
    }
  } catch (e: any) {
    cancel()
    return { ...base, status: 'error', error: e.message ?? String(e) }
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────
// Best-effort: пробуем legacy `dashboard/billing/credit_grants` (работает только
// для классических sk-... ключей с правами session/admin — для sk-proj-...
// возвращает 401 и мы fallback на no-api).
async function fetchOpenAI(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'openai', name: 'OpenAI', category: 'llm',
    status: 'no-api', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://platform.openai.com/usage',
    detail: 'баланс не отдаётся через API · смотри dashboard',
  }
  const { signal, cancel } = abortable()
  try {
    // Сначала валидируем ключ
    const modelsRes = await fetch('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${key}` }, signal,
    })
    if (!modelsRes.ok) throw new Error(`HTTP ${modelsRes.status}`)

    // Best-effort: legacy billing endpoint
    try {
      const bRes = await fetch('https://api.openai.com/dashboard/billing/credit_grants', {
        headers: { authorization: `Bearer ${key}` }, signal,
      })
      if (bRes.ok) {
        const bJson: any = await bRes.json()
        const total = Number(bJson?.total_granted ?? 0)
        const used = Number(bJson?.total_used ?? 0)
        const available = Number(bJson?.total_available ?? Math.max(0, total - used))
        cancel()
        return {
          ...base,
          status: classifyAmount(available, 5),
          balance: { value: available, unit: 'USD', display: `$${available.toFixed(2)}` },
          used: { value: used, unit: 'USD', display: `$${used.toFixed(2)}` },
          total: { value: total, unit: 'USD', display: `$${total.toFixed(2)}` },
          detail: 'Whisper для transcribe + viral_clone',
        }
      }
    } catch {}
    cancel()
    return { ...base, detail: 'sk-proj ключ · баланс только в dashboard · Whisper для transcribe' }
  } catch (e: any) {
    cancel()
    return { ...base, status: 'error', error: e.message ?? String(e) }
  }
}

// ─── Anthropic Claude ─────────────────────────────────────────────────────────
// Нет публичного балансового endpoint. Best-effort: проверяем ключ через /v1/models.
async function fetchAnthropic(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'anthropic', name: 'Anthropic Claude', category: 'llm',
    status: 'no-api', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://console.anthropic.com/settings/billing',
    detail: 'баланс не отдаётся через API · смотри console',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { ...base, detail: 'ключ валиден · Claude для rewrite + tg-agent + worker' }
  } catch (e: any) {
    cancel()
    return { ...base, status: 'error', error: e.message ?? String(e) }
  }
}

// ─── Stripe ───────────────────────────────────────────────────────────────────
// GET /v1/balance → { available: [{amount, currency}], pending: [...] }
async function fetchStripe(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'stripe', name: 'Stripe', category: 'payment',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://dashboard.stripe.com/balance',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.stripe.com/v1/balance', {
      headers: { authorization: `Bearer ${key}` },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    const usd = (j?.available ?? []).reduce(
      (s: number, b: any) => s + (b.currency === 'usd' ? b.amount / 100 : 0), 0
    )
    const eur = (j?.available ?? []).reduce(
      (s: number, b: any) => s + (b.currency === 'eur' ? b.amount / 100 : 0), 0
    )
    const pending = (j?.pending ?? []).reduce((s: number, b: any) => s + b.amount / 100, 0)
    const total = usd + eur
    return {
      ...base,
      status: total > 0 ? 'ok' : 'empty',
      balance: { value: total, unit: 'USD', display: `$${usd.toFixed(2)}${eur > 0 ? ` · €${eur.toFixed(2)}` : ''}` },
      detail: pending > 0 ? `на удержании: $${pending.toFixed(2)}` : 'Stripe Checkout · AI Hub',
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// ─── kie.ai ───────────────────────────────────────────────────────────────────
// GET https://api.kie.ai/api/v1/chat/credit → { code: 200, data: { credits: <int> } } (по докам)
async function fetchKie(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'kie', name: 'kie.ai', category: 'media',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://kie.ai/billing',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal,
    })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j: any = await r.json()
    const credits = Number(j?.data?.credits ?? j?.credits ?? 0)
    return {
      ...base,
      status: classifyAmount(credits, 100),
      balance: { value: credits, unit: 'credits', display: `${credits.toLocaleString('ru-RU')} credits` },
      detail: 'AI Hub · image/video/upscale',
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// ─── fal.ai ───────────────────────────────────────────────────────────────────
// fal не отдаёт баланс через REST API публично. Показываем как no-api.
async function fetchFal(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'fal', name: 'fal.ai', category: 'media',
    status: 'no-api', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://fal.ai/dashboard/billing',
    detail: 'баланс не отдаётся через API · смотри dashboard',
  }
  const { signal, cancel } = abortable()
  try {
    const r = await fetch('https://fal.run/health', { signal })
    cancel()
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { ...base, detail: 'ключ настроен · AI Hub · смотри dashboard' }
  } catch (e: any) {
    cancel()
    return { ...base, detail: 'AI Hub · смотри dashboard' }
  }
}

// ─── Submagic ─────────────────────────────────────────────────────────────────
// Submagic API не имеет публичного endpoint для баланса/кредитов.
// Best-effort: пробуем `/v1/me`, `/v1/account`, `/v1/projects?limit=1` —
// первый рабочий покажет что хотя бы ключ валиден + сколько проектов сделали.
async function fetchSubmagic(key: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: 'submagic', name: 'Submagic', category: 'video',
    status: 'no-api', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://app.submagic.co/account/billing',
    detail: 'баланс не отдаётся через API · Hormozi 2 для Reels Cloner',
  }
  const candidates = [
    'https://api.submagic.co/v1/me',
    'https://api.submagic.co/v1/account',
    'https://api.submagic.co/v1/projects?limit=1',
  ]
  const { signal, cancel } = abortable(6000)
  try {
    for (const url of candidates) {
      try {
        const r = await fetch(url, {
          headers: { 'x-api-key': key, accept: 'application/json' },
          signal,
        })
        if (!r.ok) continue
        const j: any = await r.json()
        const credits = Number(j?.credits ?? j?.remaining_credits ?? j?.balance ?? NaN)
        if (Number.isFinite(credits)) {
          cancel()
          return {
            ...base,
            status: classifyAmount(credits, 5),
            balance: { value: credits, unit: 'credits', display: `${credits} credits` },
            detail: 'Hormozi 2 для Reels Cloner',
          }
        }
        // нет credits в ответе — но ключ валиден
        cancel()
        return { ...base, detail: 'ключ валиден · баланс только в dashboard · Hormozi 2 для Reels Cloner' }
      } catch { /* try next */ }
    }
    cancel()
    return base
  } catch (e: any) {
    cancel()
    return base
  }
}

// ─── Telegram Stars (через getStarTransactions) ───────────────────────────────
// Bot API даёт getStarTransactions с пагинацией по 100 транзакций.
// Баланс = Σ(source.amount) − Σ(receiver.amount), где
//   source   = входящая (юзер заплатил боту)
//   receiver = исходящая (refund / withdrawal)
// Поддерживает несколько ботов через env-паттерн TELEGRAM_BOT_TOKEN[_<NAME>].
async function fetchTelegramStars(label: string, token: string): Promise<ProviderResult> {
  const base: ProviderResult = {
    slug: `telegram-${label.toLowerCase()}`,
    name: `Telegram · ${label}`,
    category: 'payment',
    status: 'error', balance: null, fetchedAt: nowIso(),
    dashboardUrl: 'https://t.me/BotFather',
  }
  // Stars-пагинация может занять время — даём 12s
  const { signal, cancel } = abortable(12000)
  try {
    // 1) getMe — узнаём @username
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal })
    if (!meRes.ok) throw new Error(`getMe HTTP ${meRes.status}`)
    const meJson: any = await meRes.json()
    if (!meJson?.ok) throw new Error(`getMe: ${meJson?.description ?? 'no ok'}`)
    const botUsername: string = meJson.result.username
    base.slug = `telegram-${botUsername.toLowerCase()}`
    base.name = `Telegram · @${botUsername}`

    // 2) пагинация getStarTransactions
    let balance = 0
    let totalIn = 0
    let totalOut = 0
    let txCount = 0
    let offset = 0
    const LIMIT = 100
    const MAX_PAGES = 20      // защита от бесконечного цикла

    for (let i = 0; i < MAX_PAGES; i++) {
      const url = `https://api.telegram.org/bot${token}/getStarTransactions?offset=${offset}&limit=${LIMIT}`
      const txRes = await fetch(url, { signal })
      if (!txRes.ok && txRes.status !== 400) throw new Error(`getStarTransactions HTTP ${txRes.status}`)
      const txJson: any = await txRes.json()
      if (!txJson?.ok) {
        // боты без Stars-payments вернут 400 / PAYMENTS_DISABLED
        const desc = (txJson?.description ?? '').toLowerCase()
        if (desc.includes('payment') || desc.includes('disabled')) {
          cancel()
          return {
            ...base,
            status: 'no-api',
            balance: null,
            detail: `бот @${botUsername} · Stars-платежи не включены`,
          }
        }
        throw new Error(`getStarTransactions: ${txJson?.description ?? 'unknown'}`)
      }
      const txs: any[] = txJson.result?.transactions ?? []
      if (txs.length === 0) break
      for (const tx of txs) {
        const amt = Number(tx?.amount ?? 0)
        if (tx?.source) {
          balance += amt
          totalIn += amt
        } else if (tx?.receiver) {
          balance -= amt
          totalOut += amt
        }
      }
      txCount += txs.length
      if (txs.length < LIMIT) break
      offset += LIMIT
    }
    cancel()

    return {
      ...base,
      status: balance > 0 ? (balance < 100 ? 'low' : 'ok') : 'empty',
      balance: {
        value: balance,
        unit: 'XTR',
        display: `${balance.toLocaleString('ru-RU')} ⭐`,
      },
      detail: `@${botUsername} · получено ${totalIn.toLocaleString('ru-RU')} ⭐ · списано ${totalOut.toLocaleString('ru-RU')} ⭐ · tx: ${txCount}`,
    }
  } catch (e: any) {
    cancel()
    return { ...base, error: e.message ?? String(e) }
  }
}

// Discover any number of bot tokens: TELEGRAM_BOT_TOKEN[_<name>]
function discoverTelegramTokens(env: NodeJS.ProcessEnv): { label: string; token: string }[] {
  const out: { label: string; token: string }[] = []
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue
    if (k === 'TELEGRAM_BOT_TOKEN') {
      out.push({ label: 'default', token: v })
    } else if (k.startsWith('TELEGRAM_BOT_TOKEN_')) {
      const name = k.replace('TELEGRAM_BOT_TOKEN_', '').toLowerCase()
      if (name) out.push({ label: name, token: v })
    }
  }
  return out
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function fetchAllBalances(): Promise<ProviderResult[]> {
  const env = process.env
  const jobs: Promise<ProviderResult>[] = []

  if (env.ANTHROPIC_API_KEY)  jobs.push(fetchAnthropic(env.ANTHROPIC_API_KEY))
  if (env.OPENAI_API_KEY)     jobs.push(fetchOpenAI(env.OPENAI_API_KEY))
  if (env.HEYGEN_API_KEY)     jobs.push(fetchHeyGen(env.HEYGEN_API_KEY))
  if (env.SUBMAGIC_API_KEY)   jobs.push(fetchSubmagic(env.SUBMAGIC_API_KEY))
  if (env.ELEVENLABS_API_KEY) jobs.push(fetchElevenLabs(env.ELEVENLABS_API_KEY))
  const apify = env.APIFY_API_TOKEN || env.APIFY_TOKEN
  if (apify)                  jobs.push(fetchApify(apify))
  if (env.KIE_AI_API_KEY)     jobs.push(fetchKie(env.KIE_AI_API_KEY))
  if (env.FAL_KEY)            jobs.push(fetchFal(env.FAL_KEY))
  if (env.REPLICATE_API_TOKEN) jobs.push(fetchReplicate(env.REPLICATE_API_TOKEN))
  if (env.STRIPE_SECRET_KEY)  jobs.push(fetchStripe(env.STRIPE_SECRET_KEY))
  for (const { label, token } of discoverTelegramTokens(env)) {
    jobs.push(fetchTelegramStars(label, token))
  }

  const results = await Promise.all(jobs)
  // Order: ok/low (с балансом) сначала, затем no-api, затем error
  const rank = (s: ProviderStatus) => s === 'ok' ? 0 : s === 'low' ? 1 : s === 'empty' ? 2 : s === 'no-api' ? 3 : 4
  return results.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))
}

// ─── 10s in-memory cache ──────────────────────────────────────────────────────
// Короткий TTL так как UI поллит каждые 15 секунд — лишних запросов к
// провайдерам всё равно не будет, а свежесть данных близка к real-time.
type Cache = { ts: number; data: ProviderResult[] }
const TTL_MS = 10_000

declare global {
  // eslint-disable-next-line no-var
  var __balancesCache: Cache | undefined
}

export async function getCachedBalances(force = false): Promise<{ providers: ProviderResult[]; cachedAt: string }> {
  const now = Date.now()
  if (!force && global.__balancesCache && now - global.__balancesCache.ts < TTL_MS) {
    return {
      providers: global.__balancesCache.data,
      cachedAt: new Date(global.__balancesCache.ts).toISOString(),
    }
  }
  const data = await fetchAllBalances()
  global.__balancesCache = { ts: now, data }
  return { providers: data, cachedAt: new Date(now).toISOString() }
}
