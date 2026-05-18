import { NextRequest, NextResponse } from 'next/server'
import { listMaterials } from '@/lib/transcripts-db'
import { authenticate } from '@/lib/telegram-auth'

export async function GET(req: NextRequest) {
  const auth = authenticate(req)
  if ('error' in auth) return auth.error
  try {
    const items = listMaterials(auth.user_id, 100)
    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Ошибка получения материалов' },
      { status: 500 },
    )
  }
}
