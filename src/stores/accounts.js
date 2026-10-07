import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { accountsAdapter } from '@/lib/accountsAdapter'
import { useToast } from '@/composables/useToast'
import { reportCloudError } from '@/lib/cloudErrors'

// Which portfolio is "active" (what the rest of the app's cloud-only
// stores load) is pure view state, same reasoning as trades.js's `period`
// or JournalView's active tab — it only decides what you're LOOKING at
// right now, not data that needs to follow you across devices. Kept in
// localStorage, not synced to the cloud, and reconciled against whatever
// portfolios actually exist every time the list loads (ACTIVE_KEY below).
const ACTIVE_KEY = 'edgelog:activeAccountId'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const activeAccountId = ref(localStorage.getItem(ACTIVE_KEY) || null)
  const loading = ref(false)
  const loaded  = ref(false)
  const toast = useToast()

  const activeAccount = computed(() => accounts.value.find(a => a.id === activeAccountId.value) || null)

  function setActive(id) {
    activeAccountId.value = id
    localStorage.setItem(ACTIVE_KEY, id)
  }

  // Resolves a valid active account from whatever's actually in `accounts`
  // — the id a previous session left in localStorage might belong to a
  // portfolio that's since been deleted (on this device or another one),
  // or this might be the very first load with nothing saved yet.
  function reconcileActive() {
    if (accounts.value.some(a => a.id === activeAccountId.value)) return
    const first = accounts.value[0]
    if (first) setActive(first.id)
  }

  // Coalesce concurrent calls into one shared in-flight promise instead of
  // starting a second, overlapping doLoad() — same fix, same reasoning, as
  // stores/journal.js's load() (see its comment for the race this closes).
  let loadPromise = null
  async function load() {
    if (loadPromise) return loadPromise
    loadPromise = doLoad().finally(() => { loadPromise = null })
    return loadPromise
  }
  async function doLoad() {
    loading.value = true
    try {
      let list = await accountsAdapter.list()
      // Brand-new user, first sign-in ever: give them one portfolio to
      // start with rather than showing an empty switcher with nothing to
      // pick — mirrors the one-time SQL backfill that gives every
      // EXISTING user a "Portfolio 1" the moment this feature ships.
      if (!list.length) {
        const created = await accountsAdapter.create('Portfolio 1')
        list = [created]
      }
      accounts.value = list
      reconcileActive()
      loaded.value = true
    } catch (e) {
      reportCloudError(toast, e, 'Could not load portfolios from the cloud:',
        'Could not load your portfolios from the cloud — try reloading the page.')
    } finally {
      loading.value = false
    }
  }

  async function whenLoaded() {
    if (loaded.value) return
    if (loadPromise) await loadPromise
  }

  // AddTextItemModal (the only caller today) already blocks an empty/
  // whitespace-only name at the UI layer, but the store is the actual data
  // boundary — anything that calls createAccount/renameAccount directly
  // (a future caller, a console slip, a bad merge) shouldn't be able to
  // write a blank portfolio name just because that one modal happened to
  // guard it.
  async function createAccount(name) {
    const trimmed = (name || '').trim()
    if (!trimmed) {
      toast.error('Portfolio name cannot be empty.')
      return null
    }
    try {
      const created = await accountsAdapter.create(trimmed)
      accounts.value = [...accounts.value, created]
      return created
    } catch (e) {
      reportCloudError(toast, e, 'Could not create portfolio in the cloud:',
        'Could not create that portfolio — try again.')
      return null
    }
  }

  async function renameAccount(id, name) {
    const trimmed = (name || '').trim()
    if (!trimmed) {
      toast.error('Portfolio name cannot be empty.')
      return
    }
    const prev = accounts.value
    accounts.value = accounts.value.map(a => a.id === id ? { ...a, name: trimmed } : a)
    try {
      await accountsAdapter.rename(id, trimmed)
    } catch (e) {
      accounts.value = prev
      reportCloudError(toast, e, 'Could not rename portfolio in the cloud:',
        'Could not rename that portfolio — try again.')
    }
  }

  // Refuses to delete the last remaining portfolio — the rest of the app
  // (trades/journal/balance/etc.) assumes there's always at least one
  // active account to load, and "zero portfolios" has no sensible UI
  // state short of immediately recreating a default one anyway.
  async function deleteAccount(id) {
    if (accounts.value.length <= 1) {
      toast.error('You need at least one portfolio — create another before deleting this one.')
      return false
    }
    const wasActive = activeAccountId.value === id
    try {
      await accountsAdapter.remove(id)
    } catch (e) {
      reportCloudError(toast, e, 'Could not delete portfolio in the cloud:',
        'Could not delete that portfolio — try again.')
      return false
    }
    accounts.value = accounts.value.filter(a => a.id !== id)
    if (wasActive) reconcileActive()
    return true
  }

  return {
    accounts, activeAccountId, activeAccount, loading, loaded,
    load, whenLoaded, setActive, createAccount, renameAccount, deleteAccount,
  }
})
