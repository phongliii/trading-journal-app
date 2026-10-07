<template>
  <div class="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
    <div v-for="t in toasts" :key="t.id"
      class="toast-anim pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium min-w-[240px] max-w-sm"
      :class="styles[t.type]">
      <svg v-if="t.type === 'loading'" class="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin text-ink-faint" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
        <path class="opacity-75" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"/>
      </svg>
      <span v-else class="text-base leading-none mt-0.5">{{ icons[t.type] }}</span>
      <span class="text-ink leading-snug">{{ t.msg }}</span>
    </div>
  </div>
</template>

<script setup>
import { useToast } from '@/composables/useToast'

const { toasts } = useToast()

const styles = {
  success: 'bg-surface-2 border-brand/30',
  error:   'bg-surface-2 border-down/30',
  info:    'bg-surface-2 border-border',
  warn:    'bg-surface-2 border-warn/30',
  loading: 'bg-surface-2 border-border',
}
const icons = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warn:    '⚠',
}
</script>
