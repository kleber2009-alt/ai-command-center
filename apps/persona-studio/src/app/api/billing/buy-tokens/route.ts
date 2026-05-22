import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Legacy dev-stub. Реальный платёж — через CryptoBot:
// POST /api/billing/cryptobot/create   → создать инвойс
// POST /api/billing/cryptobot/webhook  → CryptoBot вебхук, зачисляет токены
export async function POST() {
  return NextResponse.json(
    { error: 'gone', use: '/api/billing/cryptobot/create' },
    { status: 410 },
  );
}
