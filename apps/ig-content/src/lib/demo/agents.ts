// Canned agent outputs for IGC_DEMO mode — no Claude call.
import type {
  PlanDay,
  ReelsOutput,
  CarouselOutput,
  VisualBriefOutput,
  AnalyticsOutput,
} from '@/lib/agents'

export function demoPlan(duration: number): PlanDay[] {
  const base = [
    'Я запускаю 30-дневный эксперимент с Claude',
    'Claude собрал мне контент-план на месяц',
    'Я собрал AI-сценариста для Reels',
    'Claude против живого маркетолога',
    'Я построил AI-офис из 5 агентов',
    'Ошибка, которая стоила мне охвата',
    'Карусели, которые сохраняют',
    'Что сработало за первую неделю',
  ]
  return Array.from({ length: duration }, (_, i) => {
    const topic = base[i % base.length] + (i >= base.length ? ` (часть ${Math.floor(i / base.length) + 1})` : '')
    return {
      day_number: i + 1,
      topic,
      reels_idea: `Reels: динамичный разбор по теме «${topic}»`,
      carousel_idea: `Карусель: пошаговый фреймворк по теме «${topic}»`,
      main_hook: `«${topic}» — хук, который останавливает скролл`,
      daily_meaning: `Эпизод ${i + 1}: продолжает прошлый день и анонсирует следующий.`,
      cta: 'Подпишись на 30-дневный эксперимент с Claude',
      reach_rationale: 'Сторителлинг + конкретный результат + узнаваемая серия дают репосты и сохранения.',
    }
  })
}

export function demoReels(topic: string): ReelsOutput {
  return {
    title: `Reels: ${topic}`,
    hooks: [
      `«${topic}» — а ты так пробовал?`,
      'Я больше не делаю это руками',
      '9 секунд — и готово. Раньше уходил час',
      'Этот результат собрал не я',
      'Сохрани, пока не удалил',
    ],
    main_script:
      `[0-2с] Хук в лоб по теме «${topic}».\n[2-10с] Проблема, знакомая аудитории.\n[10-30с] Демонстрация на экране.\n[30-45с] Инсайт и польза.\n[45-60с] CTA: подпишись на серию.`,
    video_structure: [
      'Сцена 1 — talking head + текст-хук',
      'Сцена 2 — скринкаст',
      'Сцена 3 — крупный план результата',
      'Сцена 4 — talking head + CTA',
    ],
    b_roll_ideas: ['Набор текста крупным планом', 'Экран с процессом', 'Реакция «вау»'],
    caption: `Сегодня про «${topic}». Сохрани и подпишись 👆`,
    cta: 'Подпишись на 30-дневный эксперимент с Claude',
    hashtags: ['#claude', '#нейросети', '#ai', '#контент', '#reels'],
    visual_brief: 'Тёмный премиальный tech-стиль, янтарный акцент, высокий контраст.',
  }
}

export function demoCarousel(topic: string): CarouselOutput {
  return {
    cover_title: `${topic}: пошаговый разбор`,
    slides: [
      { slide: 1, title: 'Обложка', body: `${topic}: пошаговый разбор` },
      { slide: 2, title: 'Боль', body: 'Знакомая проблема, с которой сталкивается аудитория.' },
      { slide: 3, title: 'Ошибка', body: 'Как делают большинство — и почему это не работает.' },
      { slide: 4, title: 'Новый подход', body: 'Что делать вместо этого.' },
      { slide: 5, title: 'Фреймворк', body: 'Шаги 1→5 в виде простой системы.' },
      { slide: 6, title: 'Пример', body: 'Конкретный кейс с цифрами.' },
      { slide: 7, title: 'Инструкция', body: 'Готовый промпт / чек-лист для повторения.' },
      { slide: 8, title: 'Вывод', body: 'Главная мысль одной фразой.' },
      { slide: 9, title: 'CTA', body: 'Сохрани карусель и подпишись на серию.' },
    ],
    caption: `Карусель по теме «${topic}». Забирай шаблон 👆`,
    cta: 'Сохрани и подпишись',
    design_prompt: 'minimal dark carousel, amber accent, bold grotesk type, 4:5, consistent series style',
    hashtags: ['#claude', '#нейросети', '#контент', '#smm', '#ai'],
  }
}

export function demoVisualBrief(topic: string): VisualBriefOutput {
  return {
    concept: `Кинематографичный кадр по теме «${topic}» в премиальном tech-стиле.`,
    composition: 'Герой у светящегося дашборда, янтарные UI-панели, малая глубина резкости.',
    color_palette: 'Глубокий чёрный фон, янтарный акцент (#f59e0b), холодные блики.',
    typography: 'Жирный гротеск, крупный хук на экране.',
    image_prompt:
      'cinematic dark studio, entrepreneur at a glowing dashboard, amber neon UI panels, high contrast, premium tech aesthetic, --ar 9:16',
    designer_brief: 'Сохранять единый стиль серии: тёмный фон, янтарный акцент, одинаковая сетка.',
  }
}

export function demoAnalytics(): AnalyticsOutput {
  return {
    best_topics: ['Я построил AI-офис из 5 агентов', 'AI-сценарист для Reels', 'Claude против маркетолога'],
    best_hooks: ['«Этот Reels написал не я»', '«5 агентов вместо отдела»', '«Я делал это зря в каждом видео»'],
    best_formats: ['Reels (build-in-public)', 'Карусели с пошаговыми промптами'],
    reach_patterns: ['Личный результат + цифры', 'Закулисье процесса', 'Провокационный хук в первые 2 секунды'],
    saves_patterns: ['Карусели с готовыми промптами', 'Чек-листы и фреймворки'],
    repeat: [
      'Закулисные «build in public» Reels — охват в 2.3× выше среднего',
      'Карусели с пошаговыми промптами дают больше всего сохранений',
    ],
    remove: ['Абстрактные мотивационные посты без конкретики', 'Длинные интро дольше 3 секунд'],
    recommendations: [
      'Усилить серийность: явный тизер следующего дня в конце Reels',
      'Выносить готовый промпт на отдельный слайд карусели',
      'Тестировать хук-вопрос против хук-результата',
    ],
    next_7_days: [
      'День 24: разбор реальной ошибки в автоматизации',
      'День 25: Reels «до/после» внедрения AI',
      'День 26: карусель «5 промптов, заменяющих маркетолога»',
      'День 27: кейс клиента с цифрами',
      'День 28: live-демо агента',
      'День 29: подборка лучших промптов недели',
      'День 30: итоги эксперимента + оффер',
    ],
  }
}
