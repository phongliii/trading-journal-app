// Supabase adapter for stores/accounts.js — the list of portfolios
// (separate broker/prop accounts, switched one at a time) a user has
// created. See the "Phase 3: multi-portfolio" block in supabase.sql for
// the `accounts` table itself and how every other table's rows now carry
// an account_id pointing into it.
import { getSupabase, getUserId } from './supabaseClient'

function fromRow(row) {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at }
}

export const accountsAdapter = {
  async list() {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { data, error } = await sb
      .from('accounts')
      .select('id, name, sort_order, created_at')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(fromRow)
  },

  async create(name) {
    const sb = getSupabase()
    const userId = await getUserId(sb)
    const { data, error } = await sb
      .from('accounts')
      .insert({ user_id: userId, name })
      .select('id, name, sort_order, created_at')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async rename(id, name) {
    const sb = getSupabase()
    const { error } = await sb.from('accounts').update({ name }).eq('id', id)
    if (error) throw error
  },

  // Cascades to that portfolio's trades/journal entries/balance/cash
  // events/raw CSV archive via each table's account_id foreign key (see
  // supabase.sql) — nothing further to clean up from here.
  async remove(id) {
    const sb = getSupabase()
    const { error } = await sb.from('accounts').delete().eq('id', id)
    if (error) throw error
  },
}
