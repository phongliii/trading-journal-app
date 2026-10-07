<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[999] flex items-center justify-center p-4" @click.self="skip">
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative bg-surface-2 border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div class="text-base font-semibold text-ink mb-0.5">Daily check-in</div>
        <div class="text-xs text-ink-faint mb-5">{{ dateLabel }}</div>

        <div v-for="q in questions" :key="q.id" class="mb-4">
          <div class="text-xs text-ink mb-1.5">{{ q.text }}</div>
          <div class="flex bg-surface-3 rounded-lg p-0.5">
            <button
              v-for="opt in options(q)"
              :key="opt.value"
              class="flex-1 text-center py-1.5 rounded-md text-2xs transition-colors"
              :class="answers[q.id] === opt.value ? opt.activeClass : 'text-ink-faint hover:text-ink-muted'"
              @click="answers[q.id] = opt.value">
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="flex gap-2 mt-6">
          <button class="btn btn-ghost flex-1" @click="skip">Skip</button>
          <button class="btn btn-primary flex-1" @click="save">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  questions: { type: Array, required: true },
  dateLabel: { type: String, required: true },
  initialAnswers: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['save', 'skip'])

const visible = ref(true)
const answers = ref({ ...props.initialAnswers })

function options(q) {
  return [
    { value: null,      label: 'No answer', activeClass: 'bg-surface-4 text-ink font-medium' },
    { value: 'yes',      label: 'Yes',       activeClass: q.yesIsGood ? 'bg-up/15 text-up font-medium'   : 'bg-down/15 text-down font-medium' },
    { value: 'no',       label: 'No',        activeClass: q.yesIsGood ? 'bg-down/15 text-down font-medium' : 'bg-up/15 text-up font-medium' },
    { value: 'neutral',  label: 'Neutral',   activeClass: 'bg-warn/15 text-warn font-medium' },
  ]
}

function save() {
  visible.value = false
  emit('save', { ...answers.value })
}

function skip() {
  visible.value = false
  emit('skip')
}
</script>
