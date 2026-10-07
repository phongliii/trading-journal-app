// Supabase adapter for stores/cashEvents.js. Cloud-only, same reasoning as
// balanceAdapter.js — this feeds drawdown/peak-equity math directly, so it
// follows trades' model rather than the local-cache pattern. supabase.sql's
// `cash_events` table is one row per PORTFOLIO (user_id, account_id) now,
// holding that portfolio's whole events array, matching how the store
// already treats it (one JSONB blob, rewritten wholesale, not queried
// per-event) — every call here takes the active account's id.

import { getSupabase, getUserId } from './supabaseClient'

export const cashEventsAdapter = {
  async load(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { data, error } = await sb
      .from('cash_events')
      .select('events')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) throw error
    return data?.events || []
  },

  async save(accountId, events) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('cash_events')
      .upsert({ user_id: userId, account_id: accountId, events, updated_at: new Date().toISOString() }, { onConflict: 'user_id,account_id' })
    if (error) throw error
  },
}
