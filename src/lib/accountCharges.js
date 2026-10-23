// Account fees and credits — balance changes that are neither a trade nor a
// deposit/withdrawal, e.g. a $50 "Liquidation Fee" or a $35 "Dormant Fee"
// (csvParser's parseFundTransactions keeps them as type 'fee' / 'credit',
// labelled with the broker's own name, dated by the broker's Date).
//
// They're real money, so every P&L TOTAL for a day, week, month or year
// includes them (calendar, journal, dashboard Net P&L and curves). Stats
// about trades — win rate, profit factor, averages, trade counts — and Gross
// P&L (before fees) leave them out: an account fee isn't a losing trade.
export const isAccountCharge = f => f.type === 'fee' || f.type === 'credit'

// The account charges among (approved) fund transactions.
export function accountCharges(fundTransactions) {
  return (fundTransactions || []).filter(f => isAccountCharge(f) && f.date)
}

// Charges dated between from and to ('yyyy-MM-dd', inclusive; null = open).
export function chargesBetween(charges, from, to) {
  return (charges || []).filter(f => (!from || f.date >= from) && (!to || f.date <= to))
}

export const chargesTotal = charges => (charges || []).reduce((s, f) => s + f.amount, 0)
