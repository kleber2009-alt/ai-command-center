import { NextRequest, NextResponse } from 'next/server'
import { chunkText } from '@/lib/chunking'
import { embedBatch } from '@/lib/embeddings'
import { isConfigured } from '@/lib/me-db'
import { withClient, toVectorLiteral } from '@/lib/db'

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

type DocRow = {
  id: string
  created_at: string
  title: string
  source_type: 'paste' | 'file' | 'transcript'
  source_meta: Record<string, any>
  char_count: number
  chunk_count: number
}

export async function GET() {
  if (!isConfigured()) return NextResponse.json({ items: [], configured: false })
  try {
    const rows = await withClient(async (c) => {
      const r = await c.query<DocRow>(
        `select id, created_at, title, source_type, source_meta, char_count, chunk_count
           from me_documents
           order by created_at desc
           limit 200`,
      )
      return r.rows
    })
    return NextResponse.json({ items: rows ?? [], configured: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка чтения документов' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'База данных не настроена. Заполни DATABASE_URL и применит схему db/init/01_schema.sql.' },
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

  // Транзакция: либо документ + все чанки вставляются, либо ничего.
  try {
    const doc = await withClient(async (client) => {
      await client.query('begin')
      try {
        const docRes = await client.query<DocRow>(
          `insert into me_documents (title, source_type, source_meta, original_text, char_count, chunk_count)
           values ($1, $2, $3::jsonb, $4, $5, $6)
           returning id, created_at, title, source_type, source_meta, char_count, chunk_count`,
          [title, source_type, JSON.stringify(source_meta), text, text.length, chunks.length],
        )
        const docRow = docRes.rows[0]

        // Bulk insert чанков. Pg-параметры строятся динамически на 4 поля × N строк.
        const values: any[] = []
        const placeholders: string[] = []
        chunks.forEach((c, i) => {
          const base = values.length
          values.push(docRow.id, i, c, toVectorLiteral(embeddings[i]))
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`)
        })

        await client.query(
          `insert into me_chunks (document_id, chunk_index, content, embedding)
           values ${placeholders.join(', ')}`,
          values,
        )

        await client.query('commit')
        return docRow
      } catch (e) {
        await client.query('rollback').catch(() => {})
        throw e
      }
    })
    return NextResponse.json({ document: doc })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сохранения документа' }, { status: 500 })
  }
}
