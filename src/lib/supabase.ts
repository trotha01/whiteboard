import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The board every visitor shares. A fixed id keeps the app single-board while
 * leaving room for multiple rows later; override it per deploy if you want an
 * isolated board (e.g. a staging site pointed at the same project).
 */
export const BOARD_ID =
  import.meta.env.VITE_BOARD_ID ?? '9b60c1aa-1550-4754-81ef-0812db0cb5ca';

/**
 * `null` when the environment variables are absent, which is a supported state:
 * the board still works, it just runs in memory. Persistence checks this rather
 * than throwing so `npm run dev` needs no setup.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? // The board is anonymous, so there is no session worth writing to storage.
      createClient(url, anonKey, { auth: { persistSession: false } })
    : null;

export const isSupabaseConfigured = supabase !== null;
