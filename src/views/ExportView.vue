<template>
  <div class="p-6 w-full max-w-[900px] min-w-[600px] space-y-5">

    <div>
      <h1 class="text-lg font-semibold text-ink">Export & Restore</h1>
      <p class="text-xs text-ink-muted mt-0.5">Download your data as a file, or restore Journal Data from a previous export.</p>
    </div>

    <div class="grid grid-cols-2 gap-4 items-start">

      <!-- Export -->
      <div class="bg-surface-2 border border-border rounded-xl">
        <div class="px-5 py-4 border-b border-border">
          <h2 class="text-sm font-semibold text-ink">Export</h2>
        </div>
        <div class="p-5 space-y-5">

          <div>
            <p class="text-xs font-medium text-ink-muted mb-1.5">Data type</p>
            <div class="relative" ref="typeMenuRoot">
              <button
                type="button"
                class="w-full flex items-center justify-between gap-2 bg-surface-3 border rounded-lg px-3 py-2 text-sm text-ink outline-none transition-colors"
                :class="typeMenuOpen ? 'border-brand' : 'border-border'"
                @click="typeMenuOpen = !typeMenuOpen">
                <span>{{ selectedTypeLabel }}</span>
                <svg class="w-3.5 h-3.5 flex-shrink-0" :class="typeMenuOpen ? 'text-brand' : 'text-ink-faint'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <polyline v-if="typeMenuOpen" points="18 15 12 9 6 15"/>
                  <polyline v-else points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div v-if="typeMenuOpen" class="absolute top-full left-0 right-0 mt-1.5 bg-surface-3 border border-border rounded-lg overflow-y-auto max-h-[152px] shadow-2xl z-20">
                <button
                  v-for="t in EXPORT_TYPES" :key="t.value"
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-4"
                  :class="[t.value === selectedType ? 'text-brand' : 'text-ink', t.value === 'all' ? 'border-t border-border' : '']"
                  @click="selectType(t.value)">
                  {{ t.label }}
                </button>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-ink-muted mb-1.5">Date range</p>
            <DatePickerCalendar v-model:range-start="rangeStart" v-model:range-end="rangeEnd" />
          </div>

          <div class="-mx-5 px-5 pt-5 border-t border-border flex items-center justify-between gap-3">
            <p class="text-xs text-ink-faint truncate">Downloads as <span class="font-mono">{{ selectedTypeExt }}</span></p>
            <button class="btn btn-primary btn-sm flex-shrink-0" :disabled="downloading || !hasRange" @click="handleDownload">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {{ downloading ? 'Preparing…' : 'Download' }}
            </button>
          </div>

        </div>
      </div>

      <!-- Restore -->
      <div class="bg-surface-2 border border-border rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-border">
          <h2 class="text-sm font-semibold text-ink">Restore</h2>
        </div>
        <div class="p-5 space-y-5">
          <p class="text-xs text-ink-muted leading-relaxed">Bring back Notes, Holidays, or Settings from a previous export. Existing entries are never overwritten.</p>
          <div class="-mx-5 px-5 pt-5 border-t border-border flex items-center justify-between gap-3">
            <p class="text-xs text-ink-faint">Accepts .json files</p>
            <button class="btn btn-ghost btn-sm flex-shrink-0" @click="openRestoreModal">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Restore Data
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Restore modal: multi-file drop zone, styled like the CSV Import modal -->
    <Teleport to="body">
      <div v-if="restoreModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="closeRestoreModal">
        <div class="bg-surface-2 border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
          <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 class="text-sm font-semibold text-ink">Restore Journal Data</h2>
              <p class="text-xs text-ink-muted mt-0.5">Drop Notes, Holidays, or Settings files. Existing entries are never overwritten.</p>
            </div>
            <TooltipWrap tip="Close">
              <button class="text-ink-faint hover:text-ink transition-colors flex-shrink-0" @click="closeRestoreModal">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </TooltipWrap>
          </div>

          <div class="p-5 space-y-4 overflow-y-auto">

            <FileDropZone
              accept=".json,application/json"
              hint="Notes, Holidays, Settings — any combination of .json exports"
              @files="onRestoreFiles" />

            <ul v-if="restoreFiles.length" class="space-y-2">
              <FileListRow
                v-for="(f, i) in restoreFiles" :key="f.name + i"
                :name="f.name"
                :status="classifyRestoreFile(f.name) ? `${classifyRestoreFile(f.name)} export` : `Unrecognized — won't be restored`"
                :ok="!!classifyRestoreFile(f.name)"
                @remove="restoreFiles.splice(i, 1)" />
            </ul>

          </div>

          <div class="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
            <button class="btn btn-ghost btn-sm flex-1" @click="closeRestoreModal">Cancel</button>
            <button class="btn btn-primary btn-sm flex-1" :disabled="!restoreHasFiles" @click="runRestore">Restore</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import FileDropZone from '@/components/ui/FileDropZone.vue'
import FileListRow from '@/components/ui/FileListRow.vue'
import { useToast } from '@/composables/useToast'
import DatePickerCalendar from '@/components/ui/DatePickerCalendar.vue'
import { EXPORT_TYPES, buildExport, downloadBlob, importJournalFiles } from '@/lib/exportData'

const toast = useToast()

// ── Data-type dropdown (custom-styled, since a native <select>'s open menu
// can't be themed). A plain absolutely-positioned list under the field,
// attached to the card like a normal dropdown. The Export card's wrapper
// no longer has `overflow-hidden` (that was clipping this list once it
// extended past the card's own shorter height), so the list is free to
// overflow past the card's bottom edge as needed and scrolls internally
// once it's taller than 4 items (`max-h-[152px]`).
const selectedType = ref('position')
const typeMenuOpen = ref(false)
const typeMenuRoot = ref(null)
const selectedTypeLabel = computed(() => EXPORT_TYPES.find(t => t.value === selectedType.value)?.label || '')

// File extension the current selection will download as — kept in sync with
// buildExport()'s own logic (rawcsv → .csv, all → .zip, everything else is
// a plain JSON file), so this label never drifts from what actually happens.
const selectedTypeExt = computed(() => {
  const kind = EXPORT_TYPES.find(t => t.value === selectedType.value)?.kind
  if (kind === 'rawcsv') return '.csv'
  if (kind === 'all') return '.zip'
  return '.json'
})

function selectType(value) {
  selectedType.value = value
  typeMenuOpen.value = false
}

function onClickOutsideTypeMenu(e) {
  if (typeMenuOpen.value && typeMenuRoot.value && !typeMenuRoot.value.contains(e.target)) {
    typeMenuOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', onClickOutsideTypeMenu))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutsideTypeMenu))

// ── Date range — the same calendar/preset picker used on the Trade Logs
// page. Nothing selected is its default (and what "Clear" leaves it at);
// the Download button stays disabled until a range is actually chosen,
// rather than silently exporting everything.
const rangeStart = ref('')
const rangeEnd   = ref('')
const downloading = ref(false)

const hasRange = computed(() => !!(rangeStart.value && rangeEnd.value))

// `new Date('yyyy-MM-dd')` parses the string as UTC midnight, which rolls
// back a day once converted to a timezone behind UTC (e.g. 2026-09-01
// becomes Aug 31, 7pm in Central time) — the same bug DatePickerCalendar
// already avoids with its own local parser. Do the same here so the
// filtered range and the exported filename match what was actually picked.
function localParse(ds) {
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const range = computed(() => ({
  from: rangeStart.value ? localParse(rangeStart.value) : null,
  to:   rangeEnd.value   ? localParse(rangeEnd.value)   : null,
}))

async function handleDownload() {
  downloading.value = true
  try {
    const result = await buildExport(selectedType.value, range.value)
    if (!result) {
      toast.warn('No data to export for this selection')
      return
    }
    downloadBlob(result.blob, result.filename)
    toast.success(`Downloaded ${result.filename}`)
  } catch (e) {
    console.error(e)
    toast.error('Export failed: ' + e.message)
  } finally {
    downloading.value = false
  }
}

// ── Restore modal: one drop zone, any mix of exported .json files at ───────
// once — which category a file belongs to (Notes/Holidays/Settings/etc.)
// is decided by its own filename prefix (classifyRestoreFile, mirroring
// importJournalFiles' own check), not by which box the person dropped it
// into — there never actually was separate per-category handling here:
// runRestore always just pooled every zone's files into one list and
// handed the whole thing to importJournalFiles. The categorized label on
// each row is for the person's benefit, so they can see what a file will
// be treated as (or that it won't be recognized at all) before restoring.
function classifyRestoreFile(name) {
  if (name.startsWith('Notes')) return 'Notes'
  if (name.startsWith('Holidays')) return 'Holidays'
  if (name.startsWith('ReadStatus')) return 'Read status'
  if (name.startsWith('TradeNotes')) return 'Trade notes'
  if (name.startsWith('Settings')) return 'Settings'
  return null
}

const restoreFiles = ref([])
const restoreModalOpen = ref(false)
const restoreHasFiles = computed(() => restoreFiles.value.length > 0)

function openRestoreModal() {
  restoreFiles.value = []
  restoreModalOpen.value = true
}
function closeRestoreModal() {
  restoreModalOpen.value = false
}

function onRestoreFiles(files) {
  const jsonFiles = files.filter(f => f.name.endsWith('.json'))
  const skipped = files.length - jsonFiles.length
  if (skipped > 0) toast.warn(`${skipped} file${skipped !== 1 ? 's' : ''} skipped — only .json exports can be restored`)
  restoreFiles.value.push(...jsonFiles)
}

async function runRestore() {
  const files = restoreFiles.value
  if (!files.length) return
  try {
    const r = await importJournalFiles(files)
    const addedParts = []
    if (r.notesAdded) addedParts.push(`${r.notesAdded} note${r.notesAdded !== 1 ? 's' : ''}`)
    if (r.holidaysAdded) addedParts.push(`${r.holidaysAdded} holiday${r.holidaysAdded !== 1 ? 's' : ''}`)
    if (r.readAdded) addedParts.push(`${r.readAdded} read status${r.readAdded !== 1 ? 'es' : ''}`)
    if (r.settingsApplied) addedParts.push(`${r.settingsApplied} setting${r.settingsApplied !== 1 ? 's' : ''}`)
    if (r.tradeNotesApplied) addedParts.push(`${r.tradeNotesApplied} trade note${r.tradeNotesApplied !== 1 ? 's' : ''}`)
    const skipped = r.notesSkipped + r.holidaysSkipped + r.readSkipped + r.settingsSkipped + r.tradeNotesSkipped
    if (!addedParts.length && !skipped) {
      toast.warn('No recognizable Journal Data files selected')
      closeRestoreModal()
      return
    }
    let msg = addedParts.length ? `Restored ${addedParts.join(', ')}` : 'Nothing new to restore'
    if (skipped > 0) msg += ` (${skipped} already existed)`
    toast.success(msg)
    closeRestoreModal()
  } catch (err) {
    console.error(err)
    toast.error('Restore failed: ' + err.message)
  }
}
</script>
