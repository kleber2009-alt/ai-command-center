'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, Lock, Loader2, ArrowRight } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type State = 'loading' | 'ok' | 'forbidden'

// Lightweight client wrapper for /me, /admin and other owner-only pages.
// Pings /api/me/profile once on mount; on 401/403 it renders a friendly
// explanation instead of letting the inner UI render against failing fetches.
export default function OwnerGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    let alive = true
    apiFetch('/api/me/profile')
      .then((res) => {
        if (!alive) return
        if (res.status === 401 || res.status === 403) setState('forbidden')
        else setState('ok')
      })
      .catch(() => alive && setState('ok'))
    return () => {
      alive = false
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-apple-faint">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (state === 'forbidden') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-apple-bg-soft">
          <Lock className="h-5 w-5 text-apple-muted" />
        </div>
        <h2 className="mb-2 text-[20px] font-semibold text-apple-ink">Только для владельца</h2>
        <p className="mx-auto mb-6 max-w-xs text-[14px] leading-relaxed text-apple-muted">
          Раздел «Я» — личная база знаний владельца аккаунта. Войди под своим Telegram-аккаунтом или вернись к транскрибации.
        </p>
        <Link
          href="/transcribe"
          className="inline-flex items-center gap-2 rounded-full bg-apple-ink px-4 py-2 text-[14px] font-medium text-apple-bg hover:bg-apple-ink/90"
        >
          <Brain className="h-4 w-4" />
          Перейти к транскрибации
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
