import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError } from '@/lib/api'

// DELETE — remove one knowledge-base item.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { error } = await supabase.from('content_library').delete().eq('id', params.id)
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true })
}
