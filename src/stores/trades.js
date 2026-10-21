import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { adapter } from '@/lib/storage'
import { computeStats } from '@/lib/stats'
import { useAccountsStore } from './accounts'
import { sharedLoad } from '@/lib/sharedLoad'

// Exact content comparison (not just length) — used by doLoad() to decide
// whether a reload actually found anything different before replacing the
// reactive array. JSON.stringify is simple and correct here (catches any
// field changing, not just a hand-picked subset) and trade lists are small
// enough that the cost is a non-issue next to the network round-trip that
// just happened anyway.
function withDuration(t) {
  if (t.duration || !t.bought_at || !t.sold_at) return t
  const s = Math.floor(Math.abs(new Date(t.sold_at) - new Date(t.bought_at)) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return { ...t, duration: h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s` }
}

function sameTrades(a, b) {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
}

export const useTradesStore = defineStore('trades', () => {
  const accountsStore = useAccountsStore()
  const trades  = ref([])
  const loading = ref(false)
  const error   = ref(null)
  const loaded  = ref(false) // a load has finished at least once
  // Portfolio whose load last finished (ok or not) — Dashboard waits for
  // trades, balance and cash events to all match the active one.
  const settledFor = ref(null)

  // Coalesce concurrent calls into one shared in-flight promise instead of
  // starting a second, overlapping doLoad() — same fix, same reasoning, as
  // stores/journal.js's load() (see its comment for the race this closes).
  // Without this, the sign-in sequence's own tradesStore.load() could
  // overlap with a near-simultaneous throttled focus/nav refresh or the
  // activeAccountId watch (both call load() independently), firing two
  // network requests and two redundant re-renders for one page visit —
  // this is the "dashboard fetches data too many times" symptom, since
  // Dashboard is the page that reads trades/balance/cashEvents together.
  // Shared only for the same portfolio — see lib/sharedLoad.js.
  const load = sharedLoad(() => accountsStore.activeAccountId, () => doLoad())
  async function doLoad() {
    loading.value = true
    error.value   = null
    const accountId = accountsStore.activeAccountId
    try {
      // Fill in a missing duration from the open/close times. Done on the
      // fresh rows BEFORE comparing: it's display-only and never saved
      // (the cloud adapter has no bulk save), so comparing the raw rows
      // against already-filled ones made every reload look "changed" and
      // redrew every chart on each tab focus / page change.
      const fresh = (await adapter.loadTrades(accountId)).map(withDuration)
      // Skip reassigning when a reload returns exactly what's already
      // here — every background refresh (navigation, tab focus; see
      // lib/cloudSync.js) is a real possibility even when nothing has
      // actually changed since the last visit. Replacing trades.value
      // with a brand-new (but equal) array would give every computed/
      // component that reads it — Dashboard's charts in particular — a new
      // reference to react to, redrawing them for no reason.
      if (sameTrades(fresh, trades.value)) return
      trades.value = fresh
    }
    catch (e) { error.value = e.message }
    finally { loading.value = false; loaded.value = true; settledFor.value = accountId }
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

  // ── Analytics (every trade — there's no global period filter) ─────
  const stats     = computed(() => computeStats(trades.value))
  const totalFees = computed(() => {
    const sum = trades.value.reduce((s, t) => s + (t.fees || 0), 0)
    return Math.round(sum * 100) / 100
  })

  return {
    trades, loading, loaded, settledFor, error,
    stats, totalFees,
    load, insertTrades, deleteTrade, deleteTrades, updateTrade, clearAll,
  }
})
