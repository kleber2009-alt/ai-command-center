// HeyGen listing failure → JSON response with a Russian message for the UI.

import { NextResponse } from 'next/server';
import { HeygenError } from '@/lib/heygen';

export function heygenListError(e: unknown) {
  if (e instanceof HeygenError && e.code === 'MISSING_KEY') {
    return NextResponse.json(
      { error: 'provider_not_configured', message: 'HeyGen не подключён: администратору нужно добавить ключ HeyGen.' },
      { status: 503 },
    );
  }
  console.error('[api/heygen] list failed', e);
  const auth = e instanceof HeygenError && /HTTP_40[13]/.test(e.code);
  return NextResponse.json(
    {
      error: 'heygen_list_failed',
      message: auth ? 'HeyGen отклонил ключ — проверьте ключ HeyGen в настройках.' : 'HeyGen не ответил — попробуйте обновить через минуту.',
    },
    { status: 502 },
  );
}
