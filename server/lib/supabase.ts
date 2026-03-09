import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://fkviyesjakytcjpwmpvg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_iGDjvy9SDOaI04f8bdgohA_B0mPnWH3';

// Lazy singleton — only created on first use at request time, not at build time
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  _client = createClient(supabaseUrl, supabaseKey);
  return _client;
}
