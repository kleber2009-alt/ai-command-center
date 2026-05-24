// In-memory seed data for IGC_DEMO mode. Lets the whole app run end-to-end
// without a real Supabase project. Module-level singletons persist across
// requests within a single dev-server run.

// IGC_DEMO is server-only; NEXT_PUBLIC_IGC_DEMO is the client-visible mirror.
export const isDemo = () =>
  process.env.IGC_DEMO === '1' || process.env.NEXT_PUBLIC_IGC_DEMO === '1'

export const DEMO_USER = {
  id: 'demo-user-0001',
  email: 'ilia.paliy@icloud.com',
  user_metadata: { name: 'Илья' },
}

const now = () => new Date().toISOString()
const dayDate = (offset: number) => {
  const d = new Date('2026-05-24T00:00:00Z')
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

type Row = Record<string, any>

interface Store {
  campaigns: Row[]
  content_days: Row[]
  reels: Row[]
  carousels: Row[]
  metrics: Row[]
  ai_outputs: Row[]
}

function seed(): Store {
  const campaignId = 'camp-30-days'
  const days: Row[] = [
    ['Я запускаю 30-дневный эксперимент с Claude', '«30 дней. 2 единицы контента в день. Один AI-напарник.»', 'published', 'Подпишись, чтобы увидеть весь эксперимент'],
    ['Claude собрал мне контент-план на месяц', '«Я не придумал ни одной темы сам — их сгенерировал агент»', 'published', 'Сохрани — пригодится для своей ниши'],
    ['Я собрал AI-сценариста для Reels', '«Этот сценарий писал не я»', 'generated', 'Завтра — Claude против живого маркетолога'],
    ['Claude против живого маркетолога', '«Я стравил агента и маркетолога на одной задаче»', 'ready', 'Голосуй в комментах: кто победил?'],
    ['Я построил AI-офис из 5 агентов', '«5 агентов вместо отдела — показываю изнутри»', 'idea', 'Хочешь такой же? Пиши «офис» в директ'],
    ['Ошибка, которая стоила мне охвата', '«Я делал это в каждом Reels — и зря»', 'needs_revision', 'Сохрани, чтобы не повторить'],
    ['Как я собираю карусели, которые сохраняют', '«Формула карусели на 2000+ сохранений»', 'published', 'Забери шаблон по ссылке в шапке'],
    ['30 дней позади: что сработало', '«Цифры, провалы и выводы эксперимента»', 'idea', 'Готов к следующему эксперименту со мной?'],
  ].map((d, i) => ({
    id: `cd-${i + 1}`,
    campaign_id: campaignId,
    day_number: i + 1,
    date: dayDate(i),
    topic: d[0],
    main_hook: d[1],
    daily_meaning: `Эпизод ${i + 1}: продолжает предыдущий день и анонсирует следующий — единый сюжет серии.`,
    cta: d[3],
    reels_idea: `Reels по теме «${d[0]}» — динамичный talking-head + скринкаст`,
    carousel_idea: `Карусель-разбор по теме «${d[0]}» с пошаговым фреймворком`,
    status: d[2],
    created_at: now(),
    updated_at: now(),
  }))

  const reels: Row[] = [
    {
      id: 'reel-3',
      content_day_id: 'cd-3',
      title: 'Я собрал AI-сценариста для Reels за один вечер',
      hooks: [
        'Я больше не пишу сценарии руками — вот что вместо меня',
        '3 строки промпта = готовый сценарий на 50 секунд',
        'Маркетолог за 5000₽ или агент за 9 секунд?',
        'Этот Reels написал не я',
        'Я дал Claude одну задачу — и удалил папку с шаблонами',
      ],
      main_script:
        '[0-2с] Крупный план, резко: «Этот сценарий я не писал».\n[2-8с] Проблема: на один Reels уходил час.\n[8-25с] Демонстрация: вставляю тему дня, агент отдаёт 5 хуков и сценарий.\n[25-45с] Инсайт: дело не в скорости, а в серийности — агент держит сюжет всей кампании.\n[45-60с] CTA: «Подпишись — завтра стравлю агента с маркетологом».',
      video_structure: [
        'Сцена 1 — talking head, текст «Это писал не я»',
        'Сцена 2 — скринкаст интерфейса генерации',
        'Сцена 3 — split-screen: рука печатает vs агент',
        'Сцена 4 — talking head + крупный план промпта',
      ],
      b_roll_ideas: ['Замедленная съёмка набора текста', 'Экран с генерацией', 'Стопка распечатанных шаблонов летит в корзину'],
      caption:
        'День 3 эксперимента. Сегодня собрал AI-сценариста для Reels. Сохрани промпт 👆 Завтра — Claude против живого маркетолога.',
      cta: 'Подпишись, чтобы увидеть весь 30-дневный эксперимент',
      hashtags: ['#claude', '#нейросети', '#ai', '#контентмаркетинг', '#reels', '#автоматизация'],
      visual_brief:
        'Премиальный tech-стиль, кинематографично, высокий контраст, тёмный UI с янтарным акцентом.\n\nImage prompt: cinematic dark studio, entrepreneur at a glowing dashboard, amber neon UI panels floating, high contrast, premium tech aesthetic, --ar 9:16',
      status: 'generated',
      created_at: now(),
      updated_at: now(),
    },
  ]

  const carousels: Row[] = [
    {
      id: 'car-2',
      content_day_id: 'cd-2',
      cover_title: 'Как Claude собрал мой контент-план на 30 дней',
      slides: [
        { slide: 1, title: 'Обложка', body: 'Как Claude собрал мой контент-план на 30 дней — без копирайтера' },
        { slide: 2, title: 'Боль', body: 'Каждый месяц одно и то же: «о чём снимать?». Идеи кончаются на третий день.' },
        { slide: 3, title: 'Ошибка', body: 'Большинство просит «придумай 30 тем». Получает разрозненный список без сюжета.' },
        { slide: 4, title: 'Новый подход', body: 'Я дал агенту контекст: нишу, цель, оффер, лид-магнит и тон.' },
        { slide: 5, title: 'Фреймворк', body: 'Каждый день: тема → Reels-идея → карусель-идея → хук → смысл → CTA.' },
        { slide: 6, title: 'Серийность', body: 'Главное: дни связаны в историю — каждый тизерит следующий.' },
        { slide: 7, title: 'Промпт', body: 'Скопируй структуру промпта со следующего слайда и подставь свою нишу.' },
        { slide: 8, title: 'Вывод', body: 'План на месяц за 4 минуты — и он держит единый голос бренда.' },
        { slide: 9, title: 'CTA', body: 'Сохрани карусель и подпишись — завтра соберём AI-сценариста.' },
      ],
      caption: 'День 2. Claude собрал контент-план на месяц. Забирай структуру промпта 👆 #нейросети #контент #claude',
      cta: 'Сохрани и подпишись на эксперимент',
      design_prompt: 'minimal dark carousel template, amber accent, bold grotesk type, 4:5, consistent series style',
      hashtags: ['#claude', '#контентплан', '#нейросети', '#smm', '#ai'],
      status: 'generated',
      created_at: now(),
      updated_at: now(),
    },
  ]

  // Metrics for the published / live days.
  const m = (id: string, dayId: string, type: string, v: number, l: number, c: number, s: number, sh: number, f: number, ld: number, off: number): Row => ({
    id,
    content_day_id: dayId,
    content_type: type,
    views: v, likes: l, comments: c, saves: s, shares: sh, follows: f, leads: ld,
    published_at: dayDate(off) + 'T12:00:00Z',
    created_at: now(),
  })
  const metrics: Row[] = [
    m('mt-1', 'cd-1', 'reels', 29800, 2450, 180, 980, 540, 612, 12, 0),
    m('mt-2', 'cd-1', 'carousel', 14200, 1100, 96, 1820, 210, 240, 19, 0),
    m('mt-3', 'cd-2', 'reels', 33400, 1980, 210, 1240, 380, 410, 24, 1),
    m('mt-4', 'cd-2', 'carousel', 33400, 1980, 156, 2760, 290, 333, 33, 1),
    m('mt-5', 'cd-7', 'reels', 41100, 3010, 302, 1880, 402, 690, 29, 6),
    m('mt-6', 'cd-7', 'carousel', 38900, 2200, 188, 3120, 288, 540, 52, 6),
  ]

  return {
    campaigns: [
      {
        id: campaignId,
        user_id: DEMO_USER.id,
        title: '30 Days With Claude',
        topic: 'Как я изучаю Claude и автоматизирую контент, продажи и бизнес-системы',
        goal: 'Рост охвата, подписчиков и привлечение клиентов',
        duration: 30,
        target_audience: 'Предприниматели, креаторы, маркетологи и онлайн-бизнес, интересующиеся AI',
        offer: 'Консалтинг по внедрению AI',
        lead_magnet: '10 промптов Claude, заменяющих маркетолога и стратега',
        tone_of_voice: 'Экспертный, энергичный, сторителлинг',
        cta: 'Подпишись на 30-дневный эксперимент с Claude',
        platform: 'instagram',
        formats: ['reels', 'carousel'],
        content_pillars: [],
        status: 'active',
        created_at: now(),
        updated_at: now(),
      },
      {
        id: 'camp-ai-sales',
        user_id: DEMO_USER.id,
        title: 'AI Sales за 60 дней',
        topic: 'Построение отдела продаж на AI-агентах с нуля',
        goal: 'Лиды и продажи',
        duration: 60,
        target_audience: 'Владельцы B2B-бизнеса',
        offer: 'Внедрение AI-продаж',
        lead_magnet: 'Чек-лист AI-отдела продаж',
        tone_of_voice: 'Экспертный',
        cta: 'Запишись на разбор',
        platform: 'instagram',
        formats: ['reels', 'carousel'],
        content_pillars: [],
        status: 'active',
        created_at: now(),
        updated_at: now(),
      },
    ],
    content_days: days,
    reels,
    carousels,
    metrics,
    ai_outputs: [],
  }
}

// Single shared instance for the process lifetime.
const g = globalThis as unknown as { __igcStore?: Store }
export const store: Store = g.__igcStore ?? (g.__igcStore = seed())
