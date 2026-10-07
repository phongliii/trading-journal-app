import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSupabase } from '@/lib/supabaseClient'

export const useAuthStore = defineStore('auth', () => {
  const user    = ref(null)   // Supabase user object, or null when signed out
  const loading = ref(true)   // true until the initial session restore finishes
  const error   = ref('')

  // Accounts are created directly in the Supabase dashboard (Authentication
  // → Users) — there's no public signup, so this store only ever signs in
  // to an account that already exists.
  async function signIn(email, password) {
    error.value = ''
    const sb = getSupabase()
    const { data, error: err } = await sb.auth.signInWithPassword({ email, password })
    if (err) {
      error.value = err.message
      return false
    }
    user.value = data.user
    return true
  }

  async function signOut() {
    const sb = getSupabase()
    // Clear local state first — the router guard and any UI watching
    // `user` react immediately. The actual signOut() call just revokes the
    // session token on Supabase's server; it doesn't need to finish before
    // the UI treats this browser as signed out, and awaiting it first is
    // what made the sign-out button feel laggy.
    user.value = null
    try {
      await sb.auth.signOut()
    } catch {
      // Already signed out locally — a failed/slow network call here
      // shouldn't block or error out the sign-out from the user's side.
    }
  }

  // Restores whatever session Supabase already has persisted (localStorage,
  // under its own key) and keeps `user` in sync with sign-in/out/token
  // refresh from here on. Called once from App.vue on mount — the router
  // guard (router/index.js) awaits `initPromise` before deciding whether a
  // navigation needs /login, so a reload doesn't flash the login page while
  // this is still resolving.
  let initPromise = null
  function init() {
    if (initPromise) return initPromise
    const sb = getSupabase()
    initPromise = sb.auth.getSession().then(({ data }) => {
      user.value = data.session?.user || null
      loading.value = false
    })
    sb.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user || null
    })
    return initPromise
  }

  return { user, loading, error, signIn, signOut, init }
})
