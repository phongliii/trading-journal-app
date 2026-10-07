<template>
  <div class="relative space-y-4">
    <div
      v-for="(item, index) in items" :key="item.label"
      class="-mx-2 px-2 py-1 rounded-md transition-colors"
      :class="[clickable ? 'cursor-pointer hover:bg-surface-3' : '', clickable && index === activeIndex ? 'bg-surface-3' : '']"
      @click="clickable && $emit('select', item, index)">
      <div class="flex items-center justify-between mb-1 text-xs">
        <span class="text-ink font-medium">{{ item.label }}</span>
        <div class="flex items-center gap-3">
          <span class="font-mono font-medium text-right flex-shrink-0 w-24" :class="item.pnl >= 0 ? 'text-up' : 'text-down'">
            <CompactValue :value="item.pnl" />
          </span>
          <div class="w-12 flex justify-end">
            <TooltipWrap :tip="`Win rate percentage for ${item.label}`">
              <span class="text-2xs text-ink-faint">{{ fmtRate(item.winRate) }}%</span>
            </TooltipWrap>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="bar-track flex-1">
          <div :class="item.pnl >= 0 ? 'bar-fill-up' : 'bar-fill-down'" :style="{ width: Math.abs(item.pct) + '%' }"></div>
        </div>
        <div class="w-12 flex justify-end">
          <TooltipWrap :tip="`Percentage of total P&L activity for ${item.label}`">
            <span class="text-2xs text-ink-faint">{{ item.pnl < 0 ? '-' : '' }}{{ Math.abs(item.pct).toFixed(1) }}%</span>
          </TooltipWrap>
        </div>
      </div>
    </div>
    <!-- Divider between the $ and % columns: right-[54px] = the 48px (w-12) %
         column + half of the 12px (gap-3) gutter. !mt-0 cancels space-y-4. -->
    <div v-if="items.length" class="absolute top-0 bottom-0 right-[54px] w-px bg-border pointer-events-none !mt-0"></div>
  </div>
</template>

<script setup>
import CompactValue from './CompactValue.vue'
import TooltipWrap from './TooltipWrap.vue'
defineProps({
  items:       { type: Array, default: () => [] },
  clickable:   { type: Boolean, default: false },
  activeIndex: { type: Number, default: null },
})
defineEmits(['select'])

// Up to 2 decimals, but never a trailing zero past the first decimal:
// 0 → 0.0, 1.10 → 1.1, 33.33 → 33.33.
const fmtRate = (n) => n.toFixed(2).replace(/0$/, '')
</script>
