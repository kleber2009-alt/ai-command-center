'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'deferred'

type OfficeDecisionActionsProps = {
  decisionId: string
  currentStatus: DecisionStatus
  recommendedOptionKey?: string
}

const ACTIONS: Array<{
  status: Exclude<DecisionStatus, 'pending'>
  label: string
  className: string
}> = [
  {
    status: 'approved',
    label: 'Одобрить',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
  },
  {
    status: 'deferred',
    label: 'Отложить',
    className: 'border-slate-600/50 bg-slate-800/70 text-slate-200 hover:bg-slate-700/70',
  },
  {
    status: 'rejected',
    label: 'Отклонить',
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  },
]

export function OfficeDecisionActions({
  decisionId,
  currentStatus,
  recommendedOptionKey,
}: OfficeDecisionActionsProps) {
  const router = useRouter()
  const [message, setMessage] = useState<string>('')
  const [pendingAction, setPendingAction] = useState<DecisionStatus | null>(null)
  const [isRefreshing, startTransition] = useTransition()

  async function applyDecision(status: Exclude<DecisionStatus, 'pending'>) {
    setPendingAction(status)
    setMessage('')

    try {
      const response = await fetch('/api/office/decisions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: decisionId,
          status,
          actorId: 'web-office',
          selectedOptionKey: status === 'approved' ? recommendedOptionKey || null : null,
          resolutionNote:
            status === 'approved'
              ? 'Решение одобрено из веб-офиса.'
              : status === 'deferred'
                ? 'Решение отложено из веб-офиса.'
                : 'Решение отклонено из веб-офиса.',
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось обновить решение')
      }

      setMessage(
        status === 'approved'
          ? 'Решение одобрено.'
          : status === 'deferred'
            ? 'Решение отложено.'
            : 'Решение отклонено.',
      )

      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обновить решение')
    } finally {
      setPendingAction(null)
    }
  }

  const busy = isRefreshing || pendingAction !== null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const active = currentStatus === action.status
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => applyDecision(action.status)}
              disabled={busy}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? 'ring-1 ring-white/20' : ''
              } ${action.className}`}
            >
              {pendingAction === action.status ? 'Сохраняю...' : action.label}
            </button>
          )
        })}
      </div>
      {message ? <div className="text-xs text-slate-400">{message}</div> : null}
    </div>
  )
}
