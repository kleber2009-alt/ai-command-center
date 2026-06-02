import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with the service role key.
 * Used by API routes and the admin panel. NEVER ship this key to the client.
 */
let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (_service) return _service;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required');
  }
  _service = createClient(url, key, { auth: { persistSession: false } });
  return _service;
}
