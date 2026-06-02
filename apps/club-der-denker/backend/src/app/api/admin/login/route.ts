import { NextRequest } from 'next/server';
import { authenticateAdmin, setSessionCookie } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { z } from 'zod';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

/** POST /api/admin/login — sets the admin session cookie. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid credentials', 422);

  const adminId = await authenticateAdmin(parsed.data.email, parsed.data.password);
  if (!adminId) return fail('invalid email or password', 401);

  setSessionCookie(adminId);
  return ok({ adminId });
}
