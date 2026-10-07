<template>
  <div class="flex items-center bg-surface-3 rounded h-[18px] px-0.5 gap-0.5">
    <button
      class="px-1.5 text-2xs leading-none rounded-sm transition-colors h-[14px] flex items-center"
      :class="mode === 'equity' ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint hover:text-ink-muted'"
      @click="setMode('equity')">
      Equity
    </button>
    <button
      class="px-1.5 text-2xs leading-none rounded-sm transition-colors h-[14px] flex items-center"
      :class="[
        mode === 'balance' ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-ink-muted cursor-pointer'
      ]"
      :disabled="disabled"
      :title="disabled ? 'Import account balance in Settings to enable' : ''"
      @click="!disabled && setMode('balance')">
      Balance
    </button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  disabled: { type: Boolean, default: false },
})

const STORAGE_KEY = 'edgelog:equityMode'

const saved = localStorage.getItem(STORAGE_KEY) || 'equity'
const mode = ref(props.disabled && saved === 'balance' ? 'equity' : saved)

const emit = defineEmits(['update:modelValue'])

function setMode(m) {
  mode.value = m
  localStorage.setItem(STORAGE_KEY, m)
  emit('update:modelValue', m)
}

// If balance becomes unavailable while "balance" mode is active, fall back to equity
watch(() => props.disabled, (isDisabled) => {
  if (isDisabled && mode.value === 'balance') {
    setMode('equity')
  }
})

emit('update:modelValue', mode.value)
</script>
