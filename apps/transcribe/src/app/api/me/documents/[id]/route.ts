import { NextRequest, NextResponse } from 'next/server'
import { chunkText } from '@/lib/chunking'
import { embedBatch } from '@/lib/embeddings'
import {
  deleteDocument,
  getDocument,
  replaceDocumentText,
  setDocumentPinned,
  updateDocumentTitle,
} from '@/lib/me-db'
import { authenticate } from '@/lib/telegram-auth'

export const maxDuration = 120

// me_documents.id is a UUID; treat as string throughout. A basic
// shape check keeps obviously-bad inputs out of the SQL layer.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const id = params.id
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Невалидный id' }, { status: 400 })
  const doc = await getDocument(id, auth.user_id)
  if (!doc) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ document: doc })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const id = params.id
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Невалидный id' }, { status: 400 })

  const existing = await getDocument(id, auth.user_id)
  if (!existing) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    text?: string
    pinned?: boolean
  }
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const text = typeof body.text === 'string' ? body.text : undefined
  const pinned = typeof body.pinned === 'boolean' ? body.pinned : undefined

  // Pin-only update: cheap, no re-embed, no title change.
  if (pinned !== undefined && title === undefined && text === undefined) {
    const updated = await setDocumentPinned(id, auth.user_id, pinned)
    if (!updated) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 })
    return NextResponse.json({ document: updated, reembedded: false })
  }

  // Title-only update: cheap, no re-embed. (existing has no
  // original_text field on MeDocumentRow — we treat text as "changed
  // only if explicitly different and non-empty".)
  const textChanged = text !== undefined && text.trim().length > 0
  if (!textChanged) {
    if (title === undefined || title === existing.title) {
      if (pinned !== undefined && pinned !== existing.pinned) {
        const updated = await setDocumentPinned(id, auth.user_id, pinned)
        if (!updated) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 })
        return NextResponse.json({ document: updated, reembedded: false })
      }
      return NextResponse.json({ document: existing, reembedded: false })
    }
    const updated = await updateDocumentTitle(id, auth.user_id, title)
    if (!updated) return NextResponse.json({ error: 'Не удалось обновить' }, { status: 500 })
    if (pinned !== undefined && pinned !== existing.pinned) {
      await setDocumentPinned(id, auth.user_id, pinned)
    }
    const final = await getDocument(id, auth.user_id)
    return NextResponse.json({ document: final, reembedded: false })
  }

  // Text changed — need to re-chunk + re-embed.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY не настроен — нельзя переэмбеддить документ' },
      { status: 500 },
    )
  }

  const cleaned = (text ?? '').trim()
  if (!cleaned) return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })

  const chunks = chunkText(cleaned)
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'Не удалось разбить текст на куски' }, { status: 400 })
  }

  let embeddings: number[][]
  try {
    embeddings = await embedBatch(chunks)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка эмбеддинга' }, { status: 500 })
  }

  const updated = await replaceDocumentText({
    id,
    user_id: auth.user_id,
    title,
    text: cleaned,
    chunks,
    embeddings,
  })
  if (!updated) return NextResponse.json({ error: 'Не удалось обновить документ' }, { status: 500 })
  return NextResponse.json({ document: updated, reembedded: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  const id = params.id
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Невалидный id' }, { status: 400 })
  const ok = await deleteDocument(id, auth.user_id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
