<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[999] flex items-center justify-center p-4" @click.self="onBackdropClick">
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative bg-surface-2 border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div class="text-base font-semibold text-ink mb-4">{{ isEdit ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}` }}</div>

        <label class="text-xs text-ink-muted mb-1.5 block">{{ label }}</label>
        <input v-model="text" ref="inputEl" :maxlength="maxLength"
          class="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-border-strong"
          :placeholder="placeholder"
          @keyup.enter="save" />
        <p v-if="errorMsg" class="text-2xs text-down mt-1.5 mb-4">{{ errorMsg }}</p>
        <div v-else class="mb-6"></div>

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
  label:       { type: String, default: 'Name' },
  placeholder: { type: String, default: '' },
  initialText: { type: String, default: '' },
  isEdit:      { type: Boolean, default: false },
  maxLength:   { type: Number, default: 60 },
  // Other items' names this one must not collide with (case-insensitive,
  // trimmed) — pass the full list minus the item being edited, if any, so
  // renaming something to its own current name isn't flagged as a dupe.
  existingNames: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'cancel'])

const text = ref(props.initialText)
const inputEl = ref(null)

onMounted(() => {
  nextTick(() => inputEl.value?.focus())
})

// Checked live (not just on save) so the error clears the moment the user
// edits their way out of a collision, rather than only after another
// failed Save click.
const errorMsg = computed(() => {
  const trimmed = text.value.trim()
  if (!trimmed) return ''
  if (props.existingNames.some(n => n.trim().toLowerCase() === trimmed.toLowerCase())) {
    return `${props.label} already exists.`
  }
  return ''
})

function save() {
  const trimmed = text.value.trim()
  if (!trimmed || errorMsg.value) return
  emit('add', trimmed)
}

// Editing an existing item is easy to lose by an accidental outside click —
// only the Add flow (nothing typed to lose yet) dismisses that way. Editing
// requires an explicit Cancel or Save.
function onBackdropClick() {
  if (props.isEdit) return
  emit('cancel')
}
</script>
