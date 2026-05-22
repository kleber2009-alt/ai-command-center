import { NextRequest, NextResponse } from 'next/server'
import { getTranscript, mergeTranscriptGenerations } from '@/lib/transcripts-db'
import { streamAnthropic } from '@/lib/anthropic-stream'
import { authenticate } from '@/lib/telegram-auth'

export const maxDuration = 120

type GenType = 'carousel' | 'reels-new' | 'reels-remix' | 'tg-post' | 'carousel-image'

type Body = { id?: string; transcript?: string; type: GenType }

type CarouselContent = {
  slides: Array<{ n: number; title: string; body: string }>
}
type CarouselImageContent = {
  slides: Array<{ n: number; title: string; body: string; imageUrl: string | null }>
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

type GenContent = CarouselContent | CarouselImageContent | ReelsContent | TgPostContent

const VALID_TYPES: GenType[] = ['carousel', 'reels-new', 'reels-remix', 'tg-post', 'carousel-image']

// Markdown-first prompts so the stream looks readable while it's running.
// At the end the server parses the markdown back into the legacy structured
// shape the UI expects.
function buildPrompt(type: GenType, transcript: string): string {
  const text = transcript.slice(0, 30000)

  if (type === 'carousel') {
    return `Ты — топовый копирайтер, специализирующийся на залипательных каруселях для Instagram и LinkedIn. Твои карусели имеют средний engagement в 3-5 раз выше среднего.

Из транскрипта ниже сделай карусель из 8-10 слайдов на русском.

Правила:
- Без воды и клише
- Конкретика: цифры, имена, примеры из транскрипта
- Активный залог, разговорный тон
- Слайд 1 = HOOK (5-8 слов), последний = CTA
- Контентные слайды: заголовок 3-7 слов + раскрытие 2-4 коротких предложения

Транскрипт:
"""
${text}
"""

Формат вывода — markdown:

## Слайд 1 — Заголовок слайда
Тело слайда (несколько предложений).

## Слайд 2 — Заголовок второго
Тело.

… (до 8-10 слайдов)`
  }

  if (type === 'reels-new' || type === 'reels-remix') {
    const intro =
      type === 'reels-new'
        ? `Ты — сценарист коротких видео для Reels/TikTok с фокусом на удержание зрителя до конца. Сделай свежий сценарий на 45-60 секунд по транскрипту.`
        : `Ты — сценарист коротких видео. Сделай НОВЫЙ сценарий на ту же тему что в транскрипте, но с другим заходом — чтобы не выглядел как репост. Поменяй хук, метафоры, порядок аргументов, тональность.`
    return `${intro}

Правила:
- Разговорный тон, как другу
- Каждое предложение ≤15 слов
- Никаких "сегодня я расскажу"

Транскрипт:
"""
${text}
"""

Формат — markdown. Соблюдай эти разделы и заголовки ровно так:

## HOOK · 0-3s
Первая фраза.

## PROMISE · 3-7s
Что зритель получит.

## BODY
- [7-20s] Первый пункт
- [20-35s] Второй пункт
- [35-50s] Третий пункт

## CTA · 50-60s
Призыв.

## TEXT_ON_SCREEN
- Подпись 1
- Подпись 2
- Подпись 3
- Подпись 4

## CAPTION
1-3 предложения под пост.

## HASHTAGS
#tag1 #tag2 #tag3 #tag4 #tag5`
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
- Эмодзи 1-2 на пост максимум
- Никаких "ставь лайк", "подписывайся"
- Никакого markdown (без ** и *)
- Тон уверенный, как живой человек

Транскрипт:
"""
${text}
"""

Выведи ТОЛЬКО текст поста, без префиксов, без обёрток.`
}

// ---- Markdown parsers ----

function parseCarousel(md: string): CarouselContent {
  const slides: Array<{ n: number; title: string; body: string }> = []
  // Match ## Слайд N — Title (or "##  Слайд 1: title" etc.)
  const re = /##\s*Слайд\s*(\d+)\s*[—\-:.]+\s*(.+?)\n([\s\S]*?)(?=\n##\s|$)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    slides.push({
      n: Number(m[1]) || slides.length + 1,
      title: m[2].trim(),
      body: m[3].trim(),
    })
  }
  if (slides.length === 0) throw new Error('Карусель пустая')
  return { slides }
}

function parseReels(md: string): ReelsContent {
  const sec = (name: string) => {
    const m = md.match(new RegExp(`##\\s*${name}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'))
    return m ? m[1].trim() : ''
  }
  const hook = sec('HOOK')
  const promise = sec('PROMISE')
  const bodyText = sec('BODY')
  const cta = sec('CTA')
  const tosText = sec('TEXT[_\\s]*ON[_\\s]*SCREEN')
  const caption = sec('CAPTION')
  const hashtagsText = sec('HASHTAGS')

  // Parse "- [7-20s] Текст" pattern
  const body: Array<{ time: string; text: string }> = []
  for (const line of bodyText.split('\n')) {
    const lm = line.match(/^\s*[-*•]\s*\[?\s*([0-9].*?)\s*\]?\s+(.+)$/)
    if (lm) body.push({ time: lm[1].trim(), text: lm[2].trim() })
  }
  if (body.length === 0 && bodyText) body.push({ time: '0-60s', text: bodyText })

  const text_on_screen: string[] = []
  for (const line of tosText.split('\n')) {
    const lm = line.match(/^\s*[-*•]\s+(.+)$/)
    if (lm) text_on_screen.push(lm[1].trim())
  }

  const hashtags = (hashtagsText.match(/#[^\s#]+/g) || []).map((s) => s.trim())

  if (!hook && body.length === 0) throw new Error('Сценарий рилса пуст')
  return { hook, promise, body, cta, text_on_screen, caption, hashtags }
}

function parseTgPost(md: string): TgPostContent {
  const trimmed = md.trim()
  if (!trimmed) throw new Error('Пост Telegram пустой')
  return { text: trimmed }
}

function parseContent(type: GenType, md: string): GenContent {
  if (type === 'carousel') return parseCarousel(md)
  if (type === 'reels-new' || type === 'reels-remix') return parseReels(md)
  return parseTgPost(md)
}

function ndjsonResponse(events: Array<Record<string, any>>): Response {
  const enc = new TextEncoder()
  const body = events.map((e) => JSON.stringify(e) + '\n').join('')
  return new Response(enc.encode(body), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  })
}

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
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
  if (id) {
    const row = getTranscript(id, auth.user_id)
    if (!row) return NextResponse.json({ error: 'Не найден транскрипт' }, { status: 404 })
    const cached = row.generations?.[type]
    if (cached) {
      // Replay cached structured content as a single meta + done so the client
      // can use the same NDJSON reader path. We don't replay markdown here —
      // the structured content is what the UI actually renders post-stream.
      return ndjsonResponse([
        { type: 'meta', cached: true, content: cached },
        { type: 'done' },
      ])
    }
    text = row.transcript
  }

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'Пустой транскрипт' }, { status: 400 })
  }

  // ── carousel-image: Claude text → kie.ai images ──────────────────────────
  if (type === 'carousel-image') {
    if (!process.env.KIE_AI_API_KEY) {
      return NextResponse.json({ error: 'KIE_AI_API_KEY не настроен на сервере' }, { status: 500 })
    }
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
          messages: [{ role: 'user', content: buildPrompt('carousel', text) }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        return NextResponse.json({ error: `Anthropic (${res.status}): ${errText.slice(0, 300)}` }, { status: res.status })
      }
      const data = await res.json()
      const raw = data.content?.[0]?.text || ''
      if (!raw) return NextResponse.json({ error: 'Пустой ответ от Anthropic' }, { status: 500 })

      let slides: Array<{ n: number; title: string; body: string }>
      try {
        const parsed = extractJsonObject(raw)
        const validated = validate('carousel', parsed) as CarouselContent
        slides = validated.slides
      } catch (e: any) {
        return NextResponse.json({ error: `Не удалось распарсить слайды: ${e.message}` }, { status: 500 })
      }

      const imagePrompts = slides.map(
        s => `Instagram carousel slide. ${s.title}. ${s.body}. Minimalist professional visual, no text overlay, clean composition.`,
      )
      const imageUrls = await generateKieImages(imagePrompts, process.env.KIE_AI_API_KEY)

      const content: CarouselImageContent = {
        slides: slides.map((s, i) => ({ ...s, imageUrl: imageUrls[i] ?? null })),
      }

      if (id) await dbMergeGenerations(id, type, content)

      // Auto-deliver to the user's Telegram chat. Fire-and-forget so we
      // don't block the API response on Telegram latency. Reachable only
      // when the request came through a verified Mini App session AND
      // the bot token is configured — otherwise the artifact stays in
      // the Mini App UI and the user can resend via the manual endpoint.
      let tgDelivery: { sent: number; skipped: number; error?: string } | null = null
      if (tgChatId && botToken) {
        try {
          tgDelivery = await sendCarouselMediaGroup(tgChatId, content.slides, botToken)
        } catch (e: any) {
          tgDelivery = { sent: 0, skipped: content.slides.length, error: e?.message || 'tg_send_failed' }
        }
      }

      return NextResponse.json({ type, content, cached: false, tgDelivery })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Ошибка генерации карусели с картинками' }, { status: 500 })
    }
  }

  // ── standard text-only generation ────────────────────────────────────────
  const prompt = buildPrompt(type, text)

  return streamAnthropic(
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5-20251001',
      system: '',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    },
    undefined,
    async (fullText) => {
      try {
        const content = parseContent(type, fullText)
        if (id) mergeTranscriptGenerations(id, auth.user_id, type, content)
        return { content }
      } catch (e: any) {
        console.warn(`[/api/transcribe/generate ${type}] parse failed:`, e?.message)
        return { parseError: e?.message || 'parse error' }
      }
    },
  )
}
