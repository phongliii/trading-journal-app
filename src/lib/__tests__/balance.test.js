import { describe, it, expect } from 'vitest'
import { computeCorrectStarting, computeCurrentBalance, mergeFundTransactions, withoutCancelledWithdrawals, fundStatus } from '../balance.js'
import { parseFundTransactions } from '../csvParser.js'

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

describe('mergeFundTransactions', () => {
  const w = (id, date, amount) => ({ id, date, amount, type: amount >= 0 ? 'deposit' : 'withdrawal' })

  it('keeps two real same-day, same-amount withdrawals', () => {
    const { merged, added } = mergeFundTransactions([], [w('1', '2026-10-14', -500), w('2', '2026-10-14', -500)])
    expect(added).toBe(2)
    expect(merged).toHaveLength(2)
  })

  it('skips ones already imported (same Transaction ID)', () => {
    const { merged, added } = mergeFundTransactions([w('1', '2026-10-14', -500)], [w('1', '2026-10-14', -500), w('2', '2026-10-15', 300)])
    expect(added).toBe(1)
    expect(merged.map(t => t.id)).toEqual(['1', '2'])
  })

  it('matches older saved entries without an ID by date + amount, each once, and fills in the ID', () => {
    const legacy = [{ date: '2026-10-14', amount: -500, type: 'withdrawal' }]
    const { merged, added } = mergeFundTransactions(legacy, [w('1', '2026-10-14', -500), w('2', '2026-10-14', -500)])
    // The first matches the old entry (no double count); the second is new.
    expect(added).toBe(1)
    expect(merged).toHaveLength(2)
    expect(merged.map(t => t.id).sort()).toEqual(['1', '2'])
  })

  it('still de-duplicates by date + amount when no IDs are available', () => {
    const t = { date: '2026-10-14', amount: -500, type: 'withdrawal' }
    expect(mergeFundTransactions([t], [{ ...t }]).added).toBe(0)
  })

  it('returns the list sorted by date', () => {
    const { merged } = mergeFundTransactions([w('2', '2026-10-20', 1)], [w('1', '2026-10-01', 1)])
    expect(merged.map(t => t.date)).toEqual(['2026-10-01', '2026-10-20'])
  })
})

describe('withoutCancelledWithdrawals', () => {
  // The real Oct 21 rows: a deposit, then a withdrawal that wasn't approved
  // and its refund (Transaction ID + 1, same amount).
  const CASH = [
    'Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract',
    '1,20620483189,10/21/2026 08:42:55,2026-10-21,"1,000.00","1,763.72", Fund Transaction,USD,',
    '1,20620487988,10/21/2026 09:46:15,2026-10-21,"-1,000.00","3,413.16", Fund Transaction,USD,',
    '1,20620487989,10/21/2026 12:31:36,2026-10-21,"1,000.00","4,413.16", Fund Transaction,USD,',
  ].join('\n')

  it('drops an unapproved withdrawal and its refund, keeps the real deposit', () => {
    const kept = withoutCancelledWithdrawals(parseFundTransactions(CASH))
    expect(kept).toEqual([{ id: '20620483189', date: '2026-10-21', amount: 1000, type: 'deposit' }])
  })

  it('keeps a withdrawal whose next ID is a different amount, or not a refund', () => {
    const txns = [
      { id: '100', date: '2026-10-21', amount: -500, type: 'withdrawal' },
      { id: '101', date: '2026-10-21', amount: 400, type: 'deposit' },
      { id: '200', date: '2026-10-22', amount: -300, type: 'withdrawal' },
      { id: '202', date: '2026-10-22', amount: 300, type: 'deposit' },
    ]
    expect(withoutCancelledWithdrawals(txns)).toBe(txns) // nothing dropped, same array
  })

  it('leaves entries without an ID alone', () => {
    const txns = [{ date: '2026-10-21', amount: -500 }, { date: '2026-10-21', amount: 500 }]
    expect(withoutCancelledWithdrawals(txns)).toBe(txns)
  })
})

describe('fundStatus', () => {
  it('marks the unapproved withdrawal and its refund, everything else approved', () => {
    const txns = [
      { id: '20620479695', date: '2026-10-19', amount: -1000 },
      { id: '20620479696', date: '2026-10-19', amount: -500 },   // next ID, but another withdrawal
      { id: '20620487988', date: '2026-10-21', amount: -1000 },
      { id: '20620487989', date: '2026-10-21', amount: 1000 },   // its refund
    ]
    const s = fundStatus(txns)
    expect(txns.map(t => s.get(t))).toEqual(['approved', 'approved', 'declined', 'refund'])
  })
})
