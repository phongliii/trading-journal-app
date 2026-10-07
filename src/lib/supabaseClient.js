/**
 * Shared Supabase client — the ONE client instance for the whole app.
 *
 * Auth (stores/auth.js) and data access (lib/supabaseAdapter.js) both need
 * a Supabase client, and it matters that they share this exact instance:
 * supabase-js warns ("Multiple GoTrueClient instances detected") and can
 * misbehave if more than one client with auth enabled runs against the same
 * localStorage session on one page — each would try to manage the same
 * session independently. Lazily created (not at module load) so importing
 * this file doesn't throw in a dev session that hasn't set the env vars yet.
 */
import { createClient } from '@supabase/supabase-js'

let client = null

export function getSupabase() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars not set (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
  client = createClient(url, key)
  return client
}

// Every cloud-only adapter (balanceAdapter, cashEventsAdapter,
// rawCsvArchiveAdapter, journalAdapter, supabaseAdapter) needs the signed-in
// user's id before it can scope a query to `user_id = ...`, and all five
// used to carry their own byte-identical copy of this function. Throws
// rather than returning null — unlike cloudSettings.js's currentUserId,
// which treats "not signed in" as a normal no-op (those settings have a
// local copy either way) — because every one of this function's callers
// has nothing to fall back on without the cloud, so they need to know a
// call failed, not have it silently do nothing.
export async function getUserId(sb) {
  const { data, error } = await sb.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not signed in')
  return data.user.id
}
