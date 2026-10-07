import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { adapter } from '@/lib/storage'
import { computeStats, groupByMonth, groupByDow, groupBySymbol, calendarDays } from '@/lib/stats'
import { subDays, parseISO } from 'date-fns'
import { useAccountsStore } from './accounts'

const PERIOD_KEY = 'edgelog:period'

// Exact content comparison (not just length) — used by doLoad() to decide
// whether a reload actually found anything different before replacing the
// reactive array. JSON.stringify is simple and correct here (catches any
// field changing, not just a hand-picked subset) and trade lists are small
// enough that the cost is a non-issue next to the network round-trip that
// just happened anyway.
function sameTrades(a, b) {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

export const useTradesStore = defineStore('trades', () => {
  const accountsStore = useAccountsStore()
  const trades  = ref([])
  const loading = ref(false)
  const error   = ref(null)

  // Restore saved period, default 7
  const savedPeriod = localStorage.getItem(PERIOD_KEY)
  const period = ref(savedPeriod ? Number(savedPeriod) : 30)
  watch(period, v => localStorage.setItem(PERIOD_KEY, String(v)))

  // Coalesce concurrent calls into one shared in-flight promise instead of
  // starting a second, overlapping doLoad() — same fix, same reasoning, as
  // stores/journal.js's load() (see its comment for the race this closes).
  // Without this, the sign-in sequence's own tradesStore.load() could
  // overlap with a near-simultaneous throttled focus/nav refresh or the
  // activeAccountId watch (both call load() independently), firing two
  // network requests and two redundant re-renders for one page visit —
  // this is the "dashboard fetches data too many times" symptom, since
  // Dashboard is the page that reads trades/balance/cashEvents together.
  let loadPromise = null
  async function load() {
    if (loadPromise) return loadPromise
    loadPromise = doLoad().finally(() => { loadPromise = null })
    return loadPromise
  }
  async function doLoad() {
    loading.value = true
    error.value   = null
    try {
      const fresh = await adapter.loadTrades(accountsStore.activeAccountId)
      // Skip reassigning when a reload returns exactly what's already
      // here — every background refresh (navigation, tab focus; see
      // lib/cloudSync.js) is a real possibility even when nothing has
      // actually changed since the last visit. Replacing trades.value
      // with a brand-new (but equal) array on a no-op reload gives every
      // computed/component that reads it — Dashboard's charts, in
      // particular — a new reference to react to, which redraws them even
      // though nothing on screen actually changed: a visible flicker for
      // no reason. Comparing first means an unchanged reload leaves the
      // existing array alone, so nothing downstream re-renders.
      if (sameTrades(fresh, trades.value)) return
      trades.value = fresh
      // Migrate: calculate duration for trades missing it
      let migrated = false
      trades.value = trades.value.map(t => {
        if (!t.duration && t.bought_at && t.sold_at) {
          const diffMs = Math.abs(new Date(t.sold_at) - new Date(t.bought_at))
          const s = Math.floor(diffMs / 1000)
          const h = Math.floor(s / 3600)
          const m = Math.floor((s % 3600) / 60)
          const sec = s % 60
          const duration = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`
          migrated = true
          return { ...t, duration }
        }
        return t
      })
      if (migrated) await adapter.saveTrades(trades.value)
    }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function insertTrades(newTrades) {
    loading.value = true
    try {
      const result = await adapter.insertTrades(newTrades, trades.value, accountsStore.activeAccountId)
      // Use the adapter's own merged list rather than prepending records to
      // the array we passed in — a re-import can update existing trades in
      // place (matched by broker_id), and those updates live only in what
      // the adapter returns, not in our stale `trades.value` reference.
      trades.value = result.all
      return { inserted: result.inserted, updated: result.updated, skipped: result.skipped }
    } finally { loading.value = false }
  }

  async function deleteTrade(id) {
    trades.value = await adapter.deleteTrade(id, trades.value)
  }

  async function deleteTrades(ids) {
    trades.value = await adapter.deleteTrades(ids, trades.value)
  }

  async function updateTrade(id, patch) {
    trades.value = await adapter.updateTrade(id, patch, trades.value)
  }

  async function clearAll() {
    await adapter.clearAll(accountsStore.activeAccountId)
    trades.value = []
  }

  // ── Period filter (7 | 30 | 60 | 90 | 0=all) ─────────────────
  const filteredTrades = computed(() => {
    if (period.value === 0) return trades.value
    const cutoff = subDays(new Date(), period.value)
    return trades.value.filter(t => {
      if (!t.sold_at) return true
      return parseISO(t.sold_at) >= cutoff
    })
  })
  // ── Analytics ─────────────────────────────────────────────────
  const stats      = computed(() => computeStats(filteredTrades.value))
  const monthPerf  = computed(() => groupByMonth(filteredTrades.value))
  const dowPerf    = computed(() => groupByDow(filteredTrades.value))
  const symbolPerf = computed(() => groupBySymbol(filteredTrades.value))
  const calendar   = computed(() => calendarDays(filteredTrades.value, 7))

  const totalFees  = computed(() => {
    const sum = filteredTrades.value.reduce((s, t) => s + (t.fees || 0), 0)
    return Math.round(sum * 100) / 100
  })

  // Day win rate = % of trading days that were profitable
  const dayWinRate = computed(() => {
    const byDay = {}
    for (const t of filteredTrades.value) {
      if (!t.sold_at) continue
      const key = new Date(t.sold_at).toDateString()
      byDay[key] = (byDay[key] || 0) + t.pnl
    }
    const days = Object.values(byDay)
    if (!days.length) return 0
    return (days.filter(p => p > 0).length / days.length) * 100
  })

  return {
    trades, filteredTrades, loading, error, period,
    stats, monthPerf, dowPerf, symbolPerf, calendar, totalFees, dayWinRate,
    load, insertTrades, deleteTrade, deleteTrades, updateTrade, clearAll,
  }
})
