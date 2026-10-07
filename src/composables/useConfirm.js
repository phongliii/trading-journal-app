import { ref } from 'vue'

const state = ref({
  visible: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
  resolve: null,
})

export function useConfirm() {
  function confirm({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
      state.value = { visible: true, title, message, confirmLabel, cancelLabel, danger, resolve }
    })
  }

  function onConfirm() {
    state.value.resolve(true)
    state.value.visible = false
  }

  function onCancel() {
    state.value.resolve(false)
    state.value.visible = false
  }

  return { state, confirm, onConfirm, onCancel }
}
