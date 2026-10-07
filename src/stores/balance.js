import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTradesStore } from './trades'
import { useAccountsStore } from './accounts'
import { balanceAdapter } from '@/lib/balanceAdapter'
import { useToast } from '@/composables/useToast'
import { reportCloudError } from '@/lib/cloudErrors'

// Cloud-only now (see lib/balanceAdapter.js) — no localStorage copy. `data`
// starts empty and is populated by load() (called from App.vue once
// signed in, same gating as trades/journal/rawCsvArchive). This directly
// drives currentBalance's math, so a failed write surfaces via toast
// instead of failing silently — there's no local fallback to catch it.

function emptyData() {
  return { rawStarting: null, earliestBalanceDate: null, fundTransactions: [] }
}

export const useBalanceStore = defineStore('balance', () => {
  const data = ref(emptyData())
  const loading = ref(false)
  const loaded  = ref(false)
  const toast = useToast()

  const tradesStore = useTradesStore()
  const accountsStore = useAccountsStore()

  // Coalesce concurrent calls into one shared in-flight promise instead of
  // starting a second, overlapping doLoad() — same fix, same reasoning, as
  // stores/journal.js's load() (see its comment for the race this closes).
  // Without this, the sign-in sequence's own balanceStore.load() could
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
    try {
      const fresh = await balanceAdapter.load(accountsStore.activeAccountId)
      // Same reasoning as trades.js's doLoad(): skip replacing `data`
      // when a reload comes back identical to what's already here.
      // fundTransactions feeds the equity curve directly — a new (but
      // equal) array reference on a no-op background refresh redraws
      // that chart for no reason, even though nothing on screen actually
      // changed. `loaded` is still set unconditionally below — this only
      // ever skips the DATA reassignment, never the "a load has
      // happened" flag Dashboard's skeleton gate depends on.
      if (JSON.stringify(fresh) !== JSON.stringify(data.value)) data.value = fresh
      loaded.value = true
    } catch (e) {
      reportCloudError(toast, e, 'Could not load balance from the cloud:',
        'Could not load your balance from the cloud — try reloading the page.')
    } finally {
      loading.value = false
    }
  }

  async function saveToCloud() {
    try {
      await balanceAdapter.save(accountsStore.activeAccountId, data.value)
    } catch (e) {
      reportCloudError(toast, e, 'Could not save balance to the cloud:',
        'Could not save your balance to the cloud — try again.')
    }
  }

  async function setStartingBalance(rawStarting, earliestBalanceDate) {
    data.value = { ...data.value, rawStarting, earliestBalanceDate }
    await saveToCloud()
  }

  async function setFundTransactions(txns) {
    data.value = { ...data.value, fundTransactions: txns }
    await saveToCloud()
  }

  async function mergeTransactions(newTxns) {
    const existing = new Set(data.value.fundTransactions.map(t => `${t.date}|${t.amount}`))
    const fresh = newTxns.filter(t => !existing.has(`${t.date}|${t.amount}`))
    data.value = {
      ...data.value,
      fundTransactions: [...data.value.fundTransactions, ...fresh].sort((a, b) => a.date.localeCompare(b.date))
    }
    await saveToCloud()
    return fresh.length
  }

  async function clearFundTransactions() {
    data.value = { ...data.value, fundTransactions: [] }
    await saveToCloud()
  }

  async function clearBalance() {
    data.value = { ...data.value, rawStarting: null, earliestBalanceDate: null }
    await saveToCloud()
  }

  const fundTransactions  = computed(() => data.value.fundTransactions || [])
  const totalFundFlow     = computed(() => fundTransactions.value.reduce((s, t) => s + t.amount, 0))
  const hasBalance    = computed(() => data.value.rawStarting !== null && data.value.rawStarting !== undefined)

  // Correct starting = rawStarting - funds on or before earliest balance
  // date - realized P&L from trades strictly before that date.
  //
  // rawStarting (from csvParser's parseBalanceHistory) is the broker's
  // real account value at the START of day1 — day1's own realized P&L is
  // already subtracted out there, but every trade that closed BEFORE day1
  // is a real past event already baked into that number. currentBalance
  // below adds tradesStore.stats.totalPnl, which sums EVERY trade
  // currently in the store with no date filter — so without subtracting
  // it back out here, any trade dated before day1 gets counted twice:
  // once already inside rawStarting, once again via totalPnl. This used
  // to only bite in a particular order ("import trades first, including
  // ones older than your balance history's first day, then set up the
  // balance" — the bug was in the DATA, not the order, but that's the
  // workflow that surfaces it), and the equivalent subtraction already
  // existed for fund transactions just below — trades just never got it.
  const correctStarting = computed(() => {
    if (!hasBalance.value) return 0
    const day1 = data.value.earliestBalanceDate
    if (!day1) return data.value.rawStarting ?? 0
    const day1Funds = fundTransactions.value.filter(t => t.date <= day1).reduce((s, t) => s + t.amount, 0)
    const priorPnl = tradesStore.trades
      .filter(t => t.sold_at && t.sold_at.slice(0, 10) < day1)
      .reduce((s, t) => s + t.pnl, 0)
    return (data.value.rawStarting ?? 0) - day1Funds - priorPnl
  })

  // With balance: correctStarting + totalNetPnl + totalFundFlow
  // Without balance: totalNetPnl only
  const currentBalance = computed(() => {
    if (!hasBalance.value) return tradesStore.stats.totalPnl
    return correctStarting.value + tradesStore.stats.totalPnl + totalFundFlow.value
  })

  // Keep startingBalance as alias for display in settings
  const startingBalance = computed(() => data.value.rawStarting)
  const earliestBalanceDate = computed(() => data.value.earliestBalanceDate)

  return {
    loading, loaded, load,
    startingBalance, earliestBalanceDate, correctStarting, fundTransactions, totalFundFlow, hasBalance, currentBalance,
    setStartingBalance, setFundTransactions, mergeTransactions, clearBalance, clearFundTransactions,
  }
})
