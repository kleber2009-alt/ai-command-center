import { clearSessionCookie } from '@/lib/admin-auth';
import { ok } from '@/lib/http';

/** POST /api/admin/logout — clears the admin session cookie. */
export async function POST() {
  clearSessionCookie();
  return ok({ loggedOut: true });
}
