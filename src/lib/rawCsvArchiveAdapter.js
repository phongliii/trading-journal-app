// Supabase adapter for stores/rawCsvArchive.js. Cloud-only, same reasoning
// as journalAdapter.js's `data`: this is the exact original broker CSV rows
// a "Backup Now" re-export depends on being byte-accurate, so it follows
// trades' model (cloud is the only copy, reload on sign-in) rather than
// the local-cache-plus-reconcile pattern readList/holidays use — there's no
// "briefly stale is fine" case for the thing a backup restore reads from.
//
// supabase.sql's raw_csv_archive table is one row per (user_id, account_id,
// kind) now — exactly the shape the store already keeps in memory (bucket
// per kind, rewritten wholesale on every import rather than diffed
// row-by-row), scoped to whichever portfolio's CSVs got imported. No
// pagination needed: there are only ever 3 rows per portfolio
// (position/cash/balance), not one row per CSV row.

import { getSupabase, getUserId } from './supabaseClient'

const EMPTY_BUCKET = () => ({ headers: [], rows: [] })

export const rawCsvArchiveAdapter = {
  // Called once on sign-in/account-switch (App.vue). Returns the full
  // {position, cash, balance} shape the store keeps in memory, with any
  // kind this portfolio has no row for yet defaulting to an empty bucket.
  async load(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { data, error } = await sb
      .from('raw_csv_archive')
      .select('kind, headers, rows')
      .eq('user_id', userId)
      .eq('account_id', accountId)
    if (error) throw error

    const result = { position: EMPTY_BUCKET(), cash: EMPTY_BUCKET(), balance: EMPTY_BUCKET() }
    for (const row of data || []) {
      result[row.kind] = { headers: row.headers || [], rows: row.rows || [] }
    }
    return result
  },

  // Upserts the WHOLE bucket for one kind — matches the store's own
  // "rewrite the array, don't diff it" approach (see its header comment),
  // so this just mirrors whatever mergeRows() already computed locally.
  async saveBucket(accountId, kind, headers, rows) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('raw_csv_archive')
      .upsert({ user_id: userId, account_id: accountId, kind, headers, rows, updated_at: new Date().toISOString() }, { onConflict: 'user_id,account_id,kind' })
    if (error) throw error
  },

  // Deletes this portfolio's backed-up CSV rows (all three kinds).
  async clearAll(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb.from('raw_csv_archive').delete()
      .eq('user_id', userId).eq('account_id', accountId)
    if (error) throw error
  },
}
