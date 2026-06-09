import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';
import { hashPassword } from '@/lib/auth';
import { guardRate } from '@/lib/ratelimit';
import { sendMail } from '@/lib/mail';
import { log } from '@/lib/logger';
import { z } from 'zod';

/**
 * POST /api/auth/forgot
 * Starts a password reset (spec §3.2 auth completeness). Emails a short-lived
 * 6-digit code; only its hash is stored. Always returns ok to avoid leaking
 * whether an account exists.
 */
const Body = z.object({ email: z.string().email() });
const CODE_TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const limited = guardRate(req, 'forgot', 5, 60_000);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid email', 422);

  const db = serviceClient();
  const { data: user } = await db
    .from('cdd_users')
    .select('id, password_hash')
    .eq('email', parsed.data.email)
    .is('deleted_at', null)
    .maybeSingle();

  // Only accounts with a password can reset; silently no-op otherwise.
  if (user?.password_hash) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.from('cdd_password_resets').insert({
      user_id: user.id,
      code_hash: hashPassword(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    try {
      await sendMail(
        parsed.data.email,
        'Club Der Denker — Passwort zurücksetzen',
        `Dein Code lautet: ${code}\nEr ist 15 Minuten gültig.`,
      );
    } catch (e: any) {
      log.error('forgot: mail failed', { err: e.message });
      // Do not reveal the failure to the caller.
    }
  }

  return ok({ sent: true });
}
