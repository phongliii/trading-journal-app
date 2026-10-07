<template>
  <div>
    <div
      class="border-2 border-dashed rounded-xl px-6 py-7 text-center cursor-pointer transition-colors"
      :class="dragOver ? 'border-brand bg-brand/10' : 'border-border hover:border-border-strong'"
      @click="inputEl?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div class="w-9 h-9 mx-auto mb-2.5 rounded-lg flex items-center justify-center transition-colors"
        :class="dragOver ? 'bg-brand/20 text-brand' : 'bg-surface-3 text-ink-faint'">
        <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
        </svg>
      </div>
      <p class="text-xs text-ink"><span class="text-brand font-medium">Drag & drop</span> your files here</p>
      <button type="button" class="btn btn-ghost btn-sm mt-3" @click.stop="inputEl?.click()">Choose files</button>
      <p v-if="hint" class="text-2xs text-ink-faint mt-2.5">{{ hint }}</p>
    </div>
    <input ref="inputEl" type="file" :accept="accept" :multiple="multiple" class="hidden" @change="onPick" />
  </div>
</template>

<script setup>
// Presentational only — classification (which file is a Position History
// vs. a Cash History, which Notes export vs. which Settings export, etc.)
// stays with whichever page uses this, since that logic differs per use.
// This just turns a drag/drop or a native file pick into a plain File[]
// and emits it.
import { ref } from 'vue'

defineProps({
  accept:   { type: String, default: '' },
  multiple: { type: Boolean, default: true },
  hint:     { type: String, default: '' },
})
const emit = defineEmits(['files'])

const inputEl  = ref(null)
const dragOver = ref(false)

function onDrop(e) {
  dragOver.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (files.length) emit('files', files)
}
function onPick(e) {
  const files = [...(e.target.files || [])]
  e.target.value = '' // so picking the same file again still fires @change
  if (files.length) emit('files', files)
}
</script>
