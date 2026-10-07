// Supabase adapter for the journal store (stores/journal.js) — `data` (one
// entry per daily/weekly/monthly key) and `readList` (which keys are read).
//
// Journal entries are now cloud-only: no localStorage fallback, no
// opportunistic push-and-reconcile. This used to mirror lib/cloudSettings.js
// (localStorage as the source of truth, Supabase as a best-effort mirror),
// which is how a note written on one device could still show up empty on
// another — the push to Supabase failed silently (console.error only, by
// design for a "cloud is just a mirror" model) and nothing ever surfaced
// that to the person. Once Supabase IS the only copy, a failed write can't
// be swallowed like that any more — every function here throws on error,
// and journal.js's mutators catch that and toast it, since there's no local
// copy left to fall back on if the cloud write didn't happen.
//
// getUserId (shared, see supabaseClient.js) throws instead of returning
// null for the same reason explained there: journal.js has nothing to
// show without the cloud, so callers here need to know a call failed, not
// have it silently do nothing.
//
// Every entry now also belongs to a PORTFOLIO (account_id) — every
// function here takes the active account's id, since the same key
// ('2026-09-23', say) is a different entry in a different portfolio.

import { getSupabase, getUserId } from './supabaseClient'

// Same 1000-row PostgREST cap as supabaseAdapter.js's selectAllRows — a
// year-plus of daily entries can pass that, so this pages through too.
const PAGE_SIZE = 1000
async function selectAllRows(sb, userId, accountId) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('journal_entries')
      .select('key, content, read')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export const journalAdapter = {
  // Called once on sign-in/account-switch (App.vue, gated the same way
  // trades' load() is — see App.vue's loadCloudData). Returns the full
  // `data` map and `readList` array journal.js needs to populate its
  // in-memory state for the active portfolio; there's nothing local to
  // merge this against any more.
  async load(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const rows = await selectAllRows(sb, userId, accountId)
    const data = {}
    const readList = []
    for (const row of rows) {
      data[row.key] = row.content || {}
      if (row.read) readList.push(row.key)
    }
    return { data, readList }
  },

  // Upserts one entry's content (sections/checklist/image). Omitting `read`
  // from the payload means the generated UPDATE only SETs `content` on an
  // existing row, leaving its read flag untouched — same "only send what
  // changed" reasoning as supabaseAdapter.js's pushUpdate. On a brand-new
  // row the missing `read` just picks up the column's default (false).
  async saveEntry(accountId, key, content) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('journal_entries')
      .upsert({ user_id: userId, account_id: accountId, key, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id,account_id,key' })
    if (error) throw error
  },

  async setRead(accountId, key, read) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('journal_entries')
      .upsert({ user_id: userId, account_id: accountId, key, read, updated_at: new Date().toISOString() }, { onConflict: 'user_id,account_id,key' })
    if (error) throw error
  },

  // Batch form of setRead — used to prune readList entries whose underlying
  // journal entry disappeared (journal.js's dailyEntries/weeklyEntries
  // watchers) without a round trip per key.
  async setReadMany(accountId, keys, read) {
    if (!keys.length) return
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('journal_entries')
      .update({ read, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .in('key', keys)
    if (error) throw error
  },

  async deleteEntry(accountId, key) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb.from('journal_entries').delete()
      .eq('user_id', userId).eq('account_id', accountId).eq('key', key)
    if (error) throw error
  },

  // Batch form of deleteEntry — clearWeeklyData can drop many weekly keys
  // at once.
  async deleteEntries(accountId, keys) {
    if (!keys.length) return
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb.from('journal_entries').delete()
      .eq('user_id', userId).eq('account_id', accountId).in('key', keys)
    if (error) throw error
  },

  async clearAll(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb.from('journal_entries').delete()
      .eq('user_id', userId).eq('account_id', accountId)
    if (error) throw error
  },

  // clearReadState() resets every entry's read flag without touching
  // content — an update across every row in this portfolio, not a delete.
  async clearReadState(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('journal_entries')
      .update({ read: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('account_id', accountId)
    if (error) throw error
  },
}
