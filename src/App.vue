<template>
  <div class="flex h-screen bg-surface-0 overflow-hidden">
    <!-- Before the router's first navigation resolves (awaiting the auth
         guard), route.name is still undefined — show a loading state
         instead of a blank screen so that wait doesn't feel like a stall.
         On a hard refresh of /login specifically, the guard's login branch
         returns immediately without awaiting anything, so this is only up
         for an instant there — but it was still showing the full app shell
         (sidebar + topbar skeleton), which looked wrong on a page that
         never has that chrome. isLoginPath reads the URL directly
         (available before Vue Router resolves anything) so that one case
         gets a bare, chrome-free loading state instead. -->
    <div v-if="!route.name && isLoginPath" class="flex-1 flex items-center justify-center">
      <div class="w-11 h-11 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center animate-pulse">
        <svg class="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      </div>
    </div>
    <!-- Also cover the gap AFTER the router resolves but BEFORE the first
         cloud load (trades/journal/read-status/etc.) has actually landed —
         without this, a hard refresh briefly rendered the real chrome with
         empty/default store state (e.g. every journal entry looking
         unread, since readList.value starts empty) and then visibly
         popped to the correct data a moment later once loadCloudData()
         resolved. Only gates the FIRST load per sign-in (initialCloudLoadDone
         never resets to false again), so the throttled background
         refreshes (tab focus, nav, portfolio switch) stay silent/non-
         blocking as before — this is purely about hiding the one-time
         "empty, then pop" flash on initial load/refresh. -->
    <AppShellSkeleton v-else-if="!route.name || (showChrome && !initialCloudLoadDone)" :page="route.name || null" />

    <template v-else>
      <AppSidebar v-if="showChrome" />

      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppTopbar v-if="showChrome" />

        <main id="main-scroll" class="flex-1 overflow-y-auto overflow-x-auto">
          <router-view v-slot="{ Component, route }">
            <!-- No animated name (so no matching CSS, hence no fade/slide)
                 whenever either side of this swap is a hideChrome route
                 (i.e. the login page) — the sidebar/topbar already vanish
                 instantly on that transition (showChrome is keyed off the
                 same route.meta.hideChrome), so the page content should
                 snap away with them instead of lingering through its own
                 ~150ms fade-out after the chrome is already gone. -->
            <transition :name="route.meta.hideChrome ? '' : 'page'" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
        </main>
      </div>
    </template>

    <ToastStack />
    <ConfirmModal />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { prefetchLoginView } from '@/router'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { useTradesStore } from '@/stores/trades'
import { useBalanceStore } from '@/stores/balance'
import { useCashEventsStore } from '@/stores/cashEvents'
import { useTimezoneStore } from '@/stores/timezone'
import { useHolidayStore } from '@/stores/holidays'
import { useWithdrawReminderStore } from '@/stores/withdrawReminder'
import { useImageStorageStore } from '@/stores/imageStorage'
import { useTradeMetaStore } from '@/stores/tradeMeta'
import { useTradingRulesStore } from '@/stores/tradingRules'
import { useSettingsStore } from '@/stores/settings'
import { useJournalStore } from '@/stores/journal'
import { useRawCsvArchiveStore } from '@/stores/rawCsvArchive'
import { useAccountsStore } from '@/stores/accounts'
import { useAuthStore } from '@/stores/auth'
import { syncSettingsOnLoad } from '@/lib/cloudSettings'
import { registerStore, requestCloudRefresh, markCloudRefreshed, setCloudSyncReady, PAGE_STORES } from '@/lib/cloudSync'
import { useToast } from '@/composables/useToast'
import AppSidebar   from '@/components/layout/AppSidebar.vue'
import AppTopbar    from '@/components/layout/AppTopbar.vue'
import ToastStack   from '@/components/ui/ToastStack.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import AppShellSkeleton from '@/components/layout/AppShellSkeleton.vue'

const route = useRoute()
// Routes like /login opt out of the app chrome (sidebar/topbar) via
// meta.hideChrome — a login page shouldn't show navigation to pages you
// can't use yet.
//
// route.name is also checked here: before the router's very first
// navigation resolves (which now awaits the async auth guard in
// router/index.js), useRoute() returns Vue Router's internal "unresolved"
// placeholder (START_LOCATION) — its meta is {} and its name is undefined.
// Without this check, !route.meta.hideChrome defaults to true on that
// placeholder, so the sidebar/topbar would flash visible for a moment
// before the guard redirects an unauthenticated visitor to /login.
const showChrome = computed(() => !!route.name && !route.meta.hideChrome)

// Read synchronously from the URL, not from `route` (which isn't resolved
// yet at this point) — used only to pick the right loading state above.
const isLoginPath = window.location.pathname === '/login'

const tradesStore    = useTradesStore()
const balanceStore   = useBalanceStore()
const cashEventsStore = useCashEventsStore()
const tzStore        = useTimezoneStore()
const holidayStore   = useHolidayStore()
const withdrawReminderStore = useWithdrawReminderStore()
const imageStorageStore = useImageStorageStore()
const tradeMetaStore    = useTradeMetaStore()
const tradingRulesStore = useTradingRulesStore()
const settingsStore     = useSettingsStore()
const journalStore      = useJournalStore()
const rawCsvArchiveStore = useRawCsvArchiveStore()
const accountsStore      = useAccountsStore()
const authStore         = useAuthStore()
const toast          = useToast()

// Weekly withdraw-reminder cycle:
// - Starts on the first trading day of the week (Monday, or later if
//   Monday/Tuesday/... are holidays).
// - From there, checks every trading day: if a withdrawal (from an
//   imported Cash History file) has landed since Monday, the week is
//   "resolved" and it goes quiet for the rest of the week. Otherwise, if
//   the balance is still at/above the threshold, it toasts again — once
//   per calendar day, tracked via lastShownDate.
// - Rolls over automatically once the week (its Monday) changes.
function checkWithdrawReminder() {
  if (!withdrawReminderStore.enabled) return
  const threshold = Number(withdrawReminderStore.amount)
  if (!Number.isFinite(threshold) || threshold <= 0) return

  const today = tzStore.localDateObj()
  const todayStr = format(today, 'yyyy-MM-dd')
  if (withdrawReminderStore.lastShownDate === todayStr) return

  const isWeekend = today.getDay() === 0 || today.getDay() === 6
  if (isWeekend || holidayStore.isHoliday(todayStr)) return

  // Today already passed the weekend/holiday check above, so it's
  // necessarily on or after this week's first trading day — no separate
  // guard needed for that.
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd    = endOfWeek(today, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr    = format(weekEnd, 'yyyy-MM-dd')

  withdrawReminderStore.ensureWeek(weekStartStr)
  if (withdrawReminderStore.weekResolved) return

  const withdrawnThisWeek = balanceStore.fundTransactions.some(
    t => t.type === 'withdrawal' && t.date >= weekStartStr && t.date <= weekEndStr
  )
  if (withdrawnThisWeek) {
    withdrawReminderStore.markWeekResolved()
    return
  }

  if (balanceStore.currentBalance >= threshold) {
    const amountStr = balanceStore.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    toast.warn(`Balance is $${amountStr} — consider withdrawing.`)
    withdrawReminderStore.markShown(todayStr)
  }
}

// Warm the (lazy-loaded) Login page's chunk in the background once the
// browser is idle, so it's normally already cached by the time someone
// actually clicks Sign out — without delaying first paint by bundling it
// eagerly. requestIdleCallback isn't in Safari, hence the setTimeout
// fallback; either way this is fire-and-forget, nothing awaits it.
function idle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn)
  else setTimeout(fn, 1000)
}

// Everything that reads from Supabase (trades, the settings blob, journal
// entries) used to run once from this component's onMounted — which fires
// exactly once per full page load, BEFORE sign-in has necessarily happened
// and regardless of it. Signing in via the login form is a client-side
// route change (LoginView → router.push), not a page reload, so App.vue
// never remounts for it: these loads ran once (while signed out, loading
// nothing) and nothing ever re-ran them. The only thing that looked like it
// "fixed" this was a hard refresh — which remounts App.vue AFTER the
// session is already restored from storage, so the loads happen to run
// post-sign-in by accident.
//
// Fix: run them off authStore.user actually becoming set, not off mount.
// That covers both cases — a session restored from storage after this
// component already mounted (the race onMounted alone couldn't win), and a
// fresh sign-in through the login form, with no refresh needed either way.
// Keyed by user id (not just truthy) so a token refresh firing
// onAuthStateChange again with the SAME user doesn't re-run all of this.
let loadedForUserId = null
// Guards against a second loadCloudData() starting while one is already
// running — without this, the sign-in watch's call and a near-simultaneous
// router-navigation or tab-focus refresh (both set off within the same
// instant on first app load: the sign-in watch sets `loadedForUserId`
// synchronously, long before its OWN loadCloudData() actually resolves)
// would run the entire trades/balance/cashEvents/settings/journal/
// rawCsvArchive sequence twice concurrently.
let loadInFlight = false
// Flips true once the very FIRST cloud load (per sign-in) has resolved —
// drives the AppShellSkeleton gate above. Never reset back to false by a
// later background refresh (tab focus, nav, portfolio switch): those are
// meant to update data quietly in place, not re-show a loading screen over
// a page the user is already looking at.
const initialCloudLoadDone = ref(false)
// Every store this sequence loads, for seeding cloudSync.js's per-store
// throttle clocks below — kept as one list so it can't drift out of sync
// with what loadCloudDataSequence() actually loads.
const ALL_CLOUD_STORES = ['trades', 'balance', 'cashEvents', 'journal', 'rawCsvArchive']
async function loadCloudData() {
  if (loadInFlight) return
  loadInFlight = true
  // This is about to (re)load every one of these stores directly — seed
  // their shared throttle clocks (lib/cloudSync.js) now, same as the old
  // single `lastRefreshAt = Date.now()` did, so a page-level
  // requestCloudRefresh() racing this (e.g. the router's own navigation
  // refresh, right after sign-in lands on a route) doesn't see them as
  // "due" and fire a redundant, overlapping load of the same data.
  markCloudRefreshed(ALL_CLOUD_STORES)
  try {
    await loadCloudDataSequence()
  } finally {
    loadInFlight = false
  }
}
async function loadCloudDataSequence() {
  // Accounts (portfolios) must be loaded FIRST — every other store's
  // load()/save() calls below read accountsStore.activeAccountId, and
  // accounts.js's own load() creates a default "Portfolio 1" if the user
  // has none yet, so this also guarantees activeAccountId is a real,
  // valid id by the time anything else runs.
  accountsStore.load()
  await accountsStore.whenLoaded()
  await tradesStore.load()
  // balance/cashEvents are cloud-only too (see stores/balance.js and
  // stores/cashEvents.js) — both need to be loaded BEFORE
  // checkWithdrawReminder() below, which reads balanceStore.currentBalance
  // and balanceStore.fundTransactions synchronously; loading them after
  // would leave that check running against the empty initial state.
  await Promise.all([balanceStore.load(), cashEventsStore.load()])
  // Restore the connected chart-image folder handle app-wide on launch —
  // previously this only happened on the Journal/Settings pages, so opening
  // a Trade Drawer (e.g. from the Trades page) before visiting either of
  // those would wrongly report "no folder connected" even after one had
  // already been chosen.
  imageStorageStore.restore()
  checkWithdrawReminder()

  // One-time pull/reconcile of the small "settings blob" stores against
  // Supabase (see lib/cloudSettings.js).
  syncSettingsOnLoad({
    holidays: holidayStore,
    tags: { applyFromCloud: tradeMetaStore.applyTagsFromCloud, toCloudValue: tradeMetaStore.tagsToCloudValue },
    strategies: { applyFromCloud: tradeMetaStore.applyStrategiesFromCloud, toCloudValue: tradeMetaStore.strategiesToCloudValue },
    cutoffTime: tradingRulesStore,
    timezone: tzStore,
    withdrawReminder: withdrawReminderStore,
    compactMode: settingsStore,
    checklistQuestions: { applyFromCloud: journalStore.applyChecklistQuestionsFromCloud, toCloudValue: journalStore.checklistQuestionsToCloudValue },
  })

  // Journal entries are cloud-only now (see stores/journal.js) — load()
  // replaces what used to be a reconcile-against-localStorage step, since
  // there's no local copy to reconcile against any more.
  await journalStore.load()
  await rawCsvArchiveStore.load()
}

watch(() => authStore.user?.id, (id) => {
  if (id && id !== loadedForUserId) {
    loadedForUserId = id
    // .finally() (not .then()) so a load that errors out partway (toasted
    // by whichever sub-store call failed) still releases the skeleton
    // instead of leaving the user stuck on a loading screen forever.
    loadCloudData().finally(() => {
      initialCloudLoadDone.value = true
      // From here on, cloudSync.js's per-store refresh (router navigation,
      // tab focus) is live — see the comment above its import.
      setCloudSyncReady(true)
    })
  }
}, { immediate: true })

// Switching the active portfolio (accounts.js's setActive, from the
// switcher UI) needs its own reload path — NOT loadCloudData(), which
// would also re-run the settings sync and re-create an accounts default
// needlessly. Only the per-portfolio cloud data actually changes when the
// active account changes; holidays/tags/strategies/cutoff/timezone/etc.
// are shared across every portfolio (see lib/cloudSettings.js) and don't
// need re-syncing here. Skipped on the very first load (prevId
// undefined/null) since loadCloudDataSequence() above already covers
// that case.
watch(() => accountsStore.activeAccountId, async (id, prevId) => {
  if (!id || !prevId || id === prevId) return
  // Same reasoning as loadCloudData() above: this is about to force a
  // real load of every one of these regardless of their throttle clocks,
  // so seed those clocks now rather than leaving them stale enough for an
  // immediately-following page navigation to redundantly reload the same
  // data this switch is already fetching.
  markCloudRefreshed(ALL_CLOUD_STORES)
  await Promise.all([
    tradesStore.load(),
    balanceStore.load(),
    cashEventsStore.load(),
    journalStore.load(),
    rawCsvArchiveStore.load(),
  ])
})

// Everything above only ever loads from the cloud ONCE, right after
// sign-in — there's no realtime subscription and nothing re-fetches on
// its own. So an edit made on device A simply never reaches an
// already-signed-in device B until B happens to reload (a full page
// refresh re-runs the watch above from scratch). That's the actual cause
// of "it takes a while to show up on my other device" — B isn't slowly
// catching up, it's just not looking again at all until something makes
// it. This re-fetches whenever the tab/window regains focus, which is
// the moment you'd actually go looking for the other device's change —
// but only whatever the CURRENTLY OPEN page actually needs (PAGE_STORES),
// not the old "refetch literally everything" sequence; requestCloudRefresh
// (lib/cloudSync.js) applies its own per-store throttle and skips
// everything while an editable element (an open note, a trade field) has
// focus, so this can't overwrite an active edit mid-keystroke.
function onVisibilityChange() {
  if (document.visibilityState === 'visible') requestCloudRefresh(PAGE_STORES[route.name] || [])
}
function onWindowFocus() {
  requestCloudRefresh(PAGE_STORES[route.name] || [])
}

// Registers each store's loader once, up front — the router (on every
// navigation, for just the stores the destination page needs) and
// JournalView (on opening an entry, for journal alone) then ask
// cloudSync.js for a refresh by name instead of each importing every
// store and rebuilding this wiring themselves.
registerStore('trades', () => tradesStore.load())
registerStore('balance', () => balanceStore.load())
registerStore('cashEvents', () => cashEventsStore.load())
registerStore('journal', () => journalStore.load())
registerStore('rawCsvArchive', () => rawCsvArchiveStore.load())

onMounted(() => {
  idle(() => prefetchLoginView())
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onWindowFocus)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', onWindowFocus)
})
</script>
