<template>
  <span v-if="!isAbbreviated" :class="valueClass">{{ compactValue }}</span>
  <span v-else
    :class="valueClass"
    class="cursor-pointer"
    @click.stop="expanded = !expanded"
    :title="expanded ? 'Click to abbreviate' : 'Click to show full value'">
    {{ expanded ? fullValue : compactValue }}
  </span>
</template>

<script setup>
import { ref, computed } from 'vue'
import { fmt, fmtCompact } from '@/lib/stats'

const props = defineProps({
  value:      { type: Number, required: true },
  valueClass: { type: String, default: '' },
})

const expanded = ref(false)

const compactValue  = computed(() => fmtCompact(props.value))
const fullValue     = computed(() => fmt(props.value))
const isAbbreviated = computed(() => compactValue.value !== fullValue.value)
</script>
