import { NextRequest, NextResponse } from 'next/server'
import { chunkText } from '@/lib/chunking'
import { embedBatch } from '@/lib/embeddings'
import { createDocumentWithEmbeddings } from '@/lib/me-db'
import { getTranscript } from '@/lib/transcripts-db'
import { authenticate } from '@/lib/telegram-auth'

export const maxDuration = 300

type Body = { ids?: string[] }

export async function POST(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY не настроен' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Нужны поля ids: string[]' }, { status: 400 })
  }
  if (ids.length > 50) {
    return NextResponse.json({ error: 'За один раз — не больше 50 транскриптов' }, { status: 400 })
  }

  const imported: Array<{ id: number; transcript_id: string; title: string; chunk_count: number }> = []
  const errors: Array<{ transcript_id: string; error: string }> = []

  for (const transcriptId of ids) {
    try {
      const row = getTranscript(transcriptId, auth.user_id)
      if (!row) {
        errors.push({ transcript_id: transcriptId, error: 'Транскрипт не найден' })
        continue
      }

      const text = row.paragraphs && row.paragraphs.length > 0
        ? row.paragraphs.map((p) => p.text).join('\n\n')
        : row.transcript

      if (!text || !text.trim()) {
        errors.push({ transcript_id: transcriptId, error: 'Пустой транскрипт' })
        continue
      }

      const chunks = chunkText(text)
      if (chunks.length === 0) {
        errors.push({ transcript_id: transcriptId, error: 'Не удалось разбить на куски' })
        continue
      }

      const embeddings = await embedBatch(chunks)

      const title =
        row.title ||
        text.slice(0, 60).replace(/\s+/g, ' ').trim() + (text.length > 60 ? '…' : '')

      const doc = createDocumentWithEmbeddings({
        user_id: auth.user_id,
        title,
        source_type: 'transcript',
        source_meta: {
          transcript_id: row.id,
          url: row.url,
          source: row.source,
          language: row.language,
          duration: row.duration,
        },
        original_text: text,
        chunks,
        embeddings,
      })

      imported.push({
        id: doc.id,
        transcript_id: transcriptId,
        title: doc.title,
        chunk_count: doc.chunk_count,
      })
    } catch (e: any) {
      errors.push({ transcript_id: transcriptId, error: e?.message || 'Ошибка обработки' })
    }
  }

  return NextResponse.json({
    imported,
    errors,
    summary: {
      total: ids.length,
      imported: imported.length,
      failed: errors.length,
    },
  })
}
