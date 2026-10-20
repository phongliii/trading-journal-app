<template>
  <Teleport to="body">
    <Transition name="target">
      <div v-if="target"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="$emit('close')">
        <div class="bg-surface-2 border border-border rounded-2xl p-6 w-80 shadow-2xl text-center">
          <div class="text-4xl mb-3" aria-hidden="true">🎉</div>
          <h2 class="text-base font-semibold text-ink mb-1">Target reached!</h2>
          <p class="text-xs text-ink-muted mb-1">Your balance is</p>
          <p class="font-mono text-2xl font-bold text-up mb-1">{{ fmt(target.balance) }}</p>
          <p class="text-2xs text-ink-faint mb-6">Your target: {{ fmt(target.amount) }}</p>
          <button class="btn btn-primary w-full" @click="$emit('close')">Nice!</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { fmt } from '@/lib/stats'
import { hideChartTooltips } from '@/lib/chartTooltip'

// "Target reached" celebration — shown by App.vue when the balance first
// crosses the withdraw target (see lib/withdrawReminder.js's targetCrossing).
// target: { balance, amount } while showing, or null.
const props = defineProps({ target: { type: Object, default: null } })
const emit = defineEmits(['close'])

// It can pop up while the cursor rests on a chart — clear that chart's
// tooltip and hover so they don't stay drawn over / behind the popup.
watch(() => props.target, t => { if (t) hideChartTooltips() })

function onKey(e) { if (e.key === 'Escape' && props.target) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.target-enter-active, .target-leave-active { transition: opacity 0.15s ease; }
.target-enter-from, .target-leave-to { opacity: 0; }
</style>
