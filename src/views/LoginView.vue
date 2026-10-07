<template>
  <div class="min-h-full flex items-center justify-center p-6">
    <div class="w-full max-w-sm">

      <!-- Logo — same mark as the sidebar, just bigger -->
      <div class="flex flex-col items-center gap-2.5 mb-7">
        <div class="w-11 h-11 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <span class="font-semibold text-base text-ink tracking-tight">EdgeLog</span>
      </div>

      <!-- Sign in now calls Supabase for real (stores/auth.js). Google and
           Sign up are still genuinely not built, so they stay disabled with
           a tooltip explaining why — same pattern used elsewhere in the app
           (e.g. the chart-image "Add chart" button before a folder is
           connected). -->
      <div class="bg-surface-2 border border-border rounded-xl p-6">
        <!-- Sign up stays visible but disabled — there's no self-signup
             (accounts are created by the app owner directly in Supabase),
             so this tab never becomes clickable. Kept in the UI rather than
             removed so it's obvious at a glance that it's deliberately off,
             not missing. -->
        <div class="flex bg-surface-3 rounded-lg p-0.5 mb-5">
          <button type="button" disabled class="flex-1 text-center py-2 rounded-md text-sm font-medium bg-brand text-surface-0 cursor-default">Sign in</button>
          <TooltipWrap tip="No self-signup — accounts are created by the app owner" class="flex-1">
            <button type="button" disabled class="w-full text-center py-2 rounded-md text-sm font-medium text-ink-faint cursor-not-allowed">Sign up</button>
          </TooltipWrap>
        </div>

        <div class="space-y-3.5">
          <div>
            <label class="input-label">Email</label>
            <input v-model="email" type="email" placeholder="you@example.com" class="input" />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="input-label !mb-0">Password</label>
              <span class="text-2xs text-ink-faint cursor-not-allowed">Forgot password?</span>
            </div>
            <input v-model="password" type="password" placeholder="••••••••" class="input" @keyup.enter="submit" />
          </div>

          <p v-if="error" class="text-2xs text-down">{{ error }}</p>

          <button class="btn-primary w-full mt-1" :disabled="submitting" @click="submit">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </button>

          <div class="flex items-center gap-2.5">
            <div class="flex-1 h-px bg-border"></div>
            <span class="text-2xs text-ink-faint">or</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>

          <TooltipWrap tip="Google sign-in isn't connected yet" class="w-full">
            <button disabled class="btn-ghost w-full">
              <span class="w-4 h-4 rounded-full bg-surface-4 text-2xs font-semibold text-ink-muted flex items-center justify-center flex-shrink-0">G</span>
              Continue with Google
            </button>
          </TooltipWrap>
        </div>
      </div>

      <p class="text-center text-2xs text-ink-faint mt-4">Accounts are set up by the app owner — no self-signup.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route  = useRoute()
const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

// Simple format check, not a full RFC 5322 validator — just enough to
// catch "forgot the @" / stray-whitespace typos before spending a round
// trip to Supabase on something it would reject anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function submit() {
  const trimmedEmail = email.value.trim()
  if (!trimmedEmail || !password.value.trim()) {
    error.value = 'Enter an email and password.'
    return
  }
  if (!EMAIL_RE.test(trimmedEmail)) {
    error.value = 'Enter a valid email address.'
    return
  }
  error.value = ''
  submitting.value = true
  const ok = await authStore.signIn(email.value.trim(), password.value)
  submitting.value = false
  if (!ok) {
    error.value = authStore.error || 'Could not sign in.'
    return
  }
  // The router guard (router/index.js) redirects here with ?redirect=<path>
  // when it was a protected page that sent you to /login in the first
  // place — send you back there instead of always landing on the dashboard.
  router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
}
</script>
