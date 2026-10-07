<template>
  <div class="bg-surface-2 border border-border rounded-xl p-5 min-w-0">
    <div class="flex items-center mb-4 min-w-0" :class="infoNext ? 'gap-1.5' : 'justify-between gap-2'">
      <slot name="header">
        <p class="text-xs font-medium text-ink min-w-0">{{ title }}</p>
      </slot>
      <TooltipWrap v-if="tooltip" :tip="tooltip">
        <svg class="w-3.5 h-3.5 text-ink-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
          <path d="M11 12h1v5h1" stroke-linecap="round"/>
        </svg>
      </TooltipWrap>
      <!-- Far-right controls (with `info-next`), e.g. range tabs or a dropdown -->
      <div v-if="$slots.actions" class="ml-auto flex items-center">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup>
// Shared dashboard card shell: the surface/border/padding wrapper plus the
// "title + info-tooltip" header row that was duplicated across every
// Dashboard section. Pass `title`/`tooltip` for the common case, or use the
// `header` slot to swap in something else (e.g. PnlModeTabs) while keeping
// the same tooltip icon alongside it. By default the icon sits at the far
// right; with `info-next` it sits right after the title and the `actions`
// slot (tabs, a dropdown) goes to the far right instead.
import TooltipWrap from './TooltipWrap.vue'

defineProps({
  title:   { type: String, default: '' },
  tooltip: { type: String, default: '' },
  infoNext: { type: Boolean, default: false },
})
</script>
