import { NextRequest, NextResponse } from 'next/server'
import { guardWithUser } from '@/lib/api-guard'

export async function GET(req: NextRequest) {
  const guard = await guardWithUser(req, { rateLimit: null })
  if (!guard.ok) return guard.response

  return NextResponse.json({
    tier: guard.user.subscription_tier,
    quota: guard.quota,
  })
}
