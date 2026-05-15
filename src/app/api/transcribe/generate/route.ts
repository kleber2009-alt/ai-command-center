import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/transcripts-db'

export const maxDuration = 60

type GenType = 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post'

type Body = { id?: string; transcript?: string; type: GenType }

type CarouselContent = {
  slides: Array<{ n: number; title: string; body: string }>
}
type ReelsContent = {
  hook: string
  promise: string
  body: Array<{ time: string; text: string }>
  cta: string
  text_on_screen: string[]
  caption: string
  hashtags: string[]
}
type TgPostContent = { text: string }

type GenContent = CarouselContent | ReelsContent | TgPostContent

const VALID_TYPES: GenType[] = ['carousel', 'reels-new', 'reels-remix', 'tg-post']

function buildPrompt(type: GenType, transcript: string): string {
  const text = transcript.slice(0, 30000)

  if (type === 'carousel') {
    return `Ты — топовый копирайтер, специализирующийся на залипательных каруселях для Instagram и LinkedIn. Твои карусели имеют средний engagement в 3-5 раз выше среднего.

Из транскрипта ниже сделай карусель из 8-10 слайдов на русском. Каждый слайд — отдельная мысль. Карусель должна заставить дочитать до конца.

Структура:
- Слайд 1 (HOOK): 5-8 слов, сильное обещание или провокационный вопрос. Цель — остановить пролистывание.
- Слайды 2-9 (CONTENT): каждый = одна ключевая идея из транскрипта. Заголовок 3-7 слов + раскрытие 2-4 коротких предложения.
- Последний слайд (CTA): призыв к действию — сохранить, поделиться, написать в комментарий.

Правила:
- Без воды и клише ("в современном мире", "как известно")
- Конкретика: цифры, имена, примеры из транскрипта
- Активный залог, разговорный тон
- Без эмодзи и markdown

Транскрипт:
"""
${text}
"""

Ответ ТОЛЬКО валидным JSON, без markdown-обёртки:
{ "slides": [{ "n": 1, "title": "...", "body": "..." }, ...] }`
  }

  if (type === 'reels-new') {
    return `Ты — сценарист коротких видео для Reels/TikTok с фокусом на удержание зрителя до конца.

Из транскрипта сделай свежий сценарий короткого видео (45-60 секунд) на русском. Видео должно цеплять с первой секунды.

Структура:
1. HOOK (0-3 сек): первая фраза заставляет остановиться. Паттерны: провокация / неожиданная статистика / прямой вопрос про боль зрителя / контр-интуитивное утверждение.
2. PROMISE (3-7 сек): чётко сказать что зритель получит.
3. BODY (7-50 сек): 3-4 ключевых пункта из транскрипта, по 8-12 сек. После каждого — мини-тизер ("но это ещё не всё...").
4. CTA (50-60 сек): призыв.

Дополнительно:
- TEXT_ON_SCREEN: 4-6 коротких подписей (≤4 слова), для смотрящих без звука.
- CAPTION: 1-3 предложения под пост.
- HASHTAGS: 5-7 русско/англо релевантных.

Правила:
- Разговорный тон, как другу
- Никаких "сегодня я расскажу"
- Каждое предложение ≤15 слов

Транскрипт:
"""
${text}
"""

Ответ ТОЛЬКО валидным JSON:
{ "hook": "...", "promise": "...", "body": [{ "time": "7-15s", "text": "..." }, ...], "cta": "...", "text_on_screen": ["...", ...], "caption": "...", "hashtags": ["#...", ...] }`
  }

  if (type === 'reels-remix') {
    return `Ты — сценарист коротких видео. Тебе нужно сделать НОВЫЙ сценарий на ту же тему что в транскрипте, но с другим заходом — чтобы видео не выглядело как репост.

Сохрани:
- Главную идею и ключевые факты из транскрипта
- Целевую аудиторию

Поменяй:
- HOOK: другой паттерн зацепки чем в исходнике
- Метафоры, примеры, формулировки
- Порядок аргументов
- Тональность (если сухо — добавь иронии; если эмоционально — сделай аналитичнее)
- Угол подачи: с того же тезиса заходи с противоположной стороны

Структура: HOOK (0-3 сек) → PROMISE (3-7 сек) → BODY (7-50 сек, 3-4 пункта) → CTA (50-60 сек) + TEXT_ON_SCREEN + CAPTION + HASHTAGS.

Транскрипт:
"""
${text}
"""

Ответ ТОЛЬКО валидным JSON:
{ "hook": "...", "promise": "...", "body": [{ "time": "...", "text": "..." }, ...], "cta": "...", "text_on_screen": ["..."], "caption": "...", "hashtags": ["#..."] }`
  }

  // tg-post
  return `Ты — автор Telegram-канала. Аудитория: предприниматели и специалисты, ценят конкретику и не любят воду.

Из транскрипта сделай пост 800-1500 символов на русском. Цель: дочитали, сохранили, написали в комментарии.

Структура:
- HOOK (первая строка): провокация / неочевидный факт / личная история. Без банальностей и кликбейта.
- РАСКРЫТИЕ: 2-3 абзаца, каждый — одна мысль. Короткие предложения, абзацы разделены пустой строкой.
- ПРИМЕР: один конкретный из транскрипта (цифры, имена, детали).
- ВЫВОД: одна сильная фраза-тезис.
- ВОПРОС: открытый, провоцирует написать в комментарии.

Правила:
- Эмодзи 1-2 на пост максимум, как буллеты
- Никаких "ставь лайк", "подписывайся"
- Никакого markdown (** *)
- Тон уверенный, как живой человек
- "ты" к читателю где уместно

Транскрипт:
"""
${text}
"""

Ответ ТОЛЬКО валидным JSON:
{ "text": "...полный текст поста, с переносами строк через \\n..." }`
}

function extractJsonObject(text: string): any {
  const fenceStripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const start = fenceStripped.indexOf('{')
  const end = fenceStripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response')
  }
  return JSON.parse(fenceStripped.slice(start, end + 1))
}

function validate(type: GenType, content: any): GenContent {
  if (type === 'carousel') {
    if (!Array.isArray(content?.slides) || content.slides.length === 0) {
      throw new Error('Карусель пустая или невалидная')
    }
    return {
      slides: content.slides.map((s: any, i: number) => ({
        n: typeof s.n === 'number' ? s.n : i + 1,
        title: String(s.title ?? ''),
        body: String(s.body ?? ''),
      })),
    }
  }
  if (type === 'reels-new' || type === 'reels-remix') {
    if (!content?.hook || !Array.isArray(content?.body)) {
      throw new Error('Сценарий рилса невалидный')
    }
    return {
      hook: String(content.hook),
      promise: String(content.promise ?? ''),
      body: content.body.map((b: any) => ({
        time: String(b.time ?? ''),
        text: String(b.text ?? ''),
      })),
      cta: String(content.cta ?? ''),
      text_on_screen: Array.isArray(content.text_on_screen)
        ? content.text_on_screen.map((s: any) => String(s))
        : [],
      caption: String(content.caption ?? ''),
      hashtags: Array.isArray(content.hashtags) ? content.hashtags.map((s: any) => String(s)) : [],
    }
  }
  // tg-post
  if (!content?.text || typeof content.text !== 'string') {
    throw new Error('Пост Telegram пустой')
  }
  return { text: content.text }
}

export async function POST(req: NextRequest) {
  const { id, transcript, type } = (await req.json()) as Body

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type должен быть одним из: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY не настроен на сервере' }, { status: 500 })
  }

  let text = transcript
  const supabase = getServerSupabase()

  if (id && supabase) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('transcript, generations')
      .eq('id', id)
      .single()
    if (error) {
      return NextResponse.json({ error: `Не найден транскрипт: ${error.message}` }, { status: 404 })
    }
    const cached = data.generations?.[type]
    if (cached) {
      return NextResponse.json({ type, content: cached, cached: true })
    }
    text = data.transcript
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт' }, { status: 400 })
  }

  const prompt = buildPrompt(type, text)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `Anthropic (${res.status}): ${errText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    const raw = data.content?.[0]?.text || ''
    if (!raw) {
      return NextResponse.json({ error: 'Пустой ответ от Anthropic' }, { status: 500 })
    }

    let parsed: any
    try {
      parsed = extractJsonObject(raw)
    } catch (e: any) {
      console.warn(`[/api/transcribe/generate ${type}] parse failed: ${e.message}. Raw:`, raw.slice(0, 300))
      return NextResponse.json({ error: `Не удалось распарсить ответ модели: ${e.message}` }, { status: 500 })
    }

    let validated: GenContent
    try {
      validated = validate(type, parsed)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }

    if (id && supabase) {
      const { data: row } = await supabase
        .from('transcripts')
        .select('generations')
        .eq('id', id)
        .single()
      const merged = { ...(row?.generations ?? {}), [type]: validated }
      await supabase.from('transcripts').update({ generations: merged }).eq('id', id)
    }

    return NextResponse.json({ type, content: validated, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка генерации' }, { status: 500 })
  }
}
