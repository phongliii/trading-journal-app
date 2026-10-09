<template>
  <!-- Replaces the day cell's content (like the chart image's hover overlay)
       with the cell's note actions. @click.stop so clicks here don't
       re-trigger the cell's own click handler. -->
  <div class="absolute inset-0 z-10 bg-surface-2 flex flex-col items-center justify-center gap-1.5 p-2" @click.stop>
    <button class="w-full max-w-[120px] bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-ink hover:bg-surface-3 transition-colors"
      @click="$emit('confirm')">
      {{ hasEntry ? 'Open note' : 'Create note' }}
    </button>
    <button class="w-full max-w-[120px] rounded-lg px-3 py-1 text-2xs text-ink-muted hover:text-ink transition-colors"
      @click="$emit('close')">
      Close
    </button>
  </div>
</template>

<script setup>
defineProps({ hasEntry: { type: Boolean, default: false } })
defineEmits(['confirm', 'close'])
</script>
