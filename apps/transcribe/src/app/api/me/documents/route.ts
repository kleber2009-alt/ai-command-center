import { NextRequest, NextResponse } from 'next/server'
import { guardRequest } from '@/lib/api-guard'
import { chunkText } from '@/lib/chunking'
import { embedBatch } from '@/lib/embeddings'
import { getServerSupabase } from '@/lib/me-db'

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

export async function GET(req: NextRequest) {
  const guard = guardRequest(req, {
    rateLimit: { key: 'docs-list', max: 60, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) return NextResponse.json({ items: [], configured: false })
  const { data, error } = await supabase
    .from('me_documents')
    .select('id, created_at, title, source_type, source_meta, char_count, chunk_count')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [], configured: true })
}

export async function POST(req: NextRequest) {
  // PDF parsing + OpenAI embeddings — tighter limit on creation.
  const guard = guardRequest(req, {
    rateLimit: { key: 'docs-create', max: 10, windowMs: 60_000 },
    ownerOnly: true,
  })
  if (!guard.ok) return guard.response

  const supabase = getServerSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase не настроен. Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY + миграция 003_me.sql.' },
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

  const { data: doc, error: docErr } = await supabase
    .from('me_documents')
    .insert({
      title,
      source_type,
      source_meta,
      original_text: text,
      char_count: text.length,
      chunk_count: chunks.length,
    })
    .select('id, created_at, title, source_type, source_meta, char_count, chunk_count')
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: docErr?.message || 'Ошибка вставки документа' }, { status: 500 })
  }

  const rows = chunks.map((c, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content: c,
    embedding: embeddings[i] as any,
  }))

  const { error: chunkErr } = await supabase.from('me_chunks').insert(rows)
  if (chunkErr) {
    await supabase.from('me_documents').delete().eq('id', doc.id)
    return NextResponse.json({ error: `Ошибка вставки чанков: ${chunkErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ document: doc })
}
