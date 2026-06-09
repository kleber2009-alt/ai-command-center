import { serviceClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/http';

/**
 * GET /api/health — liveness + DB connectivity probe for monitoring / the
 * deploy health-check. Returns 200 when the DB is reachable, 503 otherwise.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = serviceClient();
    const { error } = await db.from('cdd_items').select('id', { count: 'exact', head: true });
    if (error) return fail(`db: ${error.message}`, 503);
    return ok({ status: 'healthy', time: new Date().toISOString() });
  } catch (e: any) {
    return fail(`unhealthy: ${e.message}`, 503);
  }
}
