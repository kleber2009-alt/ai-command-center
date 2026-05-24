import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const GENERATION_ERROR = 'Content generation failed. Please try again.'

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// Resolves the authenticated user for a route handler, or returns a 401.
export async function requireUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: jsonError('Unauthorized', 401) as NextResponse }
  }
  return { user, supabase }
}
