<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[999] flex items-center justify-center p-4" @click.self="onBackdropClick">
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative bg-surface-2 border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div class="text-base font-semibold text-ink mb-4">{{ isEdit ? 'Edit check-in question' : 'Add check-in question' }}</div>

        <label class="text-xs text-ink-muted mb-1.5 block">Question</label>
        <input v-model="text" ref="inputEl" :maxlength="maxLength"
          class="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-border-strong"
          placeholder="e.g. Did you journal before the session?"
          @keyup.enter="save" />
        <p v-if="errorMsg" class="text-2xs text-down mt-1.5 mb-3">{{ errorMsg }}</p>
        <div v-else class="mb-4"></div>

        <label class="text-xs text-ink-muted mb-1.5 block">When you answer "Yes"...</label>
        <div class="flex bg-surface-3 rounded-lg p-0.5 mb-6">
          <button
            class="flex-1 text-center py-1.5 rounded-md text-xs transition-colors"
            :class="yesIsGood ? 'bg-up/15 text-up font-medium' : 'text-ink-faint hover:text-ink-muted'"
            @click="yesIsGood = true">
            That's good
          </button>
          <button
            class="flex-1 text-center py-1.5 rounded-md text-xs transition-colors"
            :class="!yesIsGood ? 'bg-down/15 text-down font-medium' : 'text-ink-faint hover:text-ink-muted'"
            @click="yesIsGood = false">
            That's bad
          </button>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-ghost flex-1" @click="$emit('cancel')">Cancel</button>
          <button class="btn btn-primary flex-1" :disabled="!text.trim() || !!errorMsg" @click="save">{{ isEdit ? 'Save' : 'Add' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'

const props = defineProps({
  initialText:      { type: String, default: '' },
  initialYesIsGood: { type: Boolean, default: true },
  isEdit:           { type: Boolean, default: false },
  maxLength:        { type: Number, default: 200 },
  // Other questions' text this one must not collide with (case-insensitive,
  // trimmed) — pass the full list minus the question being edited, if any.
  existingTexts:    { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'cancel'])

const text = ref(props.initialText)
const yesIsGood = ref(props.initialYesIsGood)
const inputEl = ref(null)

onMounted(() => {
  nextTick(() => inputEl.value?.focus())
})

const errorMsg = computed(() => {
  const trimmed = text.value.trim()
  if (!trimmed) return ''
  if (props.existingTexts.some(t => t.trim().toLowerCase() === trimmed.toLowerCase())) {
    return 'That question already exists.'
  }
  return ''
})

function save() {
  const trimmed = text.value.trim()
  if (!trimmed || errorMsg.value) return
  emit('add', { text: trimmed, yesIsGood: yesIsGood.value })
}

// Same rule as AddTextItemModal: only the Add flow closes on an outside
// click. Editing requires an explicit Cancel or Save so a stray click can't
// silently discard changes.
function onBackdropClick() {
  if (props.isEdit) return
  emit('cancel')
}
</script>
