// A cheap "has this changed?" fingerprint of one portfolio's rows in a cloud
// table: how many there are and when the newest one changed. Adding,
// editing or deleting anything (on any device) changes it, so lib/cloudSync.js
// can ask for it on every page change and only download the full data when
// it differs — one tiny request instead of, say, every trade.
import { getSupabase, getUserId } from './supabaseClient'

export async function tableStamp(table, accountId) {
  const sb = getSupabase()
  const userId = await getUserId(sb)
  const { data, count, error } = await sb
    .from(table)
    .select('updated_at', { count: 'exact' })
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return `${accountId}|${count ?? 0}|${data?.[0]?.updated_at || ''}`
}
