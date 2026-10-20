<template>
  <!-- Shared frame for the file-drop popups (Import CSV, Restore Journal
       Data): backdrop, header with close, scrolling body (default slot),
       Cancel + action footer. -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="$emit('close')">
      <div class="bg-surface-2 border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="text-sm font-semibold text-ink">{{ title }}</h2>
            <p v-if="subtitle" class="text-xs text-ink-muted mt-0.5">{{ subtitle }}</p>
          </div>
          <TooltipWrap tip="Close">
            <button class="text-ink-faint hover:text-ink transition-colors flex-shrink-0" @click="$emit('close')">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </TooltipWrap>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto">
          <slot />
        </div>

        <div class="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <button class="btn btn-ghost btn-sm flex-1" @click="$emit('close')">Cancel</button>
          <button class="btn btn-primary btn-sm flex-1" :disabled="disabled" @click="$emit('submit')">{{ actionLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import TooltipWrap from '@/components/ui/TooltipWrap.vue'

defineProps({
  open:        { type: Boolean, default: false },
  title:       { type: String, required: true },
  subtitle:    { type: String, default: '' },
  actionLabel: { type: String, default: 'Import' },
  disabled:    { type: Boolean, default: false },
})
defineEmits(['close', 'submit'])
</script>
