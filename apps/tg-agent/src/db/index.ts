import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

export type Db = SupabaseClient | null;

// Returns a Supabase service-role client, or null when SUPABASE_URL /
// SUPABASE_SERVICE_KEY are unset. Mirrors the graceful-degradation
// pattern used by apps/transcribe — the bot continues to run, it just
// doesn't persist messages, leads, or honor per-chat auto_reply.
export function createDb(config: Config, logger: Logger): Db {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    logger.warn('Supabase not configured — running in stateless mode', {
      hasUrl: Boolean(config.supabaseUrl),
      hasKey: Boolean(config.supabaseServiceKey),
    });
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
