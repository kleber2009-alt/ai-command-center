// Server-side helpers for talking to the Telegram Bot API.
// Used to deliver generated artifacts (e.g. carousel images) into the
// user's private chat with the bot — the Mini App can only display
// content in-browser, it can't push messages.

const TG_API = 'https://api.telegram.org'

export type CarouselImageSlide = {
  n: number
  title: string
  body: string
  imageUrl: string | null
}

export type SendCarouselResult = {
  sent: number
  skipped: number
  error?: string
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const truncate = (s: string, max: number) =>
  s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'

// Telegram caption limit is 1024 chars. We reserve ~30 for the wrapper tags
// and slide-number prefix.
const CAPTION_MAX = 990

function buildCaption(slide: CarouselImageSlide): string {
  const title = escapeHtml(slide.title)
  const body = escapeHtml(slide.body)
  const raw = `<b>#${slide.n} ${title}</b>\n\n${body}`
  return truncate(raw, CAPTION_MAX)
}

// Sends the carousel as one or more Telegram media groups (max 10 photos
// per group, per the Bot API). Caption is attached to each photo so the
// slide title/body is preserved even if the user later reorders.
// Slides without imageUrl are skipped — those failed at the kie.ai stage.
//
// Returns { sent, skipped } counts. `error` is set only when the very
// first sendMediaGroup call fails (network / 4xx) — partial failures
// inside a multi-batch send still return successfully and just count
// against `skipped`.
export async function sendCarouselMediaGroup(
  chatId: number,
  slides: CarouselImageSlide[],
  botToken: string,
): Promise<SendCarouselResult> {
  const usable = slides.filter(s => s.imageUrl)
  const skippedNoImage = slides.length - usable.length

  if (usable.length === 0) {
    return { sent: 0, skipped: skippedNoImage, error: 'no_images_to_send' }
  }

  let sent = 0
  let skippedSend = 0
  let firstError: string | undefined

  for (let i = 0; i < usable.length; i += 10) {
    const chunk = usable.slice(i, i + 10)
    const media = chunk.map(s => ({
      type: 'photo' as const,
      media: s.imageUrl!,
      caption: buildCaption(s),
      parse_mode: 'HTML' as const,
    }))

    try {
      const res = await fetch(`${TG_API}/bot${botToken}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, media }),
      })
      if (res.ok) {
        sent += chunk.length
      } else {
        skippedSend += chunk.length
        const text = await res.text().catch(() => '')
        if (!firstError) firstError = `tg_${res.status}: ${text.slice(0, 200)}`
      }
    } catch (e: any) {
      skippedSend += chunk.length
      if (!firstError) firstError = e?.message || 'fetch_failed'
    }
  }

  return {
    sent,
    skipped: skippedNoImage + skippedSend,
    error: sent === 0 ? firstError : undefined,
  }
}
