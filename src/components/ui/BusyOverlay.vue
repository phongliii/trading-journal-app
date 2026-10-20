<template>
  <Teleport to="body">
    <Transition name="busy">
      <div v-if="state.visible"
        class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        role="alertdialog" aria-busy="true" :aria-label="state.title">
        <div class="bg-surface-2 border border-border rounded-2xl px-8 py-7 w-80 shadow-2xl text-center">
          <svg class="w-8 h-8 mx-auto mb-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-20" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          <h2 class="text-sm font-semibold text-ink mb-1">{{ state.title }}</h2>
          <p v-if="state.step" class="text-xs text-ink-muted mb-4">{{ state.step }}</p>
          <div v-else class="mb-4"></div>
          <div v-if="state.total > 1" class="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-2">
            <div class="h-full bg-brand rounded-full transition-all duration-300" :style="{ width: progress + '%' }"></div>
          </div>
          <p class="text-2xs text-ink-faint">
            <template v-if="state.total > 1">Step {{ Math.max(state.index, 1) }} of {{ state.total }} · </template>Please keep this tab open
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import { useBusy } from '@/composables/useBusy'

// The cover for useBusy().run() — see composables/useBusy.js.
const { state } = useBusy()
const progress = computed(() => (state.value.total ? Math.min(100, (Math.max(state.value.index, 1) / state.value.total) * 100) : 0))

// While it's up, closing or reloading the tab asks first — it could cut a
// run of cloud saves off half-way.
function onBeforeUnload(e) { e.preventDefault(); e.returnValue = '' }
watch(() => state.value.visible, on => {
  if (on) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
}, { flush: 'sync' }) // sync: an action that reloads right after finishing mustn't be asked
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<style scoped>
.busy-enter-active, .busy-leave-active { transition: opacity 0.15s ease; }
.busy-enter-from, .busy-leave-to { opacity: 0; }
</style>
