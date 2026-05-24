'use client'

import { createBrowserClient } from '@supabase/ssr'
import { isDemo } from '@/lib/demo/store'
import { createDemoClient } from '@/lib/demo/supabase'

export function createClient() {
  if (isDemo()) return createDemoClient() as ReturnType<typeof createBrowserClient>
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
