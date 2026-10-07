<template>
  <div class="flex items-center bg-surface-3 rounded h-[18px] px-0.5 gap-0.5">
    <button v-for="opt in options" :key="opt"
      class="px-1.5 text-2xs leading-none rounded-sm transition-colors h-[14px] flex items-center"
      :class="modelValue === opt ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint hover:text-ink-muted'"
      @click="select(opt)">
      {{ opt }}
    </button>
  </div>
</template>

<script setup>
// Small segmented control (same look as EquityModeTabs / PnlModeTabs) for a
// fixed list of string options. The choice is remembered in localStorage under
// `storageKey`, and v-model is initialised from it on mount.
import { onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  options:    { type: Array,  required: true },
  storageKey: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

function select(opt) {
  if (props.storageKey) { try { localStorage.setItem(props.storageKey, opt) } catch {} }
  emit('update:modelValue', opt)
}

onMounted(() => {
  if (!props.storageKey) return
  let saved = null
  try { saved = localStorage.getItem(props.storageKey) } catch {}
  if (saved && props.options.includes(saved) && saved !== props.modelValue) emit('update:modelValue', saved)
})
</script>
