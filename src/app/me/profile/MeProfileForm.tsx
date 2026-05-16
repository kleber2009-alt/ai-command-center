'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Save, TriangleAlert } from 'lucide-react'
import MeTabs from '../MeTabs'

type Profile = {
  bio: string
  projects: string
  academy: string
  social: string
  voice: string
  custom: Record<string, string>
}

const EMPTY: Profile = { bio: '', projects: '', academy: '', social: '', voice: '', custom: {} }

const FIELDS: Array<{ key: keyof Omit<Profile, 'custom'>; label: string; placeholder: string; hint: string }> = [
  {
    key: 'bio',
    label: 'О себе',
    placeholder: 'Кто ты, чем занимаешься, ключевые роли и контексты…',
    hint: 'Контекст про тебя: имя, профессия, опыт, география, важные факты.',
  },
  {
    key: 'projects',
    label: 'Проекты',
    placeholder: 'Текущие проекты, стадии, цели, метрики, команды…',
    hint: 'Что сейчас в работе. Можно по блокам: название → описание → стадия → цели.',
  },
  {
    key: 'academy',
    label: 'Академия / знания',
    placeholder: 'Программы, курсы, методологии, фреймворки которыми ты владеешь…',
    hint: 'Концентрат знаний. Принципы, ключевые понятия, авторские штуки.',
  },
  {
    key: 'social',
    label: 'Соцсети',
    placeholder: '@instagram, t.me/канал, youtube/@you — тон, тематика, что публикуешь…',
    hint: 'Куда ты пишешь и про что. Помогает попадать в твой стиль.',
  },
  {
    key: 'voice',
    label: 'Голос и стиль',
    placeholder: 'Как ты говоришь, какие слова любишь, что не используешь, какие табу…',
    hint: 'Помогает писать текстами от твоего лица.',
  },
]

export default function MeProfileForm() {
  const [profile, setProfile] = useState<Profile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/profile')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.profile) {
          setProfile({
            bio: data.profile.bio ?? '',
            projects: data.profile.projects ?? '',
            academy: data.profile.academy ?? '',
            social: data.profile.social ?? '',
            voice: data.profile.voice ?? '',
            custom: data.profile.custom ?? {},
          })
        }
        setConfigured(Boolean(data.configured))
      })
      .catch((e) => setError(e?.message || 'Не удалось загрузить профиль'))
      .finally(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`)
      setSaved(true)
      if (savedTimeout.current) clearTimeout(savedTimeout.current)
      savedTimeout.current = setTimeout(() => setSaved(false), 1500)
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-[13px] text-apple-muted hover:text-apple-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад к чату
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-apple-ink sm:text-[34px]">
              Профиль
            </h1>
            <p className="mt-1 text-[15px] text-apple-muted sm:text-base">
              Эти поля попадают в системный промпт каждого диалога. Заполняй вдумчиво — это «ядро» второго мозга.
            </p>
          </div>
        </div>
        <MeTabs active="profile" />
      </header>

      {!configured && (
        <div className="flex items-start gap-2 rounded-apple-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Supabase не настроен. Добавь <code className="rounded bg-white/60 px-1">NEXT_PUBLIC_SUPABASE_URL</code> и{' '}
            <code className="rounded bg-white/60 px-1">SUPABASE_SERVICE_KEY</code> в .env.local, выполни миграцию{' '}
            <code className="rounded bg-white/60 px-1">supabase/migrations/003_me.sql</code> в Supabase SQL Editor.
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-apple-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-apple-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем…
        </div>
      ) : (
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <section key={f.key} className="rounded-apple-lg border border-apple-line bg-white p-5 shadow-apple-sm">
              <label className="mb-1 block text-[13px] font-semibold text-apple-ink">{f.label}</label>
              <p className="mb-2.5 text-[12px] text-apple-faint">{f.hint}</p>
              <textarea
                value={profile[f.key]}
                onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={5}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-white focus:shadow-apple-sm"
              />
              <p className="mt-1.5 text-right text-[11px] text-apple-faint">{profile[f.key].length} симв.</p>
            </section>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-apple-line bg-white/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !configured}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-apple-blue px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong sm:w-auto"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" /> Сохранено
            </>
          ) : saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Сохраняем…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Сохранить
            </>
          )}
        </button>
      </div>
    </div>
  )
}
