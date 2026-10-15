<template>
  <div class="bg-surface-2 border border-border rounded-xl p-4 card-hover flex flex-col gap-3 overflow-visible">
    <div class="flex items-center justify-between gap-2 h-[18px]">
      <slot name="label">
        <p class="text-xs text-ink font-medium">{{ label }}</p>
      </slot>
      <div v-if="tooltip" ref="anchorEl" class="relative flex-shrink-0"
        @mouseenter="show" @mouseleave="hide">
        <svg class="w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
          <path d="M11 12h1v5h1" stroke-linecap="round"/>
        </svg>
        <Teleport to="body">
          <div v-if="visible"
            ref="tipEl"
            class="fixed z-[9999] bg-surface-4 border border-border rounded-lg px-3 py-2 text-2xs text-ink-muted shadow-xl pointer-events-none max-w-[220px] w-max"
            :style="fixedStyle">
            {{ tooltip }}
          </div>
        </Teleport>
      </div>
      <slot name="icon" />
    </div>
    <div>
      <p class="stat-num" :class="valueClass">
        <CompactValue v-if="rawValue !== null" :value="rawValue" />
        <template v-else>{{ value }}</template>
      </p>
      <p v-if="sub" class="text-xs text-ink-muted mt-0.5">{{ sub }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import CompactValue from './CompactValue.vue'

defineProps({
  label:      { type: String, default: '' },
  value:      { type: String, default: '' },
  rawValue:   { type: Number, default: null },
  sub:        { type: String, default: '' },
  valueClass: { type: String, default: '' },
  tooltip:    { type: String, default: '' },
})

const anchorEl = ref(null)
const tipEl    = ref(null)
const visible  = ref(false)
const fixedStyle = ref('')

async function show() {
  visible.value = true
  await nextTick()
  if (!anchorEl.value || !tipEl.value) return

  const rect   = anchorEl.value.getBoundingClientRect()
  const tipW   = tipEl.value.offsetWidth
  const tipH   = tipEl.value.offsetHeight
  const margin = 8

  const showAbove = rect.top > tipH + margin
  const top = showAbove ? rect.top - tipH - margin : rect.bottom + margin

  const anchorCenter = rect.left + rect.width / 2
  let left = anchorCenter - tipW / 2
  const minLeft = margin
  const maxLeft = window.innerWidth - tipW - margin
  if (left < minLeft) left = minLeft
  if (left > maxLeft) left = maxLeft

  fixedStyle.value = `top: ${top}px; left: ${left}px;`
}

function hide() { visible.value = false }
</script>
