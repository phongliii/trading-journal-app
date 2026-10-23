import { ref } from 'vue'
import { format } from 'date-fns'

// Which trading day a trade belongs to — the broker's "Trade Date", not the
// calendar date it closed on. Futures trade in sessions that open the
// evening before (CME: 17:00 Central), so a trade closed Thursday 20:30 is
// part of FRIDAY's session, and the broker books it (P&L, fees, its Trade
// Date column) on Friday. Anything closed at or after `tradingDayStart`
// therefore counts toward the next day; '00:00' means plain calendar days.
//
// Every place that groups trades by day, week, month or year goes through
// tradeDay()/tradeDayDate(), so they all agree with each other and with the
// broker. Times of day (charts, the hour-of-day stats) still use sold_at.
//
// A ref, so computed values that read it update when the setting changes
// (stores/tradingRules.js owns and syncs it).
export const DEFAULT_TRADING_DAY_START = '17:00'
export const tradingDayStart = ref(DEFAULT_TRADING_DAY_START)

// 'yyyy-MM-dd' for a trade (or a sold_at value), or null without one.
export function tradeDay(tradeOrTime) {
  const ts = tradeOrTime && typeof tradeOrTime === 'object' && !(tradeOrTime instanceof Date)
    ? tradeOrTime.sold_at
    : tradeOrTime
  if (!ts) return null
  // sold_at is a naive broker wall-clock string ('2026-10-22T20:36:42'); read
  // its digits rather than converting through a timezone.
  const s = ts instanceof Date ? format(ts, "yyyy-MM-dd'T'HH:mm") : String(ts)
  const date = s.slice(0, 10)
  const start = tradingDayStart.value
  if (!start || start === '00:00' || s.slice(11, 16) < start) return date
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

// The same day as a local-midnight Date, for date-fns (weeks, months, years).
export function tradeDayDate(tradeOrTime) {
  const key = tradeDay(tradeOrTime)
  if (!key) return null
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
