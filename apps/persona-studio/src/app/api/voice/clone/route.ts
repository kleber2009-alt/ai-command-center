// POST /api/voice/clone — нативное клонирование голоса внутри persona-studio
// (один домен / один проект). Принимает аудио-образец(ы) multipart, клонирует
// через IVC на сервере и возвращает id голоса для персоны. White-label: сырые
// ошибки провайдера наружу не выносим.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { cloneVoice, ElevenlabsError } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB на образец
const ALLOWED = /^audio\/|^video\/(mp4|webm|quicktime)$/i;

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_form' }, { status: 400 });
  }

  const files = form.getAll('sample').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no_sample', message: 'Прикрепите аудио-образец голоса.' }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: 'too_large', message: 'Образец слишком большой (макс. 25 МБ).' }, { status: 400 });
    }
    const mime = f.type || 'audio/mpeg';
    if (!ALLOWED.test(mime)) {
      return NextResponse.json({ error: 'bad_type', message: 'Поддерживаются аудио-файлы (mp3, m4a, wav, ogg).' }, { status: 400 });
    }
  }

  const rawName = (form.get('name') as string | null)?.trim();
  const name = (rawName && rawName.slice(0, 60)) || `Голос ${ctx.user.id.slice(0, 6)}`;

  try {
    const clone = await cloneVoice({
      name,
      files: files.map((f) => ({ blob: f, filename: f.name || 'sample.mp3' })),
      description: 'persona-studio voice',
    });
    return NextResponse.json({ ok: true, voiceId: clone.voiceId, name: clone.name });
  } catch (e) {
    // White-label + диагностика в лог.
    console.error('[voice/clone] failed:', e instanceof ElevenlabsError ? `${e.code}: ${e.message}` : e);
    return NextResponse.json(
      { error: 'clone_failed', message: 'Не удалось клонировать голос. Попробуйте другой образец.' },
      { status: 502 },
    );
  }
}
