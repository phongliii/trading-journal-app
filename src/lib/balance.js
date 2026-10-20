// Account balance math for stores/balance.js, kept pure so it can be tested.
//
// `trades` must be EVERY trade in the portfolio — never a date-filtered
// list. (The balance once added the P&L of only the last 30 days' trades, so
// it moved by itself each day as old trades fell out of that window.)

const sumPnl = (trades) => trades.reduce((s, t) => s + t.pnl, 0)

// Correct starting = rawStarting - funds on or before earliest balance
// date - realized P&L from trades strictly before that date.
//
// rawStarting (from csvParser's parseBalanceHistory) is the broker's real
// account value at the START of day1 — day1's own realized P&L is already
// subtracted out there, but every trade that closed BEFORE day1 is a real
// past event already baked into that number. currentBalance below adds the
// P&L of every trade, so those earlier trades are subtracted back out here
// to avoid counting them twice; same for fund transactions up to day1.
export function computeCorrectStarting({ rawStarting, earliestBalanceDate }, fundTransactions, trades) {
  if (rawStarting === null || rawStarting === undefined) return 0
  const day1 = earliestBalanceDate
  if (!day1) return rawStarting
  const day1Funds = fundTransactions.filter(t => t.date <= day1).reduce((s, t) => s + t.amount, 0)
  const priorPnl = sumPnl(trades.filter(t => t.sold_at && t.sold_at.slice(0, 10) < day1))
  return rawStarting - day1Funds - priorPnl
}

// With a starting balance: correctStarting + all-time net P&L + all fund flow.
// Without one: all-time net P&L only.
export function computeCurrentBalance(data, fundTransactions, trades) {
  const hasBalance = data.rawStarting !== null && data.rawStarting !== undefined
  if (!hasBalance) return sumPnl(trades)
  const fundFlow = fundTransactions.reduce((s, t) => s + t.amount, 0)
  return computeCorrectStarting(data, fundTransactions, trades) + sumPnl(trades) + fundFlow
}

/**
 * Merge newly imported deposits/withdrawals into the saved list, skipping
 * ones already there. Matched by the broker's Transaction ID, so two real
 * transactions with the same date and amount are both kept. Saved entries
 * from before IDs were stored (no `id`) are matched by date + amount
 * instead — each one at most once — and get the ID filled in.
 *
 * @returns {{ merged: Array, added: number }} merged list, sorted by date
 */
export function mergeFundTransactions(existing, incoming) {
  const merged = existing.map(t => ({ ...t }))
  const ids = new Set(merged.filter(t => t.id).map(t => String(t.id)))
  let added = 0
  for (const t of incoming) {
    if (t.id && ids.has(String(t.id))) continue
    // Legacy entry (saved without an ID) for the same date + amount?
    const legacy = merged.find(m => !m.id && m.date === t.date && m.amount === t.amount)
    if (legacy) {
      if (t.id) { legacy.id = t.id; ids.add(String(t.id)) }
      continue
    }
    merged.push({ ...t })
    if (t.id) ids.add(String(t.id))
    added++
  }
  merged.sort((a, b) => a.date.localeCompare(b.date))
  return { merged, added }
}
