// When to show the "consider withdrawing" toast (see App.vue).
//
// The week is decided on its FIRST TRADING DAY (Monday, or the next weekday
// that isn't a holiday): if the balance going into that day is at/above the
// target, the week is "on" and the toast shows once per trading day until a
// withdrawal dated this week is recorded or the balance drops below the
// target (which ends it for the rest of the week, even if the balance
// climbs back). If it's below, the week is "off" —
// no toast at all that week, even if the target is hit mid-week. Each week
// starts over.
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { computeCurrentBalance } from './balance'

const ymd = (d) => format(d, 'yyyy-MM-dd')

// First weekday of `today`'s Monday-start week that isn't a holiday.
export function firstTradingDayOfWeek(today, isHoliday) {
  let d = startOfWeek(today, { weekStartsOn: 1 })
  for (let i = 0; i < 5; i++, d = addDays(d, 1)) {
    if (!isHoliday(ymd(d))) return d
  }
  return null // whole week is holidays
}

/**
 * @param {object} o
 * @param {Date}   o.today            app-timezone today (local midnight)
 * @param {(ymd: string) => boolean} o.isHoliday
 * @param {number} o.threshold        target balance
 * @param {object} o.balanceData      { rawStarting, earliestBalanceDate }
 * @param {Array}  o.fundTransactions [{ date, amount, type }]
 * @param {Array}  o.trades           every trade ({ sold_at, pnl })
 * @param {string|null} o.lastShownDate 'yyyy-MM-dd' the toast last fired
 * @returns {boolean} whether to show the toast now
 */
export function shouldRemindWithdraw({ today, isHoliday, threshold, balanceData, fundTransactions, trades, lastShownDate }) {
  if (!Number.isFinite(threshold) || threshold <= 0) return false
  const todayStr = ymd(today)
  if (lastShownDate === todayStr) return false
  if (today.getDay() === 0 || today.getDay() === 6 || isHoliday(todayStr)) return false

  const first = firstTradingDayOfWeek(today, isHoliday)
  if (!first || today < first) return false
  const firstStr = ymd(first)

  // A withdrawal dated this week ends the reminders until next week.
  const weekStartStr = ymd(startOfWeek(today, { weekStartsOn: 1 }))
  const weekEndStr   = ymd(endOfWeek(today, { weekStartsOn: 1 }))
  const withdrawn = fundTransactions.some(t => t.type === 'withdrawal' && t.date >= weekStartStr && t.date <= weekEndStr)
  if (withdrawn) return false

  // Balance going into the first trading day: leave out anything dated on
  // or after it, so the answer doesn't depend on which day the app is opened.
  const balanceAtStart = computeCurrentBalance(
    balanceData,
    fundTransactions.filter(t => t.date < firstStr),
    trades.filter(t => !t.sold_at || t.sold_at.slice(0, 10) < firstStr),
  )
  if (balanceAtStart < threshold) return false

  // Once the week is on, it ends for the week as soon as the balance has
  // been below the target at the end of any day from the first trading day
  // through today.
  const balanceThrough = (dayStr) => computeCurrentBalance(
    balanceData,
    fundTransactions.filter(t => t.date <= dayStr),
    trades.filter(t => !t.sold_at || t.sold_at.slice(0, 10) <= dayStr),
  )
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (balanceThrough(ymd(d)) < threshold) return false
  }
  return true
}
