<template>
  <div class="bg-surface-2 border border-border rounded-xl p-4">
    <div class="text-xs font-medium text-ink-muted mb-3">Avg Win / Loss Trade</div>
    <div class="flex items-center gap-4">
      <!-- Ratio number -->
      <div class="text-2xl font-bold text-ink flex-shrink-0">{{ ratio }}</div>
      <!-- Bar + labels -->
      <div class="flex-1 min-w-0">
        <div class="flex rounded-full overflow-hidden h-2 mb-2">
          <div class="bg-up transition-all" :style="{ width: winPct + '%' }"></div>
          <div class="bg-down transition-all" :style="{ width: (100 - winPct) + '%' }"></div>
        </div>
        <div class="flex justify-between">
          <span class="font-mono text-xs font-semibold text-up">{{ fmt(avgWin) }}</span>
          <span class="font-mono text-xs font-semibold text-down">-{{ fmt(Math.abs(avgLoss)) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { fmt } from '@/lib/stats'

const props = defineProps({
  avgWin:  { type: Number, default: 0 },
  avgLoss: { type: Number, default: 0 },
})

const ratio = computed(() => {
  if (!props.avgLoss || !props.avgWin) return '—'
  return (Math.abs(props.avgWin) / Math.abs(props.avgLoss)).toFixed(2)
})

const winPct = computed(() => {
  const w = Math.abs(props.avgWin)
  const l = Math.abs(props.avgLoss)
  if (!w && !l) return 50
  return (w / (w + l)) * 100
})
</script>
