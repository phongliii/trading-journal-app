import { describe, it, expect } from 'vitest'
import { buildRealizedBuckets, REALIZED_RANGES } from '../realizedPnl.js'

const today = new Date(2026, 9, 7) // Wed Oct 7 2026

describe('buildRealizedBuckets', () => {
  const bars = [
    { date: '2026-01-02', pnl: 1000 }, // outside 3M, inside YTD
    { date: '2026-09-28', pnl: 50 },   // Mon, week of Sep 28
    { date: '2026-10-01', pnl: -20 },  // Thu, same week
    { date: '2026-10-05', pnl: 30 },   // Mon, this week
    { date: '2026-10-07', pnl: 12.345 },
  ]

  it('exposes the five ranges', () => {
    expect(REALIZED_RANGES).toEqual(['1W', '1M', '3M', 'YTD', 'ALL'])
  })

  it('1W: one bar per day for the last 7 days, including empty days', () => {
    const r = buildRealizedBuckets(bars, '1W', today)
    expect(r.mode).toBe('daily')
    expect(r.labels).toEqual(['Oct 1', 'Oct 2', 'Oct 3', 'Oct 4', 'Oct 5', 'Oct 6', 'Oct 7'])
    expect(r.values).toEqual([-20, 0, 0, 0, 30, 0, 12.345])
    expect(r.titles[0]).toBe('Thu, Oct 1')
    expect(r.total).toBe(22.35) // rounded to cents
  })

  it('1M: 30 daily bars', () => {
    const r = buildRealizedBuckets(bars, '1M', today)
    expect(r.mode).toBe('daily')
    expect(r.values).toHaveLength(30)
    expect(r.labels[0]).toBe('Sep 8')
    expect(r.total).toBe(72.35)
  })

  it('3M: Monday-start weeks, clipped to the window', () => {
    const r = buildRealizedBuckets(bars, '3M', today)
    expect(r.mode).toBe('weekly')
    expect(r.labels.at(-1)).toBe('Oct 5')
    expect(r.labels.at(-2)).toBe('Sep 28')
    expect(r.values.at(-2)).toBe(30)
    expect(r.values.at(-1)).toBeCloseTo(42.345)
    expect(r.titles.at(-1)).toBe('Week of Oct 5')
    expect(r.total).toBe(72.35) // Jan 2 is outside the 90-day window
  })

  it('YTD: weekly from Jan 1, first partial week only counts in-year days', () => {
    const withDec = [{ date: '2025-12-29', pnl: 999 }, ...bars]
    const r = buildRealizedBuckets(withDec, 'YTD', today)
    expect(r.mode).toBe('weekly')
    expect(r.labels[0]).toBe('Dec 29') // week starts Mon Dec 29 2025…
    expect(r.values[0]).toBe(1000)     // …but only Jan 1–4 are summed
    expect(r.total).toBe(1072.35)
  })

  it('ALL: weekly while history is under a year', () => {
    const r = buildRealizedBuckets(bars, 'ALL', today)
    expect(r.mode).toBe('weekly')
    expect(r.total).toBe(1072.35)
  })

  it('ALL: monthly once history is over a year', () => {
    const r = buildRealizedBuckets([{ date: '2025-06-15', pnl: 10 }, ...bars], 'ALL', today)
    expect(r.mode).toBe('monthly')
    expect(r.labels[0]).toBe('Jun 25')
    expect(r.titles[0]).toBe('June 2025')
    expect(r.labels.at(-1)).toBe('Oct 26')
    expect(r.values.at(-1)).toBeCloseTo(22.345) // October: -20 + 30 + 12.345
    expect(r.values.at(-2)).toBe(50)            // September
    expect(r.total).toBe(1082.35)
  })

  it('ALL with no trades falls back to a year of weekly bars', () => {
    const r = buildRealizedBuckets([], 'ALL', today)
    expect(r.mode).toBe('weekly')
    expect(r.values.every(v => v === 0)).toBe(true)
    expect(r.total).toBe(0)
  })
})
