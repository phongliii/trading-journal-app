<template>
  <li class="flex items-center gap-3 bg-surface-3 border border-border rounded-lg px-3 py-2">
    <div class="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
      :class="ok ? 'bg-brand/15 text-brand' : 'bg-down/15 text-down'">
      <svg v-if="ok" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-mono text-ink truncate">{{ name }}</p>
      <p class="text-2xs" :class="ok ? 'text-ink-faint' : 'text-down'">{{ status }}</p>
    </div>
    <TooltipWrap tip="Remove">
      <button type="button" class="text-ink-faint hover:text-down flex-shrink-0 p-1" @click="$emit('remove')">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </TooltipWrap>
  </li>
</template>

<script setup>
import TooltipWrap from '@/components/ui/TooltipWrap.vue'

defineProps({
  name:   { type: String, required: true },
  status: { type: String, default: '' },
  ok:     { type: Boolean, default: true }, // true = recognized/valid (brand check), false = unrecognized/invalid (down warning)
})
defineEmits(['remove'])
</script>
