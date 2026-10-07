/**
 * Supabase Storage Adapter
 *
 * Drop-in replacement for localAdapter (see lib/storage.js, `adapter =
 * localAdapter`) — NOT wired in yet. The schema (src/lib/supabase.sql) has
 * user_id/account_id + Row Level Security on every table; this file now
 * matches it: every insert carries the signed-in user's id, chartImage maps
 * to the schema's chart_image column, and insertTrades mirrors localAdapter's
 * broker_id upsert logic (see its own comment in storage.js) so the two
 * adapters behave identically from the trades store's point of view.
 *
 * NOT LIVE-TESTED — this sandbox has no network path to a real Supabase
 * project, so this is careful code review against the schema, not a
 * confirmed-working integration. Before flipping the switch in storage.js:
 * try it against a throwaway account first (import a CSV, edit a trade's
 * notes, delete one, re-import the same CSV to check the broker_id upsert
 * path) and watch the Supabase dashboard's table editor / logs while you do.
 *
 * Every trade now belongs to a PORTFOLIO (account_id) — loadTrades,
 * insertTrades and clearAll all take the active account's id and scope
 * their queries to it. deleteTrade/deleteTrades/updateTrade operate on a
 * specific row's own globally-unique `id` instead, so they don't need it:
 * there's no cross-portfolio ambiguity to resolve when you already know
 * exactly which row you mean.
 *
 * The Supabase schema (all tables, not just trades) lives in src/lib/supabase.sql
 */

import { getSupabase, getUserId } from './supabaseClient'

// JS trade (camelCase chartImage) → DB row (snake_case chart_image). Strips
// keys that aren't real columns:
// - chartImage: renamed to chart_image below, not a column itself.
// - net_pnl: csvParser.js puts this on every parsed trade alongside `pnl`
//   (same value, computed as a leftover from before the two were unified)
//   — localAdapter never minded the extra key since localStorage has no
//   schema, but Supabase's trades table only has `pnl`, so sending net_pnl
//   through to insert/update fails with "Could not find the 'net_pnl'
//   column of 'trades' in the schema cache".
function toDbRow(t) {
  const { chartImage, net_pnl, ...rest } = t
  return { ...rest, chart_image: chartImage !== undefined ? chartImage : rest.chart_image }
}

// DB row → JS trade (chart_image → chartImage).
function fromDbRow(row) {
  const { chart_image, ...rest } = row
  return { ...rest, chartImage: chart_image }
}

// PostgREST (what Supabase's JS client talks to) caps any query at a
// default max of 1000 rows UNLESS you page through it with `.range()` —
// a plain `.select('*')` on a table with more than 1000 rows silently
// returns only the first page, no error, nothing in `error`. With trades
// sorted by sold_at descending that showed up as "1161 trades were
// imported" (the insert really did write all of them) but the app only
// ever displaying the newest 1000. This helper pages through in batches
// of 1000 until a page comes back short, so the full table is returned.
const PAGE_SIZE = 1000
// `build` gets a fresh `sb.from(table).select(cols)` query to add its own
// filters to (eq/not/etc.) — pagination (.range()) is applied here, after
// `build` runs, so callers never need to think about paging themselves.
async function selectAllRows(sb, table, { cols = '*', orderCol, ascending, build } = {}) {
  let all = []
  let from = 0
  while (true) {
    let q = sb.from(table).select(cols)
    if (build) q = build(q)
    q = q.range(from, from + PAGE_SIZE - 1)
    if (orderCol) q = q.order(orderCol, { ascending })
    const { data, error } = await q
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export const supabaseAdapter = {
  async loadTrades(accountId) {
    const sb = getSupabase()
    const data = await selectAllRows(sb, 'trades', {
      orderCol: 'sold_at', ascending: false,
      build: (q) => q.eq('account_id', accountId),
    })
    return data.map(fromDbRow)
  },

  async saveTrades(_trades) {
    // Supabase is source-of-truth; individual ops (insertTrades,
    // updateTrade, deleteTrade(s)) handle persistence — there's no bulk
    // "overwrite everything" operation to mirror localAdapter's writeRaw()
    // here, and nothing currently calls saveTrades() on this adapter.
  },

  // Mirrors localAdapter's insertTrades exactly (see its comment in
  // storage.js for why broker_id upsert exists) — same merge decision
  // logic, just persisted as Supabase calls instead of one localStorage
  // write. ids are generated client-side (crypto.randomUUID()) rather than
  // left to the DB's default, so `records` can be returned immediately
  // without a round-trip to find out what ids were assigned, exactly like
  // localAdapter does.
  //
  // Decides "is this broker_id already in the DB" from a fresh, paginated
  // query (selectAllRows) rather than from `existing` (trades.value) —
  // two separate bugs otherwise bit here: a stale local cache treating an
  // already-inserted trade as brand new, and an unpaginated query only
  // ever seeing PostgREST's default first-1000-rows page once trade
  // counts passed that. Either way the mismatch surfaced downstream as
  // "duplicate key value violates unique constraint
  // trades_user_broker_id_idx" on the .insert() below.
  //
  // (A single `upsert(..., { onConflict: 'user_id,broker_id' })` would
  // avoid this fetch entirely, but can't work here: that index is PARTIAL
  // (`where broker_id is not null`), and Postgres only lets ON CONFLICT
  // target a partial index if the statement repeats that same WHERE
  // clause on the conflict target — something Supabase's JS client has no
  // way to express. Fetch-then-merge is the correct approach for this
  // schema, not a stopgap.)
  async insertTrades(newTrades, existing, accountId) {
    const sb = getSupabase()
    const userId = await getUserId(sb)

    const liveBrokerRows = await selectAllRows(sb, 'trades', {
      cols: 'id, broker_id',
      build: (q) => q.eq('user_id', userId).eq('account_id', accountId).not('broker_id', 'is', null),
    })
    const liveIdByBrokerId = new Map(liveBrokerRows.map(r => [r.broker_id, r.id]))

    const incomingByBrokerId = new Map()
    for (const t of newTrades) if (t.broker_id) incomingByBrokerId.set(t.broker_id, t)
    const seen = new Set(
      existing.filter(t => !t.broker_id).map(t => `${t.symbol}|${t.bought_at}|${t.pnl}`)
    )

    const now = new Date().toISOString()
    const records = []
    const changedUpdates = [] // DB rows for the upsert call — computed fields only
    const touchedBrokerIds = new Set()
    let updated = 0, skipped = 0

    function pushUpdate(dbId, incoming) {
      // Only the computed/import-derived fields go in the update payload —
      // omitting notes/tags/strategy/chart_image means Supabase's upsert
      // leaves those columns untouched (its generated SQL only SETs
      // columns present in the row object), same as localAdapter keeping
      // the user's own edits when it spreads `t` before `incoming`.
      //
      // This upserts onConflict: 'id' — a PLAIN (non-partial) primary-key
      // index, which ON CONFLICT can always target directly, unlike the
      // partial broker_id index above. user_id IS included even though it
      // never actually changes: Postgres runs this as a real INSERT ... ON
      // CONFLICT DO UPDATE, and it checks the INSERT policy's `with check`
      // against the attempted row BEFORE it even gets to see there's a
      // conflict to resolve. A payload missing user_id meant that
      // attempted insert had user_id = null, which can never equal
      // auth.uid() — so the whole upsert failed RLS with "new row violates
      // row-level security policy for table trades", even though this is
      // really just an update to a row the signed-in user already owns.
      // account_id needs to be there for a DIFFERENT reason, now that it's
      // NOT NULL: the attempted INSERT half of INSERT ... ON CONFLICT
      // still has to satisfy that column constraint even though it's
      // always going to resolve to the UPDATE branch — a missing value
      // fails with "null value in column account_id violates not-null
      // constraint" before conflict resolution even gets a say.
      changedUpdates.push({
        id: dbId, user_id: userId, account_id: accountId, broker_id: incoming.broker_id, symbol: incoming.symbol, qty: incoming.qty,
        side: incoming.side, buy_price: incoming.buy_price, sell_price: incoming.sell_price,
        gross_pnl: incoming.gross_pnl, fees: incoming.fees, pnl: incoming.pnl,
        bought_at: incoming.bought_at, sold_at: incoming.sold_at, duration: incoming.duration,
        updated_at: now,
      })
    }

    // Pass 1: trades the LOCAL store already knows about — these get the
    // full merge, preserving notes/tags/strategy/chartImage the same way
    // localAdapter does.
    for (const t of existing) {
      if (!t.broker_id) continue
      const incoming = incomingByBrokerId.get(t.broker_id)
      if (!incoming) continue
      updated++
      touchedBrokerIds.add(t.broker_id)
      pushUpdate(t.id, incoming)
    }

    // Pass 2: a broker_id the DB already has but the local store doesn't
    // (the stale-cache case above) — still an update, just against the
    // DB's own id since there's no local record to find one on.
    for (const [brokerId, dbId] of liveIdByBrokerId) {
      if (touchedBrokerIds.has(brokerId)) continue
      const incoming = incomingByBrokerId.get(brokerId)
      if (!incoming) continue
      updated++
      touchedBrokerIds.add(brokerId)
      pushUpdate(dbId, incoming)
    }

    for (const t of newTrades) {
      if (t.broker_id && touchedBrokerIds.has(t.broker_id)) continue // handled above as an update
      if (!t.broker_id) {
        const key = `${t.symbol}|${t.bought_at}|${t.pnl}`
        if (seen.has(key)) { skipped++; continue }
        seen.add(key)
      }
      const record = { ...t, id: crypto.randomUUID(), created_at: now, updated_at: now }
      records.push(record)
    }

    if (changedUpdates.length) {
      const { error } = await sb.from('trades').upsert(changedUpdates, { onConflict: 'id' })
      if (error) throw error
    }
    if (records.length) {
      const rows = records.map(r => toDbRow({ ...r, user_id: userId, account_id: accountId }))
      const { error } = await sb.from('trades').insert(rows)
      if (error) throw error
    }

    // Re-fetch the full set rather than hand-assembling `all` from
    // `existing` + `records` — this is the moment to let the DB's own
    // state win outright and resync the local store to it, instead of
    // carrying forward whatever staleness `existing` had. Paginated (see
    // selectAllRows) so this doesn't silently truncate at PostgREST's
    // default 1000-row cap once the table grows past that.
    const freshRows = await selectAllRows(sb, 'trades', {
      orderCol: 'sold_at', ascending: false,
      build: (q) => q.eq('account_id', accountId),
    })
    const all = freshRows.map(fromDbRow)

    return { all, records, inserted: records.length, updated, skipped }
  },

  async deleteTrade(id, existing) {
    const sb = getSupabase()
    const { error } = await sb.from('trades').delete().eq('id', id)
    if (error) throw error
    return existing.filter(t => t.id !== id)
  },

  // Batch version of deleteTrade — see localAdapter's deleteTrades for why
  // this exists (avoids one round trip per trade when clearing many at once).
  async deleteTrades(ids, existing) {
    const sb = getSupabase()
    const { error } = await sb.from('trades').delete().in('id', ids)
    if (error) throw error
    const idSet = new Set(ids)
    return existing.filter(t => !idSet.has(t.id))
  },

  async updateTrade(id, patch, existing) {
    const sb = getSupabase()
    // toDbRow maps chartImage → chart_image (and drops the chartImage key
    // entirely), so whatever patch.chartImage was still restored a page
    // comes through as chart_image, the real column name.
    const dbPatch = toDbRow({ ...patch, updated_at: new Date().toISOString() })
    const { error } = await sb.from('trades').update(dbPatch).eq('id', id)
    if (error) throw error
    return existing.map(t => t.id === id ? { ...t, ...patch } : t)
  },

  // account_id is a REQUIRED filter here, not optional scoping — RLS alone
  // (trades_delete_own) only limits this to the signed-in user's own rows,
  // which used to be all a single-portfolio app needed. Without this,
  // "clear all trades" on one portfolio would silently wipe every OTHER
  // portfolio's trades too, since they all belong to the same user.
  async clearAll(accountId) {
    const sb = getSupabase()
    const { error } = await sb.from('trades').delete().eq('account_id', accountId)
    if (error) throw error
  },
}
