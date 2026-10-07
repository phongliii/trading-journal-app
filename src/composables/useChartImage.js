import { ref, computed, watch } from 'vue'
import { useJournalStore } from '@/stores/journal'
import { useImageStorageStore } from '@/stores/imageStorage'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'

// Chart-image attachment for the currently-selected Journal entry: picking,
// saving, loading a blob URL for, and removing the per-day chart screenshot.
// Only daily entries can have one. `selected` is the caller's ref to the
// active entry — this composable reacts to it rather than owning it, since
// entry selection is the Journal page's own concern.
export function useChartImage(selected) {
  const journalStore      = useJournalStore()
  const imageStorageStore = useImageStorageStore()
  const toast             = useToast()
  const { confirm: $confirm } = useConfirm()

  const chartFileInput = ref(null)
  const lightboxOpen   = ref(false)
  const entryImageUrl  = ref(null)

  const hasImageFolder = computed(() => !!imageStorageStore.dirHandle && !imageStorageStore.needsPermission)

  const entryImage = computed(() => {
    if (!selected.value || selected.value.type !== 'daily') return null
    return journalStore.getEntryImage(selected.value.key)
  })

  async function loadEntryImageUrl() {
    entryImageUrl.value = null
    if (!entryImage.value) return
    entryImageUrl.value = await imageStorageStore.getImageUrl(entryImage.value)
  }

  watch(entryImage, loadEntryImageUrl, { immediate: true })

  async function onChartFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selected.value) return

    if (!hasImageFolder.value) {
      toast.warn('Connect a chart image folder in Settings first.')
      return
    }

    try {
      const filename = await imageStorageStore.saveImage(selected.value.key, file)
      journalStore.setEntryImage(selected.value.key, filename)
    } catch (err) {
      console.error('Could not save chart image:', err)
      toast.error('Could not save the chart image.')
    }
  }

  async function removeChartImage() {
    if (!selected.value || !entryImage.value) return
    if (!await $confirm({ title: 'Remove Chart Image', message: 'This chart image will be permanently deleted and cannot be restored.', confirmLabel: 'Remove', danger: true })) return
    const deleted = await imageStorageStore.deleteImage(entryImage.value)
    journalStore.setEntryImage(selected.value.key, null)
    if (!deleted) {
      toast.warn('The image reference was removed, but the file could not be deleted from disk.')
    }
  }

  function clearBrokenImage() {
    if (!selected.value) return
    journalStore.setEntryImage(selected.value.key, null)
  }

  return {
    chartFileInput, lightboxOpen, entryImageUrl, hasImageFolder, entryImage,
    onChartFileSelected, removeChartImage, clearBrokenImage,
  }
}
