<template>
  <FileImportModal
    :open="open" title="Reset data"
    subtitle="Choose what to delete. This can't be undone."
    action-label="Reset…" danger :disabled="!parts.length && !settings"
    @close="$emit('close')" @submit="submit">

    <!-- Which portfolio -->
    <div>
      <div class="text-2xs text-ink-muted font-medium mb-1.5">Portfolio</div>
      <Dropdown v-model="target" :options="targetOptions" full-width />
    </div>

    <!-- What to delete from it -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-2xs text-ink-muted font-medium truncate">Delete from {{ target === 'all' ? 'every portfolio' : targetName }}</span>
        <button type="button" class="text-2xs text-brand hover:underline" @click="toggleAll">
          {{ parts.length === RESET_PARTS.length ? 'Select none' : 'Select all' }}
        </button>
      </div>
      <div class="space-y-1">
        <label v-for="p in RESET_PARTS" :key="p.id"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-3 cursor-pointer hover:bg-surface-4 transition-colors">
          <input type="checkbox" class="accent-[#f87171]" :value="p.id" v-model="parts" />
          <span class="text-xs text-ink">{{ p.label }}</span>
          <span v-if="p.hint" class="text-2xs text-ink-faint truncate">— {{ p.hint }}</span>
        </label>
      </div>
    </div>

    <!-- Shared settings -->
    <div>
      <div class="text-2xs text-ink-muted font-medium mb-1.5">Shared by all portfolios</div>
      <label class="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-3 cursor-pointer hover:bg-surface-4 transition-colors">
        <input type="checkbox" class="accent-[#f87171] mt-0.5" v-model="settings" />
        <span>
          <span class="block text-xs text-ink">Settings</span>
          <span class="block text-2xs text-ink-faint">Tags, strategies, check-in questions, time zone, trading day start, balance alert and display preferences — reset for every portfolio.</span>
        </span>
      </label>
    </div>

    <p class="text-2xs text-ink-faint">Your portfolios themselves and your sign-in are kept.</p>
  </FileImportModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import FileImportModal from '@/components/ui/FileImportModal.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import { RESET_PARTS } from '@/lib/resetData'

const props = defineProps({
  open:       { type: Boolean, default: false },
  portfolios: { type: Array, required: true }, // [{ id, name }]
  activeId:   { type: String, default: null },
})
const emit = defineEmits(['close', 'submit'])

// A portfolio id, or 'all'.
const target = ref(props.activeId)
const parts = ref(RESET_PARTS.map(p => p.id))
const settings = ref(false)

// Fresh defaults each time it opens: the active portfolio, all of its data, no settings.
watch(() => props.open, open => {
  if (!open) return
  target.value = props.activeId ?? props.portfolios[0]?.id
  parts.value = RESET_PARTS.map(p => p.id)
  settings.value = false
})

const targetOptions = computed(() => [
  ...props.portfolios.map(p => ({ value: p.id, label: p.id === props.activeId ? `${p.name} (active)` : p.name })),
  ...(props.portfolios.length > 1 ? [{ value: 'all', label: `All portfolios (${props.portfolios.length})` }] : []),
])
const targetName = computed(() => props.portfolios.find(p => p.id === target.value)?.name || '')

function toggleAll() {
  parts.value = parts.value.length === RESET_PARTS.length ? [] : RESET_PARTS.map(p => p.id)
}

function submit() {
  emit('submit', { target: target.value, parts: [...parts.value], settings: settings.value })
}
</script>
