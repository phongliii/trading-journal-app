// Supabase adapter for stores/balance.js. Cloud-only, same reasoning as
// journalAdapter.js's `data` and rawCsvArchiveAdapter.js: this feeds P&L
// math directly (currentBalance), so it follows trades' model — cloud is
// the only copy, reload on sign-in — rather than the local-cache pattern
// readList/holidays use. supabase.sql's `balance` table is one row per
// PORTFOLIO (user_id, account_id) now, matching the store's per-portfolio
// in-memory shape — every call here takes the active account's id rather
// than assuming "the user's one implicit account".

import { getSupabase, getUserId } from './supabaseClient'

const EMPTY = () => ({ rawStarting: null, earliestBalanceDate: null, fundTransactions: [] })

export const balanceAdapter = {
  async load(accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { data, error } = await sb
      .from('balance')
      .select('raw_starting, earliest_balance_date, fund_transactions')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) throw error
    if (!data) return EMPTY()
    return {
      rawStarting: data.raw_starting,
      earliestBalanceDate: data.earliest_balance_date,
      fundTransactions: data.fund_transactions || [],
    }
  },

  // Upserts the whole row at once — matches the store's own "rewrite the
  // state, don't diff it" approach (setStartingBalance/mergeTransactions/
  // clearFundTransactions/clearBalance all just replace `data` wholesale).
  async save(accountId, { rawStarting, earliestBalanceDate, fundTransactions }) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { error } = await sb
      .from('balance')
      .upsert({
        user_id: userId,
        account_id: accountId,
        raw_starting: rawStarting,
        earliest_balance_date: earliestBalanceDate,
        fund_transactions: fundTransactions,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,account_id' })
    if (error) throw error
  },
}
