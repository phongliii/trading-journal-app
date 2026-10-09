<template>
  <div class="relative bg-surface-2 border border-border rounded-xl px-4 py-3 mb-4">
    <div class="absolute top-3 right-3">
      <TooltipWrap tip="Edit">
        <button class="text-ink-faint hover:text-ink transition-colors" @click="$emit('edit')">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </TooltipWrap>
    </div>
    <div v-if="noTradeDay" class="inline-flex items-center bg-surface-3 text-ink-muted text-2xs font-medium rounded-full px-2.5 py-0.5 mb-2">No-trade day</div>
    <div class="text-xs text-ink-muted leading-loose pr-6">
      <div v-for="(q, i) in questions" :key="q.id">
        {{ i + 1 }}. {{ q.text }}
        <span v-if="answers[q.id] === 'yes'" class="font-semibold" :class="q.yesIsGood ? 'text-up' : 'text-down'">Yes.</span>
        <span v-else-if="answers[q.id] === 'no'" class="font-semibold" :class="q.yesIsGood ? 'text-down' : 'text-up'">No.</span>
        <span v-else-if="answers[q.id] === 'neutral'" class="font-semibold text-warn">Neutral.</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
defineProps({
  questions: { type: Array, required: true },
  answers:   { type: Object, default: () => ({}) },
  noTradeDay: { type: Boolean, default: false },
})
defineEmits(['edit'])
</script>
