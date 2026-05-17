import { NextRequest, NextResponse } from 'next/server'
import { listMaterials } from '@/lib/transcripts-db'
import { requireTelegramAuth } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const gate = requireTelegramAuth(req)
  if (gate) return gate
  try {
    const items = listMaterials(100)
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Ошибка получения материалов' },
      { status: 500 },
    )
  }
}
