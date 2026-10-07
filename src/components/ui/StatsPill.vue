<template>
  <div class="flex items-center gap-3 bg-surface-2 border border-border rounded-xl px-4 py-2">
    <span class="text-xs text-ink">{{ label }}</span>
    <span class="font-mono text-sm font-bold" :class="pnl >= 0 ? 'text-up' : 'text-down'">
      <CompactValue :value="pnl" />
    </span>
    <span class="text-xs text-ink-muted">·</span>
    <span class="text-sm font-semibold text-ink">{{ secondary }}</span>
  </div>
</template>

<script setup>
// Small pill stat used in the Calendar page's nav bar (Monthly stats / Year
// P&L) — same shape, just different label/secondary text, previously
// duplicated once per view mode.
import CompactValue from './CompactValue.vue'

defineProps({
  label:     { type: String, required: true },
  pnl:       { type: Number, default: 0 },
  secondary: { type: String, required: true },
})
</script>
