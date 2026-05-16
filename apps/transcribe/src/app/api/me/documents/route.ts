import { NextRequest, NextResponse } from 'next/server'
import { chunkText } from '@/lib/chunking'
import { embedBatch } from '@/lib/embeddings'
import { getDb } from '@/lib/db'

export const maxDuration = 120

async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.json')) {
    return await file.text()
  }
  if (name.endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse')
    const buf = new Uint8Array(await file.arrayBuffer())
    const parser = new PDFParse({ data: buf })
    try {
      const out = await parser.getText()
      const pageTexts = Array.isArray((out as any)?.pages)
        ? (out as any).pages.map((p: any) => String(p?.text || '')).join('\n\n')
        : ''
      return String((out as any)?.text || pageTexts || '')
    } finally {
      await parser.destroy().catch(() => {})
    }
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const buf = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.extractRawText({ buffer: buf })
    return String(result?.value || '')
  }
  if (file.type.startsWith('text/')) {
    return await file.text()
  }
  throw new Error(`Не поддерживаю файл: ${file.name}. Используй .txt, .md, .csv, .json, .pdf или .docx.`)
}

function toVectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']'
}

export async function GET() {
  const sql = getDb()
  if (!sql) return NextResponse.json({ items: [], configured: false })
  try {
    const rows = await sql`
      select id, created_at, title, source_type, source_meta, char_count, chunk_count
      from me_documents
      order by created_at desc
      limit 200
    `
    return NextResponse.json({ items: rows, configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json(
      { error: 'Postgres не настроен. Установите DATABASE_URL и накатите db/init.sql.' },
      { status: 500 },
    )
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY не настроен' }, { status: 500 })
  }

  const contentType = req.headers.get('content-type') || ''
  let title = ''
  let text = ''
  let source_type: 'paste' | 'file' = 'paste'
  let source_meta: Record<string, any> = {}

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      title = String(form.get('title') || '').trim()
      if (!file) return NextResponse.json({ error: 'Файл не получен' }, { status: 400 })
      text = await extractFileText(file)
      source_type = 'file'
      source_meta = { filename: file.name, size: file.size, mime: file.type }
      if (!title) title = file.name.replace(/\.[^.]+$/, '')
    } else {
      const body = await req.json()
      title = String(body.title ?? '').trim()
      text = String(body.text ?? '')
      source_type = 'paste'
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Не удалось прочитать ввод' }, { status: 400 })
  }

  text = text.trim()
  if (!text) return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
  if (!title) title = text.slice(0, 60).replace(/\s+/g, ' ').trim() + '…'

  const chunks = chunkText(text)
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'Не удалось разбить текст на куски' }, { status: 400 })
  }

  let embeddings: number[][]
  try {
    embeddings = await embedBatch(chunks)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка эмбеддинга' }, { status: 500 })
  }

  try {
    const result = await sql.begin(async (tx) => {
      const docRows = await tx`
        insert into me_documents (title, source_type, source_meta, original_text, char_count, chunk_count)
        values (
          ${title},
          ${source_type},
          ${tx.json(source_meta)},
          ${text},
          ${text.length},
          ${chunks.length}
        )
        returning id, created_at, title, source_type, source_meta, char_count, chunk_count
      `
      const doc = docRows[0]

      const rows = chunks.map((c, i) => ({
        document_id: doc.id,
        chunk_index: i,
        content: c,
        embedding: toVectorLiteral(embeddings[i]),
      }))
      await tx`insert into me_chunks ${tx(rows, 'document_id', 'chunk_index', 'content', 'embedding')}`
      return doc
    })
    return NextResponse.json({ document: result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сохранения' }, { status: 500 })
  }
}
