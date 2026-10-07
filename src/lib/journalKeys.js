// Canonical "date → journal entry key" builder(s), shared by every page that
// links into the Journal (Calendar's day/week click-throughs, Journal's own
// "+ New" picker) so the ISO week numbering and Monday-start convention
// live in exactly one place instead of being reimplemented per call site.
import { startOfWeek, getWeek } from 'date-fns'

// 'yyyy-Www' — Monday-start week, matching the trading week (and the
// Calendar page's own Mon–Fri week rows).
export function weekKey(date) {
  const ws = startOfWeek(date, { weekStartsOn: 1 })
  return `${ws.getFullYear()}-W${String(getWeek(ws, { weekStartsOn: 1 })).padStart(2, '0')}`
}
