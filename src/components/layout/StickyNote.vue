<template>
  <!-- Editing -->
  <div v-if="editing" class="rounded-lg border border-yellow-400/30 bg-yellow-400/5 p-2">
    <textarea ref="input" v-model="draft" rows="6"
      class="w-full bg-transparent text-xs text-ink leading-relaxed resize-y outline-none placeholder:text-ink-faint"
      placeholder="e.g. M15 = direction&#10;1m = structure&#10;3–4 quality setups max"
      @keydown.esc.prevent="cancel"
      @keydown.enter.meta.prevent="save" @keydown.enter.ctrl.prevent="save" />
    <div class="flex justify-end gap-1.5 mt-1">
      <button type="button" class="btn btn-ghost btn-sm text-2xs" @click="cancel">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm text-2xs" @click="save">Save</button>
    </div>
  </div>

  <!-- Showing the note -->
  <div v-else-if="store.text" class="group relative rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-3 py-2.5">
    <div class="flex items-center justify-between mb-1">
      <span class="text-2xs font-medium text-yellow-400/80">📌 Trading plan</span>
      <TooltipWrap tip="Edit">
        <button type="button" class="text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity" @click="startEdit">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </TooltipWrap>
    </div>
    <p class="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{{ store.text }}</p>
  </div>

  <!-- Empty -->
  <button v-else type="button"
    class="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-2xs text-ink-faint hover:text-ink-muted hover:border-border-strong transition-colors"
    @click="startEdit">
    + Add trading plan
  </button>
</template>

<script setup>
// Sidebar sticky note: your trading plan, shared by every portfolio
// (stores/stickyNote.js).
import { ref, nextTick } from 'vue'
import { useStickyNoteStore } from '@/stores/stickyNote'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'

const store = useStickyNoteStore()
const editing = ref(false)
const draft = ref('')
const input = ref(null)

async function startEdit() {
  draft.value = store.text
  editing.value = true
  await nextTick()
  input.value?.focus()
}
function save() {
  store.setText(draft.value)
  editing.value = false
}
function cancel() { editing.value = false }
</script>
