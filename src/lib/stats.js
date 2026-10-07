import { format, parseISO, getDay, getMonth, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isToday, startOfYear, endOfYear, subYears, subMonths, startOfQuarter, endOfQuarter, subQuarters } from 'date-fns'

export function computeStats(trades) {
  if (!trades || trades.length === 0) return emptyStats()

  // Win/Loss/Breakeven classification uses GROSS P&L (before fees) — matches NinjaTrader convention
  const wins      = trades.filter(t => (t.gross_pnl ?? t.pnl) > 0)
  const losses    = trades.filter(t => (t.gross_pnl ?? t.pnl) < 0)
  const breakeven = trades.filter(t => (t.gross_pnl ?? t.pnl) === 0)
  const n = trades.length

  const totalPnl   = trades.reduce((s, t) => s + t.pnl, 0)
  // Gross win/loss dollar totals still based on NET P&L for financial accuracy (fees are real costs)
  const netWins    = trades.filter(t => t.pnl > 0)
  const netLosses  = trades.filter(t => t.pnl < 0)
  const grossWin   = netWins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss  = Math.abs(netLosses.reduce((s, t) => s + t.pnl, 0))
  const winRate    = n ? (wins.length / n) * 100 : 0
  const breakevenRate = n ? (breakeven.length / n) * 100 : 0
  const avgWin     = netWins.length ? grossWin / netWins.length : 0
  const avgLoss    = netLosses.length ? -(grossLoss / netLosses.length) : 0
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss
  const expectancy   = (winRate / 100) * avgWin + ((100 - winRate) / 100) * avgLoss
  const largestGain  = netWins.length ? Math.max(...netWins.map(t => t.pnl)) : 0
  const largestLoss  = netLosses.length ? Math.min(...netLosses.map(t => t.pnl)) : 0

  let maxConsecWins = 0, maxConsecLosses = 0, curWins = 0, curLosses = 0
  const sorted = [...trades].sort((a, b) => new Date(a.sold_at || 0) - new Date(b.sold_at || 0))
  for (const t of sorted) {
    if (t.pnl > 0) { curWins++; curLosses = 0; maxConsecWins = Math.max(maxConsecWins, curWins) }
    else { curLosses++; curWins = 0; maxConsecLosses = Math.max(maxConsecLosses, curLosses) }
  }

  let cumulative = 0
  const equityCurve = sorted.map(t => {
    cumulative += t.pnl
    return { date: t.sold_at, value: cumulative }
  })

  // Daily P&L bars (for bar chart above equity curve)
  const dailyMap = {}
  for (const t of sorted) {
    if (!t.sold_at) continue
    const key = format(new Date(t.sold_at), 'yyyy-MM-dd')
    dailyMap[key] = (dailyMap[key] || 0) + t.pnl
  }
  const dailyBars = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({ date, pnl }))

  let peak = 0, maxDD = 0
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value
    const dd = peak - p.value
    if (dd > maxDD) maxDD = dd
  }

  return {
    totalPnl, grossWin, grossLoss, winRate, breakevenRate, avgWin, avgLoss,
    profitFactor: isFinite(profitFactor) ? profitFactor : 999,
    expectancy, largestGain, largestLoss,
    wins: wins.length, losses: losses.length, breakeven: breakeven.length, total: n,
    maxConsecWins, maxConsecLosses, maxDrawdown: maxDD,
    equityCurve, dailyBars,
  }
}

// Lightweight aggregate for a set of trades — just pnl/trades/winRate, no
// equity curve or drawdown. Used by the Calendar page's day/month/year cells,
// which previously each reimplemented this same reduce+filter by hand.
export function aggregateTrades(trades) {
  const wins = trades.filter(t => (t.gross_pnl ?? t.pnl) > 0).length
  return {
    pnl: trades.reduce((s, t) => s + t.pnl, 0),
    trades: trades.length,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
  }
}

export function groupByMonth(trades) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const map = {}
  MONTHS.forEach((m, i) => { map[i] = { label: m, pnl: 0, trades: 0, wins: 0 } })

  for (const t of trades) {
    const d = t.sold_at ? parseISO(t.sold_at) : null
    if (!d) continue
    const m = getMonth(d)
    map[m].pnl += t.pnl; map[m].trades++
    if (t.pnl > 0) map[m].wins++
  }

  const vals = Object.values(map)
  const maxAbs = Math.max(...vals.map(v => Math.abs(v.pnl)), 0.01)
  const totalAbs = vals.reduce((s, v) => s + Math.abs(v.pnl), 0) || 1
  return vals.map(v => ({ ...v, width: (Math.abs(v.pnl) / maxAbs) * 100, pct: (v.pnl >= 0 ? 1 : -1) * (Math.abs(v.pnl) / totalAbs) * 100, winRate: v.trades ? (v.wins / v.trades) * 100 : 0 }))
}

export function groupByDow(trades) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const map = {}
  DAYS.forEach((d, i) => { map[i] = { label: d, pnl: 0, trades: 0, wins: 0 } })

  for (const t of trades) {
    const d = t.sold_at ? parseISO(t.sold_at) : null
    if (!d) continue
    const dow = getDay(d)
    map[dow].pnl += t.pnl; map[dow].trades++
    if (t.pnl > 0) map[dow].wins++
  }

  const vals = Object.values(map)
  const maxAbs = Math.max(...vals.map(v => Math.abs(v.pnl)), 0.01)
  const totalAbs = vals.reduce((s, v) => s + Math.abs(v.pnl), 0) || 1
  return vals.map(v => ({ ...v, width: (Math.abs(v.pnl) / maxAbs) * 100, pct: (v.pnl >= 0 ? 1 : -1) * (Math.abs(v.pnl) / totalAbs) * 100, winRate: v.trades ? (v.wins / v.trades) * 100 : 0 }))
}

// Resolves a card-local period option (independent of the dashboard's global
// 30d/60d/90d/1Y/All selector) to a concrete date range. `today` is passed in
// rather than read here so callers can supply the app's timezone-aware
// "today" (see useTimezoneStore) instead of a raw `new Date()`.
export function resolvePeriodRange(option, today) {
  if (typeof option === 'string' && option.startsWith('year:')) {
    const year = parseInt(option.slice('year:'.length), 10)
    const d = new Date(year, 0, 1)
    return { from: startOfYear(d), to: endOfYear(d) }
  }
  switch (option) {
    case 'thisYear':    return { from: startOfYear(today), to: endOfYear(today) }
    case 'lastYear':    { const d = subYears(today, 1);    return { from: startOfYear(d), to: endOfYear(d) } }
    case 'thisMonth':   return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'lastMonth':   { const d = subMonths(today, 1);   return { from: startOfMonth(d), to: endOfMonth(d) } }
    case 'thisQuarter': return { from: startOfQuarter(today), to: endOfQuarter(today) }
    case 'lastQuarter': { const d = subQuarters(today, 1); return { from: startOfQuarter(d), to: endOfQuarter(d) } }
    case 'all':
    default:             return { from: null, to: null }
  }
}

// Filters trades to a specific month-of-year (0=Jan..11=Dec), optionally
// within one specific calendar year. year=null matches that month across
// every year — used when the source period (e.g. the Month card's own
// selector) has no single year to anchor to.
export function filterTradesByMonth(trades, monthIndex, year) {
  return trades.filter(t => {
    if (!t.sold_at) return false
    const d = parseISO(t.sold_at)
    if (getMonth(d) !== monthIndex) return false
    if (year !== null && d.getFullYear() !== year) return false
    return true
  })
}

// Filters trades to a [from, to] window (inclusive), by sold_at. Passing
// nulls for both returns every trade unfiltered.
export function filterTradesByDateRange(trades, from, to) {
  if (!from && !to) return trades
  return trades.filter(t => {
    if (!t.sold_at) return false
    const d = parseISO(t.sold_at)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}

export function groupBySymbol(trades) {
  const map = {}
  for (const t of trades) {
    if (!map[t.symbol]) map[t.symbol] = { symbol: t.symbol, pnl: 0, trades: 0, wins: 0 }
    map[t.symbol].pnl += t.pnl; map[t.symbol].trades++
    if (t.pnl > 0) map[t.symbol].wins++
  }
  return Object.values(map).map(v => ({ ...v, winRate: v.trades ? (v.wins / v.trades) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl)
}

// Build a full Sun–Sat week containing today, with per-day stats
export function calendarWeek(trades) {
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 0 }) // Sunday
  const weekEnd   = endOfWeek(today,   { weekStartsOn: 0 }) // Saturday
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return days.map(d => {
    const ds = d.toDateString()
    const dayTrades = trades.filter(t => t.sold_at && new Date(t.sold_at).toDateString() === ds)
    const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0)
    const fees = dayTrades.reduce((s, t) => s + (t.fees || 0), 0)
    return {
      date: d,
      num: d.getDate(),
      dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
      monthName: d.toLocaleString('default', { month: 'short' }),
      pnl, fees,
      trades: dayTrades.length,
      wins:   dayTrades.filter(t => t.pnl > 0).length,
      losses: dayTrades.filter(t => t.pnl < 0).length,
      isToday: d.toDateString() === today.toDateString(),
      isFuture: d > today,
    }
  })
}

export function calendarDays(trades, count = 7) {
  return calendarWeek(trades)
}

export function calendarMonth(trades, currentDate) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
  const end   = endOfWeek(endOfMonth(currentDate),     { weekStartsOn: 0 })
  const days  = eachDayOfInterval({ start, end })

  return days.map(d => {
    const ds = d.toDateString()
    const dayTrades = trades.filter(t => t.sold_at && new Date(t.sold_at).toDateString() === ds)
    const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0)
    return {
      date: d, num: d.getDate(),
      inMonth: isSameMonth(d, currentDate),
      isToday:  isToday(d),
      isFuture: d > new Date(),
      pnl, trades: dayTrades.length,
      wins: dayTrades.filter(t => t.pnl > 0).length,
    }
  })
}

export function fmt(val, decimals = 2) {
  if (val === undefined || val === null || isNaN(val)) return '$0.00'
  const abs = Math.abs(val)
  const s = abs.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (val < 0 ? '-$' : '$') + s
}

// Drops trailing zeros after the decimal point ("42.50" -> "42.5",
// "42.00" -> "42") but never from the integer part ("150" stays "150").
const trimZeros = s => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)

// Abbreviated currency format: 15000 -> $15K, 2500000 -> $2.5M, etc.
// Falls back to normal fmt() for values under 10,000 to preserve precision
// for everyday trade/account figures.
export function fmtCompact(val, decimals = 2) {
  if (val === undefined || val === null || isNaN(val)) return '$0.00'
  const sign = val < 0 ? '-' : ''
  const abs = Math.abs(val)

  if (abs < 10000) return fmt(val)

  const units = [
    { value: 1e12, suffix: 'T' },
    { value: 1e9,  suffix: 'B' },
    { value: 1e6,  suffix: 'M' },
    { value: 1e3,  suffix: 'K' },
  ]

  for (let i = 0; i < units.length; i++) {
    const { value, suffix } = units[i]
    if (abs >= value) {
      let num = abs / value
      const roundThreshold = 1000 - (0.5 / Math.pow(10, decimals))
      if (num >= roundThreshold) {
        if (i > 0) {
          // Bump to the next larger unit (e.g. 999.995K -> 1M)
          num = abs / units[i - 1].value
          const trimmed = trimZeros(num.toFixed(decimals))
          return `${sign}$${trimmed}${units[i - 1].suffix}`
        }
        // No unit above T — clamp so it never shows "1000T"
        num = 1000 - (1 / Math.pow(10, decimals))
      }
      const trimmed = trimZeros(num.toFixed(decimals))
      return `${sign}$${trimmed}${suffix}`
    }
  }
  return fmt(val)
}

export function fmtPct(val) {
  const num = val || 0
  const fixed = num.toFixed(2)
  // Trim trailing zeros: "42.00" -> "42", "42.50" -> "42.5", "42.54" -> "42.54"
  const trimmed = trimZeros(fixed)
  return trimmed + '%'
}

function emptyStats() {
  return {
    totalPnl: 0, grossWin: 0, grossLoss: 0, winRate: 0,
    avgWin: 0, avgLoss: 0, profitFactor: 0, expectancy: 0,
    largestGain: 0, largestLoss: 0, wins: 0, losses: 0, breakeven: 0, breakevenRate: 0, total: 0,
    maxConsecWins: 0, maxConsecLosses: 0, maxDrawdown: 0, equityCurve: [], dailyBars: [],
  }
}

/**
 * Compute Max Drawdown and Peak Equity from raw chronological cash events
 * (Trade Paired, fees, Fund Transactions).
 *
 * Two modes:
 * - dailyReset=true: matches a single trading day's Max Drawdown exactly as
 *   platforms like NinjaTrader compute it — Fund Transactions are excluded
 *   entirely, and the running peak resets to the value of the FIRST
 *   transaction processed (not a fixed zero baseline). This means the very
 *   first loss of the day doesn't count as drawdown until the next event.
 * - dailyReset=false (default): continuous calculation used for weekly/
 *   monthly/all-time windows — balance and funding carry forward from
 *   before the window starts, giving the correct "entering equity" peak
 *   reference so a mid-week dip is measured against the week's true high,
 *   not reset every day.
 *
 * @param {Array} events - [{ timestamp: ISO string, type: string, delta: number }]
 * @param {string|null} from - ISO date string, inclusive start of window (null = from beginning)
 * @param {string|null} to   - ISO date string, inclusive end of window (null = to the end)
 * @param {boolean} dailyReset - use the daily-reset algorithm (see above)
 * @returns {{ maxDrawdown: number, peakEquity: number, realizedHighPnl: number }}
 */
export function computeDrawdownFromEvents(events, from = null, to = null, dailyReset = false) {
  if (!events || !events.length) return { maxDrawdown: 0, peakEquity: 0, realizedHighPnl: 0 }

  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  let maxDD = 0
  let peakEquity = 0
  let realizedHigh = 0
  let realizedCumulative = 0

  if (dailyReset) {
    // Daily-style: exclude Fund Transaction entirely, reset peak to the
    // first transaction's cumulative value within the window.
    let cumulative = 0
    let peak = null

    for (const e of sorted) {
      if (e.type === 'Fund Transaction') continue
      if (from && e.timestamp < from) continue
      if (to && e.timestamp > to) break

      cumulative += e.delta
      if (peak === null) peak = cumulative
      else if (cumulative > peak) peak = cumulative
      const dd = peak - cumulative
      if (dd > maxDD) maxDD = dd

      if (cumulative > realizedHigh) realizedHigh = cumulative
    }
    peakEquity = peak ?? 0
  } else {
    // Continuous: carries forward balance/funding from before the window.
    let balance = 0
    let totalFunding = 0
    let peak = null

    for (const e of sorted) {
      if (to && e.timestamp > to) break
      // Peak starts at the equity ENTERING the window — taken before the
      // first in-window event is applied, so a window that opens with a
      // loss counts that drop as drawdown.
      if (peak === null && !(from && e.timestamp < from)) peak = balance - totalFunding

      // Accumulate balance/funding for ALL events (even before window) to get
      // the correct entering-equity value when the window starts partway through history
      balance += e.delta
      if (e.type === 'Fund Transaction') totalFunding += e.delta

      if (from && e.timestamp < from) continue

      if (e.type !== 'Fund Transaction') {
        realizedCumulative += e.delta
        if (realizedCumulative > realizedHigh) realizedHigh = realizedCumulative
      }

      const adjustedEquity = balance - totalFunding
      if (adjustedEquity > peak) peak = adjustedEquity
      const dd = peak - adjustedEquity
      if (dd > maxDD) maxDD = dd
    }
    peakEquity = peak ?? 0
  }

  return {
    maxDrawdown: Math.round(maxDD * 100) / 100,
    peakEquity: Math.round(peakEquity * 100) / 100,
    realizedHighPnl: Math.round(realizedHigh * 100) / 100,
  }
}

/**
 * Compute a running account BALANCE curve (starting balance + cumulative
 * net P&L + fund transactions, applied chronologically) — as opposed to
 * the plain Equity Curve, which tracks P&L alone from a zero baseline.
 * A deposit or withdrawal mid-period shows as a visible step here.
 *
 * @param {Array} trades - closed trades with sold_at (ISO) and pnl
 * @param {Array} fundTransactions - [{ date: 'yyyy-MM-dd', amount }]
 * @param {number} startingBalance - account balance before the first event
 * @returns {Array<{date: string, value: number}>}
 */
export function computeBalanceCurve(trades, fundTransactions, startingBalance) {
  const events = []
  for (const t of trades) {
    if (!t.sold_at) continue
    events.push({ date: t.sold_at, delta: t.pnl })
  }
  for (const f of fundTransactions || []) {
    if (!f.date) continue
    events.push({ date: f.date, delta: f.amount })
  }
  events.sort((a, b) => a.date.localeCompare(b.date))

  let cumulative = startingBalance || 0
  return events.map(e => {
    cumulative += e.delta
    return { date: e.date, value: Math.round(cumulative * 100) / 100 }
  })
}

/**
 * Running capital BASE curve — starting balance adjusted only by
 * deposits/withdrawals over time, with trading P&L left out entirely. Used
 * to measure trading performance (%) against the capital actually at risk
 * at each point, without a withdrawal/deposit itself reading as a loss/gain.
 *
 * @param {Array} fundTransactions - [{ date: 'yyyy-MM-dd', amount }]
 * @param {number} startingBalance - account balance before the first deposit/withdrawal
 * @returns {Array<{date: string, value: number}>}
 */
export function computeFundBaseCurve(fundTransactions, startingBalance) {
  const events = (fundTransactions || [])
    .filter(f => f.date)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  let cumulative = startingBalance || 0
  return events.map(e => {
    cumulative += e.amount
    return { date: e.date, value: Math.round(cumulative * 100) / 100 }
  })
}

/**
 * Detect "revenge trading": trades opened shortly after a losing trade closed.
 * Compares win rate / avg P&L of those trades against everything else.
 *
 * @param {Array} trades - closed trades with sold_at, bought_at, pnl, gross_pnl
 * @param {number} windowMinutes - how soon after a loss counts as "revenge" (default 15)
 */
export function computeRevengeTrading(trades, windowMinutes = 15) {
  const sorted = [...trades]
    .filter(t => t.sold_at)
    .sort((a, b) => a.sold_at.localeCompare(b.sold_at))

  const revenge = []
  const normal = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const prevWasLoss = (prev.gross_pnl ?? prev.pnl) < 0
    const openTime = cur.bought_at || cur.sold_at
    const gapMin = (new Date(openTime) - new Date(prev.sold_at)) / 60000

    if (prevWasLoss && gapMin >= 0 && gapMin <= windowMinutes) {
      revenge.push(cur)
    } else {
      normal.push(cur)
    }
  }

  const winRateOf = list => {
    if (!list.length) return 0
    const wins = list.filter(t => (t.gross_pnl ?? t.pnl) > 0).length
    return (wins / list.length) * 100
  }
  const avgPnlOf = list => list.length ? list.reduce((s, t) => s + t.pnl, 0) / list.length : 0

  return {
    windowMinutes,
    revengeCount: revenge.length,
    normalCount: normal.length,
    revengeWinRate: winRateOf(revenge),
    normalWinRate: winRateOf(normal),
    revengeAvgPnl: avgPnlOf(revenge),
    normalAvgPnl: avgPnlOf(normal),
  }
}

/**
 * Compare performance on high-volume trading days vs normal days,
 * as a proxy for overtrading.
 *
 * @param {Array} trades - closed trades with sold_at, pnl, gross_pnl
 * @param {number} highVolumeThreshold - trades/day that counts as "high volume" (default 15)
 */
export function computeOvertrading(trades, highVolumeThreshold = 15) {
  const byDay = {}
  for (const t of trades) {
    const day = t.sold_at?.slice(0, 10)
    if (!day) continue
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(t)
  }

  const highVolume = []
  const normal = []
  for (const dayTrades of Object.values(byDay)) {
    const bucket = dayTrades.length >= highVolumeThreshold ? highVolume : normal
    bucket.push(...dayTrades)
  }

  const winRateOf = list => {
    if (!list.length) return 0
    const wins = list.filter(t => (t.gross_pnl ?? t.pnl) > 0).length
    return (wins / list.length) * 100
  }

  return {
    highVolumeThreshold,
    highVolumeDayCount: Object.values(byDay).filter(d => d.length >= highVolumeThreshold).length,
    highVolumeWinRate: winRateOf(highVolume),
    normalWinRate: winRateOf(normal),
    highVolumeTradeCount: highVolume.length,
    normalTradeCount: normal.length,
  }
}

/**
 * Win rate and P&L grouped by hour of day the trade closed.
 * @param {Array} trades - closed trades with sold_at, pnl, gross_pnl
 */
export function computeHourlyPerf(trades) {
  const byHour = Array.from({ length: 24 }, () => ({ wins: 0, total: 0, pnl: 0 }))
  for (const t of trades) {
    if (!t.sold_at) continue
    const hour = new Date(t.sold_at).getHours()
    byHour[hour].total++
    if ((t.gross_pnl ?? t.pnl) > 0) byHour[hour].wins++
    byHour[hour].pnl += t.pnl
  }
  return byHour
    .map((h, hour) => ({
      hour,
      trades: h.total,
      winRate: h.total ? (h.wins / h.total) * 100 : 0,
      pnl: Math.round(h.pnl * 100) / 100,
    }))
    .filter(h => h.trades > 0)
}

/**
 * Win rate and P&L split by trade side (long vs short).
 * @param {Array} trades - closed trades with side, pnl, gross_pnl
 */
export function computeSideBias(trades) {
  const long  = trades.filter(t => !t.side || t.side === 'long')
  const short = trades.filter(t => t.side === 'short')

  const summarize = list => {
    const wins = list.filter(t => (t.gross_pnl ?? t.pnl) > 0).length
    return {
      count: list.length,
      winRate: list.length ? (wins / list.length) * 100 : 0,
      pnl: Math.round(list.reduce((s, t) => s + t.pnl, 0) * 100) / 100,
    }
  }

  return { long: summarize(long), short: summarize(short) }
}
