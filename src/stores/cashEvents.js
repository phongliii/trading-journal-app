import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cashEventsAdapter } from '@/lib/cashEventsAdapter'
import { useAccountsStore } from './accounts'
import { useToast } from '@/composables/useToast'
import { reportCloudError } from '@/lib/cloudErrors'

const RELEVANT_TYPES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission', 'Trade Paired', 'Fund Transaction'])

// Cloud-only now (see lib/cashEventsAdapter.js) — no localStorage copy.
// `events` starts empty and is populated by load() (called from App.vue
// once signed in, same gating as trades/journal/balance). This feeds
// drawdown/peak-equity math directly, so a failed write surfaces via toast
// instead of failing silently.

export const useCashEventsStore = defineStore('cashEvents', () => {
  // Each event: { id, timestamp (ISO string), type, delta }
  const accountsStore = useAccountsStore()
  const events = ref([])
  const loading = ref(false)
  const loaded  = ref(false)
  const toast = useToast()

  // Coalesce concurrent calls into one shared in-flight promise instead of
  // starting a second, overlapping doLoad() — same fix, same reasoning, as
  // stores/journal.js's load() (see its comment for the race this closes).
  // Without this, the sign-in sequence's own cashEventsStore.load() could
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
      const fresh = await cashEventsAdapter.load(accountsStore.activeAccountId)
      // Same reasoning as trades.js's doLoad(): skip replacing `events`
      // when a reload comes back identical to what's already here, so an
      // unchanged background refresh doesn't hand drawdown/equity
      // calculations a new (but equal) array reference and redraw
      // anything depending on it for no reason. `loaded` is still set
      // unconditionally — this only ever skips the DATA reassignment.
      if (JSON.stringify(fresh) !== JSON.stringify(events.value)) events.value = fresh
      loaded.value = true
    } catch (e) {
      reportCloudError(toast, e, 'Could not load cash events from the cloud:',
        'Could not load your cash events from the cloud — try reloading the page.')
    } finally {
      loading.value = false
    }
  }

  async function saveToCloud() {
    try {
      await cashEventsAdapter.save(accountsStore.activeAccountId, events.value)
    } catch (e) {
      reportCloudError(toast, e, 'Could not save cash events to the cloud:',
        'Could not save your cash events to the cloud — try again.')
    }
  }

  async function mergeEvents(newEvents) {
    const existingIds = new Set(events.value.map(e => e.id))
    const fresh = newEvents.filter(e => !existingIds.has(e.id))
    if (fresh.length) {
      events.value = [...events.value, ...fresh].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      await saveToCloud()
    }
    return fresh.length
  }

  async function removeInRange(start, end) {
    events.value = events.value.filter(e => e.timestamp < start || e.timestamp > end)
    await saveToCloud()
  }

  async function clearAll() {
    events.value = []
    await saveToCloud()
  }

  return { events, loading, loaded, load, mergeEvents, removeInRange, clearAll, RELEVANT_TYPES }
})
