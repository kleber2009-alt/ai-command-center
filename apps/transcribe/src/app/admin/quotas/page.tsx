'use client'

// Owner-only admin panel for managing transcribe quotas (Whisper minutes).
// Opens via the bot's Menu Button → Mini App → "/admin/quotas".
// Direct browser access without initData returns 403 from the API.

import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, UserPlus } from 'lucide-react'

import { apiFetch } from '@/lib/telegram'

type AdminUserRow = {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  subscription_tier: 'free' | 'pro' | 'team'
  created_at: string
  minutes_used: number | null
  minutes_limit: number | null
  resets_at: string | null
}

function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Number(value) === -1) return '∞'
  return Number(value).toFixed(0)
}

export default function QuotasAdminPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [grantTg, setGrantTg] = useState('')
  const [grantDelta, setGrantDelta] = useState('60')
  const [granting, setGranting] = useState(false)
  const [rowLoading, setRowLoading] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/admin/users')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        setUsers([])
      } else {
        setUsers(data.users || [])
      }
    } catch (e: any) {
      setError(e?.message || 'fetch_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function grantByTelegramId(e: React.FormEvent) {
    e.preventDefault()
    const tgId = Number(grantTg)
    const delta = Number(grantDelta)
    if (!Number.isFinite(tgId) || tgId <= 0) {
      setError('telegram_id должен быть положительным числом')
      return
    }
    if (!Number.isFinite(delta) || delta === 0) {
      setError('Минуты должны быть числом, отличным от 0')
      return
    }
    setGranting(true)
    setError(null)
    setNotice(null)
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: tgId, delta_minutes: delta }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
      } else {
        setNotice(`✓ Юзеру tg=${tgId} начислено ${delta} мин. Лимит: ${data.minutesLimit}`)
        setGrantTg('')
        await load()
      }
    } catch (e: any) {
      setError(e?.message || 'request_failed')
    } finally {
      setGranting(false)
    }
  }

  async function bumpRow(userId: string, delta: number) {
    setRowLoading(userId)
    setError(null)
    setNotice(null)
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, delta_minutes: delta }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
      } else {
        setNotice(`✓ Новый лимит: ${data.minutes_limit}`)
        await load()
      }
    } catch (e: any) {
      setError(e?.message || 'request_failed')
    } finally {
      setRowLoading(null)
    }
  }

  return (
    <div className="space-y-5 text-slate-200">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Квоты · минуты Whisper</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Управление минутами для пользователей. Только для владельца.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Обновить
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {/* Grant by Telegram ID */}
      <form
        onSubmit={grantByTelegramId}
        className="space-y-3 rounded-xl border border-slate-700/40 bg-slate-800/30 p-5"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold">Начислить минуты по Telegram ID</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
          <input
            type="number"
            value={grantTg}
            onChange={e => setGrantTg(e.target.value)}
            required
            placeholder="Telegram ID, например 1280515130"
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/60"
          />
          <input
            type="number"
            value={grantDelta}
            onChange={e => setGrantDelta(e.target.value)}
            required
            placeholder="Минуты"
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/60"
          />
          <button
            type="submit"
            disabled={granting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Начислить
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Если юзера ещё нет — будет создан с тиром <code>pro</code>. Отрицательное значение — убирает минуты.
        </p>
      </form>

      {/* Users table */}
      <div className="overflow-hidden rounded-xl border border-slate-700/40 bg-slate-800/30">
        <div className="border-b border-slate-700/40 px-5 py-3">
          <h2 className="text-sm font-semibold">Пользователи · {users.length}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-700/40 bg-slate-900/30 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Telegram</th>
                <th className="px-4 py-2.5 text-left">Имя</th>
                <th className="px-4 py-2.5 text-left">Тир</th>
                <th className="px-4 py-2.5 text-right">Использовано</th>
                <th className="px-4 py-2.5 text-right">Лимит</th>
                <th className="px-4 py-2.5 text-right">Начислить</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Пользователей нет
                  </td>
                </tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {u.telegram_id}
                    {u.username && <div className="text-slate-500">@{u.username}</div>}
                  </td>
                  <td className="px-4 py-3">{u.first_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-md bg-slate-700/40 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                      {u.subscription_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-400">
                    {formatMinutes(u.minutes_used)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-100">
                    {formatMinutes(u.minutes_limit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {[60, 300, 1000].map(delta => (
                        <button
                          key={delta}
                          onClick={() => bumpRow(u.id, delta)}
                          disabled={rowLoading === u.id}
                          className="rounded border border-slate-700 bg-slate-900/40 px-2 py-1 text-[11px] font-medium hover:border-indigo-500/60 disabled:opacity-50"
                        >
                          +{delta}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
