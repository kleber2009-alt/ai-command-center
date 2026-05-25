import { db, users } from '@vp/db';
import { PLANS } from '@vp/shared';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';

/**
 * Clerk user webhook (§10): verifies the Svix signature, then mirrors the user
 * into our DB with the free-plan credit grant. Idempotent per user id.
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook secret not configured', { status: 500 });

  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let evt: { type: string; data: { id: string; email_addresses?: { email_address: string }[] } };
  try {
    evt = new Webhook(secret).verify(payload, headers) as typeof evt;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const email = evt.data.email_addresses?.[0]?.email_address ?? '';
    await db
      .insert(users)
      .values({ id: evt.data.id, email, creditsBalance: PLANS.free.credits })
      .onConflictDoUpdate({ target: users.id, set: { email } });
  } else if (evt.type === 'user.deleted') {
    await db.delete(users).where(eq(users.id, evt.data.id));
  }

  return new Response('ok', { status: 200 });
}
