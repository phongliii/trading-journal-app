<template>
  <FileImportModal
    :open="open" title="Reset data"
    subtitle="Choose what to delete. This can't be undone."
    action-label="Reset…" danger :disabled="!parts.length && !settings"
    @close="$emit('close')" @submit="submit">

    <!-- Which portfolio -->
    <div>
      <div class="text-2xs text-ink-muted font-medium mb-1.5">Portfolio</div>
      <div class="flex bg-surface-3 rounded-lg p-0.5">
        <button v-for="opt in scopeOptions" :key="opt.value" type="button"
          class="flex-1 text-center py-1.5 rounded-md text-2xs transition-colors truncate px-2"
          :class="scope === opt.value ? 'bg-surface-4 text-ink font-medium' : 'text-ink-faint hover:text-ink-muted'"
          @click="scope = opt.value">
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- What to delete from it -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-2xs text-ink-muted font-medium">Delete from {{ scope === 'all' ? 'every portfolio' : activeName }}</span>
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
import { RESET_PARTS } from '@/lib/resetData'

const props = defineProps({
  open:       { type: Boolean, default: false },
  activeName: { type: String, required: true },
  portfolioCount: { type: Number, default: 1 },
})
const emit = defineEmits(['close', 'submit'])

const scope = ref('this')
const parts = ref(RESET_PARTS.map(p => p.id))
const settings = ref(false)

// Fresh defaults each time it opens: this portfolio, all of its data, no settings.
watch(() => props.open, open => {
  if (!open) return
  scope.value = 'this'
  parts.value = RESET_PARTS.map(p => p.id)
  settings.value = false
})

const scopeOptions = computed(() => [
  { value: 'this', label: props.activeName },
  ...(props.portfolioCount > 1 ? [{ value: 'all', label: `All portfolios (${props.portfolioCount})` }] : []),
])

function toggleAll() {
  parts.value = parts.value.length === RESET_PARTS.length ? [] : RESET_PARTS.map(p => p.id)
}

function submit() {
  emit('submit', { scope: scope.value, parts: [...parts.value], settings: settings.value })
}
</script>
