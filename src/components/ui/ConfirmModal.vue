<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="state.visible"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="onCancel">
        <div class="bg-surface-2 border border-border rounded-2xl p-6 w-80 shadow-2xl">
          <h2 class="text-sm font-semibold text-ink mb-2">{{ state.title }}</h2>
          <p v-if="state.message" class="text-xs text-ink-muted mb-6 leading-relaxed">{{ state.message }}</p>
          <div v-else class="mb-6"></div>
          <div class="flex gap-3 justify-end">
            <button @click="onCancel"
              class="btn btn-ghost btn-sm">
              {{ state.cancelLabel }}
            </button>
            <button @click="onConfirm"
              class="btn btn-sm"
              :class="state.danger ? 'btn-danger' : 'btn-primary'">
              {{ state.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { state, onConfirm, onCancel } = useConfirm()
</script>

<style scoped>
.confirm-enter-active, .confirm-leave-active { transition: opacity 0.15s ease; }
.confirm-enter-from, .confirm-leave-to { opacity: 0; }
</style>
