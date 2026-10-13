// Buckets daily P&L into bars for the Dashboard's "Realized P&L" card, for
// its own range tabs (independent of the dashboard-wide period):
//
//   1W / 1M  → one bar per calendar day (last 7 / 30 days)
//   3M / YTD → one bar per week          (last 90 days / Jan 1 → today)
//   ALL      → one bar per week up to ~a year of history, per month beyond
//
// `bars` is [{ date: 'yyyy-MM-dd', pnl }], oldest first (stats.dailyBars shape).
import {
  format, eachDayOfInterval, addDays, startOfWeek, startOfMonth, startOfYear,
  addMonths, subDays, differenceInCalendarDays,
} from 'date-fns'

export const REALIZED_RANGES = ['1W', '1M', '3M', 'YTD', 'ALL']

const key = (d) => format(d, 'yyyy-MM-dd')
const parseLocal = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d) }

// First day of a range tab's window. ALL starts at `firstDate` (the oldest
// data point), or a year back when there's no data yet. Shared with the
// Dashboard's Equity / Balance chart so both cards' tabs mean the same thing.
export function rangeStart(range, today, firstDate) {
  if (range === '1W') return subDays(today, 6)
  if (range === '1M') return subDays(today, 29)
  if (range === '3M') return subDays(today, 89)
  if (range === 'YTD') return startOfYear(today)
  return firstDate || subDays(today, 364)
}

// How a range is bucketed: days for 1W/1M, months for ALL beyond a year of
// history, weeks otherwise.
export function rangeMode(range, start, today) {
  if (range === '1W' || range === '1M') return 'daily'
  if (range === 'ALL' && differenceInCalendarDays(today, start) > 365) return 'monthly'
  return 'weekly'
}

export function buildRealizedBuckets(bars, range, today) {
  const pnl = {}
  for (const b of bars) pnl[b.date] = b.pnl
  const sumDays = (from, to) =>
    eachDayOfInterval({ start: from, end: to }).reduce((s, d) => s + (pnl[key(d)] ?? 0), 0)

  const firstTrade = bars.length ? parseLocal(bars[0].date) : null
  const start = rangeStart(range, today, firstTrade)
  const mode = rangeMode(range, start, today)

  const labels = [], titles = [], values = []

  if (mode === 'daily') {
    // Every calendar day in the window gets a bar; weekends with no trades
    // are simply empty.
    for (const d of eachDayOfInterval({ start, end: today })) {
      labels.push(format(d, 'MMM d'))
      titles.push(format(d, 'EEE, MMM d'))
      values.push(pnl[key(d)] ?? 0)
    }
  } else if (mode === 'weekly') {
    // Monday-start weeks, like the Journal. The first/last week are clipped
    // to the window so a partial week only counts its in-range days.
    for (let ws = startOfWeek(start, { weekStartsOn: 1 }); ws <= today; ws = addDays(ws, 7)) {
      const from = ws < start ? start : ws
      const we = addDays(ws, 6)
      const to = we > today ? today : we
      labels.push(format(ws, 'MMM d'))
      titles.push(`Week of ${format(ws, 'MMM d')}`)
      values.push(sumDays(from, to))
    }
  } else {
    for (let ms = startOfMonth(start); ms <= today; ms = addMonths(ms, 1)) {
      const from = ms < start ? start : ms
      const me = addDays(addMonths(ms, 1), -1)
      const to = me > today ? today : me
      labels.push(format(ms, 'MMM yy'))
      titles.push(format(ms, 'MMMM yyyy'))
      values.push(sumDays(from, to))
    }
  }

  const total = Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100
  return { mode, labels, titles, values, total }
}
