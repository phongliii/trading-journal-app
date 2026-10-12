import { describe, it, expect } from 'vitest'
import { computeCorrectStarting, computeCurrentBalance } from '../balance.js'

const trade = (pnl, sold_at) => ({ pnl, sold_at })

describe('computeCurrentBalance', () => {
  const trades = [
    trade(-500, '2026-08-01T10:00:00'), // old loss — must stay counted forever
    trade(200, '2026-10-01T10:00:00'),
    trade(100, '2026-10-10T10:00:00'),
  ]

  it('without a starting balance, is the net P&L of every trade', () => {
    expect(computeCurrentBalance({ rawStarting: null }, [], trades)).toBe(-200)
  })

  it('adds all-time P&L and fund flow to the starting balance', () => {
    const data = { rawStarting: 10000, earliestBalanceDate: '2026-07-01' }
    const funds = [{ date: '2026-09-01', amount: -1000 }]
    // 10000 + (-500 + 200 + 100) + (-1000)
    expect(computeCurrentBalance(data, funds, trades)).toBe(8800)
  })

  // Regression: the balance used to add only the top bar's period P&L
  // (e.g. last 30 days), so it rose by itself when an old loss aged out.
  it('does not change as trades get older', () => {
    const data = { rawStarting: 10000, earliestBalanceDate: '2026-07-01' }
    const recentOnly = trades.slice(1) // what a 30-day window would have kept
    expect(computeCurrentBalance(data, [], trades)).not.toBe(computeCurrentBalance(data, [], recentOnly))
    expect(computeCurrentBalance(data, [], trades)).toBe(9800)
  })
})

describe('computeCorrectStarting', () => {
  it('is 0 when no starting balance is set', () => {
    expect(computeCorrectStarting({ rawStarting: null }, [], [])).toBe(0)
  })

  it('uses rawStarting as-is when there is no earliest balance date', () => {
    expect(computeCorrectStarting({ rawStarting: 5000, earliestBalanceDate: null }, [], [trade(50, '2026-01-01')])).toBe(5000)
  })

  it('backs out funds up to day 1 and trades closed before day 1', () => {
    const data = { rawStarting: 10000, earliestBalanceDate: '2026-09-01' }
    const funds = [{ date: '2026-08-15', amount: 2000 }, { date: '2026-09-01', amount: 500 }, { date: '2026-09-02', amount: 999 }]
    const trades = [trade(300, '2026-08-20T10:00:00'), trade(40, '2026-09-01T10:00:00'), trade(7, null)]
    // 10000 - (2000 + 500) - 300
    expect(computeCorrectStarting(data, funds, trades)).toBe(7200)
  })
})
