import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTradesStore } from './trades'
import { useAccountsStore } from './accounts'
import { balanceAdapter } from '@/lib/balanceAdapter'
import { useToast } from '@/composables/useToast'
import { reportCloudError, reportLoadError, loadWithRetry } from '@/lib/cloudErrors'
import { computeCorrectStarting, computeCurrentBalance, mergeFundTransactions, withoutCancelledWithdrawals } from '@/lib/balance'
import { sharedLoad } from '@/lib/sharedLoad'

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
  // Shared only for the same portfolio — see lib/sharedLoad.js.
  const load = sharedLoad(() => accountsStore.activeAccountId, () => doLoad())
  let loadedFor = null // portfolio whose data is in `data` (see reportLoadError)
  const settledFor = ref(null) // portfolio whose load last finished, ok or not (Dashboard waits on it)
  async function doLoad() {
    loading.value = true
    const accountId = accountsStore.activeAccountId
    try {
      const fresh = await loadWithRetry(() => balanceAdapter.load(accountId))
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
      loadedFor = accountId
    } catch (e) {
      reportLoadError(toast, e, loadedFor === accountId, 'Could not load balance from the cloud:',
        'Could not load your balance from the cloud — try reloading the page.')
    } finally {
      settledFor.value = accountId
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

  // Matched by broker Transaction ID (see lib/balance.js), so two real
  // same-day, same-amount deposits/withdrawals are both kept.
  async function mergeTransactions(newTxns) {
    const { merged, added } = mergeFundTransactions(data.value.fundTransactions, newTxns)
    // Nothing new (a re-imported Cash file) → leave the data alone: a new
    // object would redraw every chart reading it, and re-save for nothing.
    // (added can be 0 while an older entry still gets its ID filled in.)
    if (JSON.stringify(merged) === JSON.stringify(data.value.fundTransactions)) return 0
    const approvedBefore = withoutCancelledWithdrawals(data.value.fundTransactions || []).length
    data.value = { ...data.value, fundTransactions: merged }
    await saveToCloud()
    // How many new deposits/withdrawals actually count — an unapproved
    // withdrawal and its refund are saved (for re-import matching) but not
    // reported, the same as they're not shown.
    // (Can go down: a refund imported later cancels a withdrawal already
    // saved — nothing new to report then.)
    return added && Math.max(0, withoutCancelledWithdrawals(merged).length - approvedBefore)
  }

  async function clearFundTransactions() {
    data.value = { ...data.value, fundTransactions: [] }
    await saveToCloud()
  }

  async function clearBalance() {
    data.value = { ...data.value, rawStarting: null, earliestBalanceDate: null }
    await saveToCloud()
  }

  // Without unapproved withdrawals (withdrawal + same-amount refund) —
  // see withoutCancelledWithdrawals. The saved list keeps them, so a
  // re-import still recognises them by Transaction ID.
  const fundTransactions  = computed(() => withoutCancelledWithdrawals(data.value.fundTransactions || []))
  // Every saved one, unapproved withdrawals included (Settings lists them with a status).
  const allFundTransactions = computed(() => data.value.fundTransactions || [])
  const totalFundFlow     = computed(() => fundTransactions.value.reduce((s, t) => s + t.amount, 0))
  const hasBalance    = computed(() => data.value.rawStarting !== null && data.value.rawStarting !== undefined)

  // See lib/balance.js. Always every trade (tradesStore.trades).
  const correctStarting = computed(() =>
    computeCorrectStarting(data.value, fundTransactions.value, tradesStore.trades))
  const currentBalance = computed(() =>
    computeCurrentBalance(data.value, fundTransactions.value, tradesStore.trades))

  // Keep startingBalance as alias for display in settings
  const startingBalance = computed(() => data.value.rawStarting)
  const earliestBalanceDate = computed(() => data.value.earliestBalanceDate)

  return {
    loading, loaded, settledFor, load,
    startingBalance, earliestBalanceDate, correctStarting, fundTransactions, allFundTransactions, totalFundFlow, hasBalance, currentBalance,
    setStartingBalance, setFundTransactions, mergeTransactions, clearBalance, clearFundTransactions,
  }
})
