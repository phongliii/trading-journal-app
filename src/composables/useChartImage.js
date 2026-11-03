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

  // The browser hasn't (re)granted access to the image folder yet — common
  // after a restart. The file is fine; it just can't be read until allowed.
  const imageNeedsAccess = computed(() =>
    !!entryImage.value && !!imageStorageStore.dirHandle && imageStorageStore.needsPermission)
  // Still reconnecting the folder as the app starts — not "missing" yet.
  const imageFolderLoading = computed(() => !!entryImage.value && imageStorageStore.restoring)

  // Re-run whenever the image OR the folder changes: an entry opened before
  // the folder finished reconnecting at startup used to stay on "File not
  // found" for good. `latest` drops an older lookup that finishes last.
  let latest = 0
  async function loadEntryImageUrl() {
    const run = ++latest
    entryImageUrl.value = null
    if (!entryImage.value) return
    const url = await imageStorageStore.getImageUrl(entryImage.value)
    if (run === latest) entryImageUrl.value = url
  }

  watch(() => [entryImage.value, imageStorageStore.dirHandle, imageStorageStore.needsPermission, imageStorageStore.restoring],
    loadEntryImageUrl, { immediate: true })

  async function allowImageAccess() {
    if (!await imageStorageStore.reconnect()) toast.warn('Access to the chart image folder was not allowed.')
  }

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
    imageNeedsAccess, imageFolderLoading, allowImageAccess,
    onChartFileSelected, removeChartImage, clearBrokenImage,
  }
}
