<template>
  <div class="flex items-center gap-3 min-w-0">
    <div v-if="ratio !== null" class="text-2xl font-bold text-ink flex-shrink-0">{{ ratio }}</div>
    <div class="flex-1 min-w-0" :class="{ 'mt-2': ratio === null }">
      <div class="flex rounded-full overflow-hidden h-2.5 mb-3 bg-surface-3">
        <div class="bg-up transition-all" :style="{ width: winPct + '%' }"></div>
        <div class="bg-down transition-all" :style="{ width: (100 - winPct) + '%' }"></div>
      </div>
      <div class="flex justify-between gap-2 min-w-0">
        <span class="font-mono text-sm font-semibold text-up truncate"><CompactValue :value="win" /></span>
        <span class="font-mono text-sm font-semibold text-down truncate"><CompactValue :value="loss" /></span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Shared "win/loss split bar" used by both Avg Win/Loss and Largest Win/Loss
// on the Dashboard — a proportional up/down bar with the two values below
// it, optionally preceded by a big ratio number. `loss` takes its natural
// (typically negative) value; CompactValue renders its own sign.
import { computed } from 'vue'
import CompactValue from './CompactValue.vue'

const props = defineProps({
  win:   { type: Number, default: 0 },
  loss:  { type: Number, default: 0 },
  ratio: { type: [String, Number], default: null },
})

const winPct = computed(() => {
  const w = Math.abs(props.win)
  const l = Math.abs(props.loss)
  if (!w && !l) return 50
  return (w / (w + l)) * 100
})
</script>
