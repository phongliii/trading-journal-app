import { describe, it, expect } from 'vitest'
import {
  computeStats, aggregateTrades, groupByMonth, groupByDow, groupBySymbol,
  resolvePeriodRange, filterTradesByMonth, filterTradesByDateRange,
  fmt, fmtCompact, fmtPct,
  computeDrawdownFromEvents, computeBalanceCurve, computeFundBaseCurve,
  computeRevengeTrading, computeOvertrading, computeHourlyPerf, computeSideBias,
} from '../stats.js'

const trade = (pnl, sold_at, extra = {}) => ({ symbol: 'MNQ', pnl, sold_at, ...extra })

describe('computeStats', () => {
  it('returns zeros for no trades', () => {
    const s = computeStats([])
    expect(s.total).toBe(0)
    expect(s.totalPnl).toBe(0)
    expect(s.equityCurve).toEqual([])
    expect(computeStats(null).total).toBe(0)
  })

  // TradesView shows String(s.breakeven) — must not be "undefined" when a
  // filter matches nothing.
  it('empty stats include breakeven fields', () => {
    const s = computeStats([])
    expect(s.breakeven).toBe(0)
    expect(s.breakevenRate).toBe(0)
  })

  it('computes totals, averages, profit factor and extremes', () => {
    const s = computeStats([
      trade(100, '2026-01-05T10:00:00'),
      trade(-50, '2026-01-05T11:00:00'),
      trade(200, '2026-01-06T10:00:00'),
      trade(-25, '2026-01-07T10:00:00'),
    ])
    expect(s.total).toBe(4)
    expect(s.totalPnl).toBe(225)
    expect(s.grossWin).toBe(300)
    expect(s.grossLoss).toBe(75)
    expect(s.winRate).toBe(50)
    expect(s.avgWin).toBe(150)
    expect(s.avgLoss).toBe(-37.5)
    expect(s.profitFactor).toBe(4)
    expect(s.expectancy).toBeCloseTo(56.25)
    expect(s.largestGain).toBe(200)
    expect(s.largestLoss).toBe(-50)
  })

  it('classifies win/loss/breakeven by GROSS pnl but sums NET pnl', () => {
    // Gross winner that fees turned into a net loser.
    const s = computeStats([
      trade(-2, '2026-01-05T10:00:00', { gross_pnl: 3 }),
      trade(0, '2026-01-05T11:00:00', { gross_pnl: 0 }),
    ])
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(0)
    expect(s.breakeven).toBe(1)
    expect(s.breakevenRate).toBe(50)
    expect(s.totalPnl).toBe(-2)
    expect(s.grossLoss).toBe(2)
  })

  it('reports profit factor 999 when there are no losses', () => {
    expect(computeStats([trade(10, '2026-01-05T10:00:00')]).profitFactor).toBe(999)
  })

  it('reports profit factor 0 when there are only losses', () => {
    expect(computeStats([trade(-10, '2026-01-05T10:00:00')]).profitFactor).toBe(0)
  })

  it('builds the equity curve and streaks in sold_at order, not input order', () => {
    const s = computeStats([
      trade(-10, '2026-01-05T12:00:00'),
      trade(30, '2026-01-05T09:00:00'),
      trade(20, '2026-01-05T10:00:00'),
      trade(-5, '2026-01-05T13:00:00'),
    ])
    expect(s.equityCurve.map(p => p.value)).toEqual([30, 50, 40, 35])
    expect(s.maxConsecWins).toBe(2)
    expect(s.maxConsecLosses).toBe(2)
  })

  it('measures max drawdown from the running peak', () => {
    const s = computeStats([
      trade(100, '2026-01-05T09:00:00'),
      trade(-60, '2026-01-05T10:00:00'),
      trade(-30, '2026-01-05T11:00:00'),
      trade(200, '2026-01-05T12:00:00'),
      trade(-50, '2026-01-05T13:00:00'),
    ])
    expect(s.maxDrawdown).toBe(90)
  })

  it('groups daily bars by local calendar day, oldest first', () => {
    const s = computeStats([
      trade(10, '2026-01-06T09:00:00'),
      trade(5, '2026-01-05T09:00:00'),
      trade(-3, '2026-01-05T15:00:00'),
    ])
    expect(s.dailyBars).toEqual([
      { date: '2026-01-05', pnl: 2 },
      { date: '2026-01-06', pnl: 10 },
    ])
  })
})

describe('aggregateTrades', () => {
  it('sums pnl and counts gross winners', () => {
    expect(aggregateTrades([
      trade(10, 'x'), trade(-4, 'x', { gross_pnl: 1 }), trade(-6, 'x'),
    ])).toEqual({ pnl: 0, trades: 3, wins: 2, winRate: (2 / 3) * 100 })
  })
  it('handles empty input', () => {
    expect(aggregateTrades([])).toEqual({ pnl: 0, trades: 0, wins: 0, winRate: 0 })
  })
})

describe('groupByMonth / groupByDow / groupBySymbol', () => {
  const trades = [
    trade(100, '2026-01-05T10:00:00'),              // Mon, Jan
    trade(-40, '2026-01-06T10:00:00', { symbol: 'ES' }), // Tue, Jan
    trade(60, '2026-03-02T10:00:00', { symbol: 'ES' }),  // Mon, Mar
    trade(999, null),                                // no date: ignored by month/dow
  ]

  it('groupByMonth returns all 12 months with pnl, win rate and bar widths', () => {
    const m = groupByMonth(trades)
    expect(m).toHaveLength(12)
    expect(m[0]).toMatchObject({ label: 'Jan', pnl: 60, trades: 2, wins: 1, winRate: 50, width: 100 })
    expect(m[2]).toMatchObject({ label: 'Mar', pnl: 60, trades: 1, wins: 1 })
    expect(m[1]).toMatchObject({ pnl: 0, trades: 0, width: 0, winRate: 0 })
    expect(m[0].pct).toBeCloseTo(50)
  })

  it('groupByDow buckets by weekday', () => {
    const d = groupByDow(trades)
    expect(d[1]).toMatchObject({ label: 'Mon', pnl: 160, trades: 2, wins: 2 })
    expect(d[2]).toMatchObject({ label: 'Tue', pnl: -40, trades: 1, wins: 0 })
    expect(d[2].pct).toBeLessThan(0)
  })

  it('groupBySymbol sorts by pnl descending (includes undated trades)', () => {
    const s = groupBySymbol(trades)
    expect(s.map(x => x.symbol)).toEqual(['MNQ', 'ES'])
    expect(s[0]).toMatchObject({ pnl: 1099, trades: 2, winRate: 100 })
    expect(s[1]).toMatchObject({ pnl: 20, trades: 2, winRate: 50 })
  })
})

describe('resolvePeriodRange', () => {
  const today = new Date(2026, 4, 15) // May 15 2026
  const ymd = d => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

  it.each([
    ['thisYear', '2026-1-1', '2026-12-31'],
    ['lastYear', '2025-1-1', '2025-12-31'],
    ['thisMonth', '2026-5-1', '2026-5-31'],
    ['lastMonth', '2026-4-1', '2026-4-30'],
    ['thisQuarter', '2026-4-1', '2026-6-30'],
    ['lastQuarter', '2026-1-1', '2026-3-31'],
    ['year:2023', '2023-1-1', '2023-12-31'],
  ])('%s', (opt, from, to) => {
    const r = resolvePeriodRange(opt, today)
    expect(ymd(r.from)).toBe(from)
    expect(ymd(r.to)).toBe(to)
  })

  it('all / unknown → unbounded', () => {
    expect(resolvePeriodRange('all', today)).toEqual({ from: null, to: null })
    expect(resolvePeriodRange('nonsense', today)).toEqual({ from: null, to: null })
  })
})

describe('filterTradesByMonth / filterTradesByDateRange', () => {
  const trades = [
    trade(1, '2025-03-10T10:00:00'),
    trade(2, '2026-03-10T10:00:00'),
    trade(3, '2026-04-30T23:59:00'),
    trade(4, null),
  ]

  it('filters by month across all years or one year', () => {
    expect(filterTradesByMonth(trades, 2, null).map(t => t.pnl)).toEqual([1, 2])
    expect(filterTradesByMonth(trades, 2, 2026).map(t => t.pnl)).toEqual([2])
  })

  it('filters by an inclusive date range, using resolvePeriodRange output', () => {
    const { from, to } = resolvePeriodRange('thisMonth', new Date(2026, 3, 10))
    expect(filterTradesByDateRange(trades, from, to).map(t => t.pnl)).toEqual([3])
  })

  it('returns everything (even undated) with no bounds', () => {
    expect(filterTradesByDateRange(trades, null, null)).toBe(trades)
  })
})

describe('fmt', () => {
  it.each([
    [0, '$0.00'], [1234.5, '$1,234.50'], [-1234567.891, '-$1,234,567.89'],
    [null, '$0.00'], [undefined, '$0.00'], [NaN, '$0.00'],
  ])('fmt(%s) = %s', (v, out) => expect(fmt(v)).toBe(out))

  it('respects decimals', () => expect(fmt(1234.5, 0)).toBe('$1,235'))
})

describe('fmtCompact', () => {
  it.each([
    [9999.99, '$9,999.99'],
    [10000, '$10K'],
    [15250, '$15.25K'],
    [-2500000, '-$2.5M'],
    [999995, '$1M'],       // rounds up into the next unit, not "$1000K"
    [1.5e9, '$1.5B'],
    [5e15, '$999.99T'],    // clamped at the top unit
    [null, '$0.00'],
  ])('fmtCompact(%s) = %s', (v, out) => expect(fmtCompact(v)).toBe(out))

  it('decimals=0 keeps integer zeros', () => {
    expect(fmtCompact(150000, 0)).toBe('$150K')
  })
})

describe('fmtPct', () => {
  it.each([
    [42, '42%'], [42.5, '42.5%'], [42.546, '42.55%'], [100, '100%'],
    [0, '0%'], [undefined, '0%'], [-12.3, '-12.3%'],
  ])('fmtPct(%s) = %s', (v, out) => expect(fmtPct(v)).toBe(out))
})

describe('computeDrawdownFromEvents', () => {
  const ev = (timestamp, delta, type = 'Trade Paired') => ({ timestamp, delta, type })

  it('returns zeros for no events', () => {
    expect(computeDrawdownFromEvents([])).toEqual({ maxDrawdown: 0, peakEquity: 0, realizedHighPnl: 0 })
  })

  it('continuous mode ignores deposits/withdrawals when measuring drawdown', () => {
    const events = [
      ev('2026-01-05T09:00:00', 5000, 'Fund Transaction'),
      ev('2026-01-05T10:00:00', 300),
      ev('2026-01-05T11:00:00', -200),
      ev('2026-01-05T12:00:00', -1000, 'Fund Transaction'), // withdrawal is not a drawdown
      ev('2026-01-05T13:00:00', -150),
    ]
    expect(computeDrawdownFromEvents(events)).toEqual({ maxDrawdown: 350, peakEquity: 300, realizedHighPnl: 300 })
  })

  it('continuous mode carries equity from before the window', () => {
    const events = [
      ev('2026-01-05T10:00:00', 500),
      ev('2026-01-06T10:00:00', 50),
      ev('2026-01-06T11:00:00', -200),
    ]
    const r = computeDrawdownFromEvents(events, '2026-01-06T00:00:00', null)
    expect(r.peakEquity).toBe(550)
    expect(r.maxDrawdown).toBe(200)
    expect(r.realizedHighPnl).toBe(50) // realized P&L counts only in-window events
  })

  // Peak starts at the equity ENTERING the window (500), not after the first
  // in-window event, so a window that opens with a loss counts it.
  it('continuous mode counts a loss on the first in-window event', () => {
    const events = [ev('2026-01-05T10:00:00', 500), ev('2026-01-06T10:00:00', -100)]
    expect(computeDrawdownFromEvents(events, '2026-01-06T00:00:00', null).maxDrawdown).toBe(100)
  })

  it('continuous mode with no window measures from a zero baseline', () => {
    const events = [ev('2026-01-05T10:00:00', -40), ev('2026-01-05T11:00:00', 100)]
    expect(computeDrawdownFromEvents(events)).toEqual({ maxDrawdown: 40, peakEquity: 60, realizedHighPnl: 60 })
  })

  it('daily-reset mode starts the peak at the first event and skips fund transactions', () => {
    const events = [
      ev('2026-01-05T09:00:00', 5000, 'Fund Transaction'),
      ev('2026-01-05T10:00:00', -100),
      ev('2026-01-05T11:00:00', 40),
      ev('2026-01-05T12:00:00', -90),
    ]
    expect(computeDrawdownFromEvents(events, null, null, true))
      .toEqual({ maxDrawdown: 90, peakEquity: -60, realizedHighPnl: 0 })
  })

  it('stops at the end of the window', () => {
    const events = [ev('2026-01-05T10:00:00', 100), ev('2026-01-07T10:00:00', -500)]
    expect(computeDrawdownFromEvents(events, null, '2026-01-06T00:00:00').maxDrawdown).toBe(0)
  })
})

describe('computeBalanceCurve / computeFundBaseCurve', () => {
  const trades = [trade(100, '2026-01-05T10:00:00'), trade(-30, '2026-01-07T10:00:00'), trade(5, null)]
  const funds = [{ date: '2026-01-06', amount: -500 }, { date: '', amount: 999 }]

  it('applies trades and fund transactions chronologically to the starting balance', () => {
    expect(computeBalanceCurve(trades, funds, 1000).map(p => p.value)).toEqual([1100, 600, 570])
  })

  it('base curve only follows deposits/withdrawals', () => {
    expect(computeFundBaseCurve(funds, 1000)).toEqual([{ date: '2026-01-06', value: 500 }])
    expect(computeFundBaseCurve(null, 1000)).toEqual([])
  })
})

describe('behaviour analytics', () => {
  it('computeRevengeTrading flags trades opened within the window after a loss', () => {
    const r = computeRevengeTrading([
      trade(-50, '2026-01-05T10:00:00'),
      trade(20, '2026-01-05T10:20:00', { bought_at: '2026-01-05T10:10:00' }), // 10 min after loss → revenge
      trade(-10, '2026-01-05T11:00:00', { bought_at: '2026-01-05T10:50:00' }), // after a win → normal
      trade(5, '2026-01-05T12:00:00', { bought_at: '2026-01-05T11:30:00' }),   // 30 min after loss → normal
    ])
    expect(r).toMatchObject({ revengeCount: 1, normalCount: 2, revengeWinRate: 100, normalWinRate: 50, revengeAvgPnl: 20 })
  })

  it('computeOvertrading splits days by trade count', () => {
    const busy = Array.from({ length: 3 }, (_, i) => trade(i === 0 ? 10 : -1, `2026-01-05T1${i}:00:00`))
    const quiet = [trade(10, '2026-01-06T10:00:00')]
    expect(computeOvertrading([...busy, ...quiet], 3)).toMatchObject({
      highVolumeDayCount: 1, highVolumeTradeCount: 3, normalTradeCount: 1, normalWinRate: 100,
    })
  })

  it('computeHourlyPerf groups by close hour and drops empty hours', () => {
    expect(computeHourlyPerf([
      trade(10.005, '2026-01-05T09:15:00'), trade(-4, '2026-01-05T09:45:00'), trade(1, '2026-01-05T14:00:00'),
    ])).toEqual([
      { hour: 9, trades: 2, winRate: 50, pnl: 6.01 },
      { hour: 14, trades: 1, winRate: 100, pnl: 1 },
    ])
  })

  it('computeSideBias treats missing side as long', () => {
    expect(computeSideBias([
      trade(10, 'x'), trade(-5, 'x', { side: 'long' }), trade(7, 'x', { side: 'short' }),
    ])).toEqual({
      long: { count: 2, winRate: 50, pnl: 5 },
      short: { count: 1, winRate: 100, pnl: 7 },
    })
  })
})
