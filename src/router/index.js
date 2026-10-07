import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { requestCloudRefresh, PAGE_STORES } from '@/lib/cloudSync'

// Back to a lazy `() => import(...)` like every other route below, so
// LoginView's code stays split out of the main bundle. The earlier version
// imported it eagerly to kill a stall where clicking Sign out had to wait
// for this chunk to fetch (leaving the old page's sidebar/topbar on screen
// meanwhile) — fixed here instead by warming the SAME import in the
// background shortly after the app loads (App.vue calls prefetchLoginView()
// on an idle callback), so the chunk is normally already cached by the time
// anyone actually clicks Sign out, without bundling it into every load.
const loadLoginView = () => import('@/views/LoginView.vue')
export function prefetchLoginView() {
  return loadLoginView()
}

const routes = [
  { path: '/',          name: 'dashboard',  component: () => import('@/views/DashboardView.vue') },
  { path: '/trades',    name: 'trades',     component: () => import('@/views/TradesView.vue') },
  { path: '/calendar',  name: 'calendar',   component: () => import('@/views/CalendarView.vue') },
  { path: '/journal',   name: 'journal',    component: () => import('@/views/JournalView.vue') },
  { path: '/export',    name: 'export',     component: () => import('@/views/ExportView.vue') },
  { path: '/settings',  name: 'settings',   component: () => import('@/views/SettingsView.vue') },
  // meta.hideChrome tells App.vue to hide the sidebar/topbar on this route —
  // a login page shouldn't show app navigation around it.
  { path: '/login',     name: 'login',      component: loadLoginView, meta: { hideChrome: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    const el = document.getElementById('main-scroll')
    if (el) el.scrollTop = 0
    return { top: 0 }
  },
})

// This is a UI gate, not the real security boundary — it just keeps a
// signed-out browser from seeing the app's pages. The actual enforcement is
// Supabase Row Level Security on the data itself (Phase 2 of the roadmap);
// without it, anyone who can reach the Supabase URL/key directly (both are
// public, by design, in client-side code) can read or write any row no
// matter what this guard does.
router.beforeEach(async (to) => {
  if (to.name === 'login') return true

  const authStore = useAuthStore()
  // App.vue starts authStore.init() on mount; await the SAME promise here
  // rather than re-running it, so a hard reload on a protected route
  // doesn't redirect to /login before the session restore from localStorage
  // has even finished.
  await authStore.init()

  if (!authStore.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

// Same cross-device-staleness problem the tab-focus refresh in App.vue
// exists for (see its comment) — switching pages INSIDE the app is just
// as good a sign you want current data as switching back to the tab is.
// Only refreshes what the DESTINATION page actually needs (PAGE_STORES),
// not every cloud store the app has — Trades doesn't need a fresh balance
// fetch just because you clicked into it. Goes through the shared,
// per-store throttle (lib/cloudSync.js) rather than forcing a fetch every
// time — now that an unchanged reload no longer replaces a store's data
// with a new-but-equal reference (see trades.js/balance.js/cashEvents.js),
// forcing it on every navigation was only ever working around THAT bug;
// with it actually fixed, the 15s throttle is back to doing its original
// job of just bounding request volume, not papering over a flicker.
router.afterEach((to, from) => {
  if (to.name !== from.name) requestCloudRefresh(PAGE_STORES[to.name] || [])
})

export default router
