import { ref, computed } from 'vue'
import { useJournalStore } from '@/stores/journal'

// Post-entry checklist ("how did you feel/manage today?") for the
// currently-selected Journal entry. `selected` is the caller's ref to the
// active entry — the modal's open/closed state is also owned here so the
// caller can flip it on (e.g. right after opening a fresh unread entry)
// without needing its own separate ref.
export function useCheckin(selected) {
  const journalStore = useJournalStore()
  const showCheckinModal = ref(false)

  const checkinAnswers = computed(() => {
    if (!selected.value || selected.value.type !== 'daily') return {}
    return journalStore.getChecklistAnswers(selected.value.key)
  })

  const noTradeDay = computed(() => {
    if (!selected.value || selected.value.type !== 'daily') return false
    return journalStore.getNoTradeDay(selected.value.key)
  })

  function saveCheckin(answers, isNoTradeDay) {
    if (!selected.value) return
    journalStore.setCheckin(selected.value.key, answers, isNoTradeDay)
    showCheckinModal.value = false
  }

  function skipCheckin() {
    showCheckinModal.value = false
  }

  return { showCheckinModal, checkinAnswers, noTradeDay, saveCheckin, skipCheckin }
}
