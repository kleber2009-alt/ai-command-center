import { NextRequest, NextResponse } from 'next/server'
import { deleteDocument, getDocument } from '@/lib/me-db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Невалидный id' }, { status: 400 })
  const doc = getDocument(id)
  if (!doc) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ document: doc })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Невалидный id' }, { status: 400 })
  const ok = deleteDocument(id)
  if (!ok) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
