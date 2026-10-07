<template>
  <div class="flex flex-col items-center justify-center h-full gap-4 py-2">
    <!-- SVG ring -->
    <div class="relative w-[130px] h-[130px]">
      <svg width="130" height="130" viewBox="0 0 130 130" class="-rotate-90">
        <!-- Track -->
        <circle cx="65" cy="65" r="54" fill="none" stroke="#1e2d42" stroke-width="12"/>
        <!-- Fill -->
        <circle cx="65" cy="65" r="54" fill="none"
          :stroke="stats.winRate >= 50 ? '#00c896' : '#ef4444'"
          stroke-width="12"
          stroke-linecap="round"
          :stroke-dasharray="`${(stats.winRate / 100) * 339.3} 339.3`"
          style="transition: stroke-dasharray 0.6s ease" />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="font-mono text-xl font-semibold" :class="stats.winRate >= 50 ? 'text-up' : 'text-down'">
          {{ stats.winRate.toFixed(0) }}%
        </span>
        <span class="text-2xs text-ink-faint">Win rate</span>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-2 gap-x-6 gap-y-2 w-full px-4">
      <div class="text-center">
        <div class="font-mono font-semibold text-up">{{ stats.wins }}</div>
        <div class="text-2xs text-ink-faint">Wins</div>
      </div>
      <div class="text-center">
        <div class="font-mono font-semibold text-down">{{ stats.losses }}</div>
        <div class="text-2xs text-ink-faint">Losses</div>
      </div>
      <div class="text-center">
        <div class="font-mono font-semibold text-ink text-xs">{{ fmt(stats.avgWin) }}</div>
        <div class="text-2xs text-ink-faint">Avg win</div>
      </div>
      <div class="text-center">
        <div class="font-mono font-semibold text-ink text-xs">{{ fmt(stats.avgLoss) }}</div>
        <div class="text-2xs text-ink-faint">Avg loss</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { fmt } from '@/lib/stats'
defineProps({ stats: { type: Object, required: true } })
</script>
