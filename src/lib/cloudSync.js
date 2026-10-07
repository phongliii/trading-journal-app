// Shared, PER-STORE throttled cloud refresh.
//
// This used to be a single "refresh EVERYTHING" function App.vue
// registered once — every navigation re-fetched trades, balance,
// cashEvents, journal AND rawCsvArchive, no matter which page you
// actually landed on (Trades only ever needs trades; Export only needs
// trades/journal/rawCsvArchive; etc.), all gated by one shared 15s clock.
// Two problems with that: it fetched a lot of data pages didn't need, and
// a few call sites (JournalView's own single-entry reload) kept their own
// SEPARATE throttle clock for just the journal store, which could fall out
// of sync with the shared one and cause the same data to be fetched twice
// within a few seconds of itself.
//
// Now every store has exactly ONE throttle clock, kept here, shared by
// every caller that touches it: the router (on navigation, for just the
// stores the destination page needs — see PAGE_STORES below), the
// tab-focus/visibility listener (for whatever the CURRENTLY OPEN page
// needs), and any view's own narrower reload.

const REFRESH_MIN_INTERVAL = 15000
const stores = new Map() // name -> { load: () => Promise, lastRefreshAt: number }

// Set once the app's initial sign-in load has actually finished (see
// App.vue) — before that, a page-level refresh has nothing to usefully do
// (the initial load already covers it) and nothing to throttle against yet.
let ready = false
export function setCloudSyncReady(v) { ready = v }

export function registerStore(name, loadFn) {
  stores.set(name, { load: loadFn, lastRefreshAt: 0 })
}

function isEditingSomething() {
  const el = document.activeElement
  if (!el || el === document.body) return false
  return !!el.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
}

// Refreshes whichever of the named stores are actually due (past
// REFRESH_MIN_INTERVAL since they last loaded, from ANY caller) and
// silently skips the rest — scoped per store rather than one clock for the
// whole app, so a page only ever refetches what it actually needs. Skips
// everything while the user is mid-edit (an open note, a trade field):
// overwriting store data out from under an active edit could lose a few
// seconds of inflight content that hasn't reached the cloud yet.
//
// Returns a promise that resolves once every store that turned out to be
// due has finished loading (a no-op call resolves immediately) — lets a
// caller that needs to know when a specific store's data is current
// (JournalView, syncing the selected entry's content right after asking
// for a journal refresh) await this directly instead of keeping a second
// load/throttle of its own.
//
// `opts.force` skips the throttle check entirely (still skips mid-edit) —
// for signals that are already their own natural rate limit and shouldn't
// be second-guessed by a time window: landing on a different page (you
// don't do that repeatedly in quick succession the way a tab can regain
// focus from alt-tabbing), or a specific, deliberate request like clicking
// one journal entry (gated by its own tighter local throttle instead; see
// JournalView's refreshSelectedEntryFromCloud).
export function requestCloudRefresh(names, opts = {}) {
  if (!ready || !names || !names.length) return Promise.resolve()
  if (isEditingSomething()) return Promise.resolve()
  const now = Date.now()
  const pending = []
  for (const name of names) {
    const entry = stores.get(name)
    if (!entry) continue
    if (!opts.force && now - entry.lastRefreshAt < REFRESH_MIN_INTERVAL) continue
    entry.lastRefreshAt = now
    pending.push(entry.load())
  }
  return Promise.all(pending)
}

// Lets a caller that just did its own real, targeted load of a store
// (e.g. JournalView reloading just the open entry) count that toward the
// SAME clock, so a page-level requestCloudRefresh() moments later doesn't
// see it as still "due" and redundantly reload it again.
export function markCloudRefreshed(names) {
  const now = Date.now()
  for (const name of names) {
    const entry = stores.get(name)
    if (entry) entry.lastRefreshAt = now
  }
}

// Which stores each page actually renders — drives both the router's
// per-navigation refresh and the tab-focus/visibility refresh. Kept here
// (not duplicated per view) so every caller shares one source of truth
// for "what does this page need."
export const PAGE_STORES = {
  dashboard: ['trades', 'balance', 'cashEvents'],
  trades:    ['trades'],
  calendar:  ['trades', 'journal'],
  journal:   ['trades', 'journal', 'cashEvents'],
  export:    ['trades', 'journal', 'rawCsvArchive'],
  settings:  ['trades', 'balance', 'journal'],
}
