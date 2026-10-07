<template>
  <div class="flex items-center bg-surface-3 rounded h-[18px] px-0.5 gap-0.5">
    <button
      class="px-1.5 text-2xs leading-none rounded-sm transition-colors h-[14px] flex items-center"
      :class="mode === 'gross' ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint hover:text-ink-muted'"
      @click="setMode('gross')">
      Gross
    </button>
    <button
      class="px-1.5 text-2xs leading-none rounded-sm transition-colors h-[14px] flex items-center"
      :class="mode === 'net' ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint hover:text-ink-muted'"
      @click="setMode('net')">
      Net
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const STORAGE_KEY = 'edgelog:pnlMode'

const mode = ref(localStorage.getItem(STORAGE_KEY) || 'gross')

const emit = defineEmits(['update:modelValue'])

function setMode(m) {
  mode.value = m
  localStorage.setItem(STORAGE_KEY, m)
  emit('update:modelValue', m)
}

// Emit initial value on mount so the parent knows the restored/default mode
emit('update:modelValue', mode.value)
</script>
