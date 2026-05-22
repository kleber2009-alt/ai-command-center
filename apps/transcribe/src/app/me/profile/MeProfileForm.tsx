'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import MeTabs from '../MeTabs'
import { apiFetch } from '@/lib/api-client'

type ProjectCard = {
  id: string
  name: string
  description: string
  stage: string
  metrics: string
}

type Profile = {
  bio: string
  projects: string
  projects_list: ProjectCard[]
  academy: string
  social: string
  voice: string
  custom: Record<string, string>
}

const EMPTY: Profile = {
  bio: '',
  projects: '',
  projects_list: [],
  academy: '',
  social: '',
  voice: '',
  custom: {},
}

const FIELDS: Array<{ key: 'bio' | 'projects' | 'academy' | 'social' | 'voice'; label: string; placeholder: string; hint: string }> = [
  {
    key: 'bio',
    label: 'О себе',
    placeholder: 'Кто ты, чем занимаешься, ключевые роли и контексты…',
    hint: 'Контекст про тебя: имя, профессия, опыт, география, важные факты.',
  },
  {
    key: 'projects',
    label: 'Заметки по проектам (свободный текст)',
    placeholder: 'Доп.детали, идеи, мысли вокруг проектов…',
    hint: 'Сами проекты заведи карточками выше — это поле для общих заметок и контекста.',
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

function newProjectId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

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
    apiFetch('/api/me/profile')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.profile) {
          setProfile({
            bio: data.profile.bio ?? '',
            projects: data.profile.projects ?? '',
            projects_list: Array.isArray(data.profile.projects_list) ? data.profile.projects_list : [],
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
      const res = await apiFetch('/api/me/profile', {
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
            Локальная база недоступна. Проверь переменную <code className="rounded bg-apple-bg-elev/60 px-1">DB_PATH</code> и
            что папка <code className="rounded bg-apple-bg-elev/60 px-1">./data</code> доступна на запись.
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
          {/* О себе */}
          <section className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
            <label className="mb-1 block text-[13px] font-semibold text-apple-ink">{FIELDS[0].label}</label>
            <p className="mb-2.5 text-[12px] text-apple-faint">{FIELDS[0].hint}</p>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder={FIELDS[0].placeholder}
              rows={5}
              className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-apple-bg-elev focus:shadow-apple-sm"
            />
            <p className="mt-1.5 text-right text-[11px] text-apple-faint">{profile.bio.length} симв.</p>
          </section>

          {/* Проекты — карточки */}
          <section className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-[13px] font-semibold text-apple-ink">Проекты</label>
              <button
                type="button"
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    projects_list: [
                      ...p.projects_list,
                      { id: newProjectId(), name: '', description: '', stage: '', metrics: '' },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-apple-line bg-apple-bg-elev px-3 py-1 text-[12px] font-medium text-apple-ink shadow-apple-sm hover:bg-apple-bg-soft"
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить проект
              </button>
            </div>
            <p className="mb-3 text-[12px] text-apple-faint">
              Каждый проект — карточка с названием, описанием, стадией и метриками. Уходит в системный промпт чата второго мозга.
            </p>
            {profile.projects_list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-apple-line p-5 text-center text-[13px] text-apple-faint">
                Нет проектов. Нажми «Добавить проект».
              </div>
            ) : (
              <ul className="space-y-3">
                {profile.projects_list.map((proj, idx) => (
                  <li key={proj.id} className="rounded-xl border border-apple-line bg-apple-bg-elev p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={proj.name}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            projects_list: p.projects_list.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                          }))
                        }
                        placeholder="Название проекта"
                        className="flex-1 rounded-lg border border-apple-line bg-apple-bg-elev px-3 py-1.5 text-[14px] font-medium text-apple-ink outline-none focus:border-apple-line-strong focus:shadow-apple-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setProfile((p) => ({
                            ...p,
                            projects_list: p.projects_list.filter((_, i) => i !== idx),
                          }))
                        }
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-apple-faint hover:bg-red-50 hover:text-red-500"
                        aria-label="Удалить проект"
                        title="Удалить проект"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={proj.stage}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            projects_list: p.projects_list.map((x, i) => (i === idx ? { ...x, stage: e.target.value } : x)),
                          }))
                        }
                        placeholder="Стадия (запуск, рост, поддержка…)"
                        className="rounded-lg border border-apple-line bg-apple-bg-elev px-3 py-1.5 text-[13px] text-apple-ink outline-none focus:border-apple-line-strong focus:shadow-apple-sm"
                      />
                      <input
                        type="text"
                        value={proj.metrics}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            projects_list: p.projects_list.map((x, i) => (i === idx ? { ...x, metrics: e.target.value } : x)),
                          }))
                        }
                        placeholder="Метрики (MRR, охваты, conv…)"
                        className="rounded-lg border border-apple-line bg-apple-bg-elev px-3 py-1.5 text-[13px] text-apple-ink outline-none focus:border-apple-line-strong focus:shadow-apple-sm"
                      />
                    </div>
                    <textarea
                      value={proj.description}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          projects_list: p.projects_list.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                        }))
                      }
                      placeholder="Что это, для кого, на каком этапе, ключевые гипотезы и цели…"
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-apple-line bg-apple-bg-elev p-3 text-[13px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none focus:border-apple-line-strong focus:shadow-apple-sm"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Остальные поля */}
          {FIELDS.slice(1).map((f) => (
            <section key={f.key} className="rounded-apple-lg border border-apple-line bg-apple-bg-elev p-5 shadow-apple-sm">
              <label className="mb-1 block text-[13px] font-semibold text-apple-ink">{f.label}</label>
              <p className="mb-2.5 text-[12px] text-apple-faint">{f.hint}</p>
              <textarea
                value={profile[f.key]}
                onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={5}
                className="w-full rounded-xl border border-apple-line bg-apple-bg-soft p-3 text-[14px] leading-relaxed text-apple-ink placeholder:text-apple-faint outline-none transition-all focus:border-apple-line-strong focus:bg-apple-bg-elev focus:shadow-apple-sm"
              />
              <p className="mt-1.5 text-right text-[11px] text-apple-faint">{profile[f.key].length} симв.</p>
            </section>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-apple-line bg-apple-bg-elev/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !configured}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-apple-blue px-5 py-2.5 text-[14px] font-medium text-apple-bg transition-colors hover:bg-apple-blue-hover active:bg-apple-blue-pressed disabled:cursor-not-allowed disabled:bg-apple-line-strong sm:w-auto"
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
