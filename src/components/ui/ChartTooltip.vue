<template>
  <Teleport to="body">
    <div v-if="visible"
      class="fixed z-[9999] bg-surface-4 border border-border rounded-lg px-3 py-2 text-2xs shadow-xl pointer-events-none"
      :style="style">
      <slot />
    </div>
  </Teleport>
</template>

<script setup>
// Positioning-only shell for a hover tooltip with rich (multi-field) content,
// for cases like a chart where the anchor isn't a simple wrapped element
// TooltipWrap can sit around (e.g. one <rect> among many inside an <svg>) —
// the caller tracks its own mouseenter/leave per element and just hands this
// component where to render and what to show.
defineProps({
  visible: { type: Boolean, default: false },
  style:   { type: String, default: '' },
})
</script>
