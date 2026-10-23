import { describe, it, expect, afterEach } from 'vitest'
import { tradeDay, tradeDayDate, tradingDayStart, DEFAULT_TRADING_DAY_START } from '../tradeDay.js'
import { computeStats, computeBalanceCurve } from '../stats.js'

afterEach(() => { tradingDayStart.value = DEFAULT_TRADING_DAY_START })

describe('tradeDay', () => {
  it('counts a trade from the session open (17:00) toward the next day', () => {
    expect(tradeDay({ sold_at: '2026-10-22T12:48:26' })).toBe('2026-10-22')
    expect(tradeDay({ sold_at: '2026-10-22T16:59:59' })).toBe('2026-10-22')
    expect(tradeDay({ sold_at: '2026-10-22T17:00:00' })).toBe('2026-10-23')
    expect(tradeDay({ sold_at: '2026-10-22T20:36:42' })).toBe('2026-10-23')
  })

  it('rolls over month and year ends, and Sunday evening into Monday', () => {
    expect(tradeDay({ sold_at: '2026-10-31T19:00:00' })).toBe('2026-11-01')
    expect(tradeDay({ sold_at: '2026-12-31T18:00:00' })).toBe('2027-01-01')
    expect(tradeDay({ sold_at: '2026-05-17T17:18:56' })).toBe('2026-05-18')
  })

  it("uses calendar days when the day starts at 00:00, and follows the setting", () => {
    tradingDayStart.value = '00:00'
    expect(tradeDay({ sold_at: '2026-10-22T20:36:42' })).toBe('2026-10-22')
    tradingDayStart.value = '18:00'
    expect(tradeDay({ sold_at: '2026-10-22T17:30:00' })).toBe('2026-10-22')
    expect(tradeDay({ sold_at: '2026-10-22T18:00:00' })).toBe('2026-10-23')
  })

  it('handles a missing time, a Date, and gives a local-midnight Date', () => {
    expect(tradeDay({ sold_at: null })).toBe(null)
    expect(tradeDay(new Date(2026, 9, 22, 20, 0))).toBe('2026-10-23')
    const d = tradeDayDate({ sold_at: '2026-10-22T20:36:42' })
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 23, 0])
  })
})

describe('day grouping follows the trading day', () => {
  const trades = [
    { sold_at: '2026-10-22T08:36:54', pnl: -100 },
    { sold_at: '2026-10-22T20:36:42', pnl: -600 }, // Friday's session
  ]

  it('puts an evening trade in the next day’s daily P&L', () => {
    expect(computeStats(trades).dailyBars).toEqual([
      { date: '2026-10-22', pnl: -100 },
      { date: '2026-10-23', pnl: -600 },
    ])
  })

  it('dates balance-curve points by trading day but keeps them in time order', () => {
    const funds = [{ date: '2026-10-23', amount: 50 }]
    expect(computeBalanceCurve(trades, funds, 1000)).toEqual([
      { date: '2026-10-22', value: 900 },
      { date: '2026-10-23', value: 300 },
      { date: '2026-10-23', value: 350 },
    ])
  })
})
