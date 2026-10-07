<template>
  <div class="relative inline-flex cursor-pointer" ref="anchorEl"
    @mouseenter="show" @mouseleave="hide">
    <slot />
    <Teleport to="body">
      <div v-if="visible"
        ref="tipEl"
        class="fixed z-[9999] bg-surface-4 border border-border rounded-lg px-3 py-2 text-2xs text-ink-muted shadow-xl pointer-events-none max-w-[220px] w-max"
        :style="fixedStyle">
        {{ tip }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({ tip: { type: String, required: true } })
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

  // Vertical: prefer above, flip below if not enough room
  const showAbove = rect.top > tipH + margin
  const top = showAbove ? rect.top - tipH - margin : rect.bottom + margin

  // Horizontal: center under the anchor by default, clamp to viewport edges
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
