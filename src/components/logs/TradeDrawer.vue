<template>
  <Teleport to="body">
  <div class="fixed inset-0 z-40 flex justify-end">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-surface-0/60 backdrop-blur-sm" @click="$emit('close')"></div>

    <!-- Drawer -->
    <div class="relative w-full max-w-sm bg-surface-2 border-l border-border h-screen flex flex-col overflow-hidden shadow-2xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div class="flex items-center gap-3">
          <span class="font-mono font-bold text-ink text-lg">{{ trade.symbol }}</span>
          <span :class="trade.pnl >= 0 ? 'badge-up' : 'badge-down'">{{ trade.pnl >= 0 ? 'Win' : 'Loss' }}</span>
        </div>
        <TooltipWrap tip="Close">
          <button @click="$emit('close')" class="p-1.5 rounded-lg hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </TooltipWrap>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">

        <!-- P&L hero -->
        <div class="text-center py-4 bg-surface-3 rounded-xl">
          <div class="font-mono text-3xl font-bold" :class="trade.pnl >= 0 ? 'text-up' : 'text-down'">
            {{ fmt(trade.pnl) }}
          </div>
          <div class="text-xs text-ink mt-1">Net P&L</div>
        </div>

        <!-- Details grid -->
        <div class="grid grid-cols-2 gap-3">
          <div v-for="d in details" :key="d.label" class="bg-surface-3 rounded-lg px-3 py-2.5">
            <div class="text-2xs text-ink-faint mb-1">{{ d.label }}</div>
            <div class="text-xs font-medium font-mono" :class="d.class || 'text-ink'">{{ d.val }}</div>
          </div>
        </div>

        <!-- Notes: same rich-text editor as the Journal, so formatting carries
             over between the two. Collapsed into the drawer by default; the
             expand button pops it into a full-screen overlay since the
             drawer itself is too narrow to write much in comfortably. -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="input-label !mb-0">Notes</label>
            <TooltipWrap tip="Full screen">
              <button type="button" @click="fullscreenNotes = true" class="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            </TooltipWrap>
          </div>
          <!-- The editor moves into the full-screen overlay below while
               fullscreenNotes is true — this box used to just disappear
               (v-if) and leave a gap in the drawer where the notes
               editor had been. A same-size skeleton holds that spot
               instead, so the drawer's layout doesn't jump when you
               open or close full screen. -->
          <div class="bg-surface-3 border border-border rounded-lg px-3 py-2">
            <QuillEditor v-if="!fullscreenNotes" v-model="notes" placeholder="What went well? What to improve?" @update:model-value="saveNotesDebounced" />
            <Skeleton v-else class="h-[140px] w-full" />
          </div>
        </div>

        <!-- Tags: multi-select from the Tags list set up in Settings -->
        <div>
          <label class="input-label">Tags</label>
          <div v-if="tagList.length" class="flex flex-wrap gap-1.5 mb-2">
            <span v-for="tag in tagList" :key="tag"
              class="badge-tag cursor-pointer"
              @click="removeTag(tag)">
              {{ tag }} ×
            </span>
          </div>
          <Dropdown v-model="tagList" :options="tagOptions" multiple full-width
            override-label="+ Add tag" empty-message="No tags yet — add some in Settings."
            @update:model-value="saveNotes" />
        </div>

        <!-- Strategy: single-select from the Strategies list set up in Settings -->
        <div>
          <label class="input-label">Strategy</label>
          <Dropdown v-model="strategyDropdownValue" :options="strategyOptions" full-width />
        </div>

        <!-- Chart image -->
        <div>
          <label class="input-label">Chart image</label>

          <div v-if="chartImage" class="bg-surface-3 border border-border rounded-lg overflow-hidden relative group cursor-pointer" @click="lightboxOpen = true">
            <img v-if="chartImageUrl" :src="chartImageUrl" alt="Chart" class="w-full h-40 object-cover" />
            <div v-else class="w-full h-40 flex flex-col items-center justify-center gap-2 bg-down/5">
              <svg class="w-5 h-5 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" stroke-linecap="round"/>
                <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none"/>
              </svg>
              <span class="text-2xs text-down">File not found</span>
              <button @click.stop="clearBrokenChartImage" class="text-2xs text-down bg-down/10 rounded-full px-3 py-1 hover:bg-down/20 transition-colors">Clear</button>
            </div>
            <div v-if="chartImageUrl" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button @click.stop="removeChartImage" class="flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-2xs text-ink hover:bg-surface-3 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Remove
              </button>
            </div>
          </div>

          <TooltipWrap v-else-if="!hasImageFolder" tip="Connect a chart image folder in Settings first.">
            <button disabled
              class="w-full flex items-center justify-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-2xs text-ink-faint cursor-not-allowed opacity-60">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              Add chart
            </button>
          </TooltipWrap>

          <button v-else @click="chartFileInput.click()"
            class="w-full flex items-center justify-center gap-1.5 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-2xs text-ink-muted hover:text-ink hover:border-border-strong transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
            </svg>
            Add chart
          </button>
          <input ref="chartFileInput" type="file" accept="image/*" class="hidden" @change="onChartFileSelected" />
        </div>

      </div>
    </div>
  </div>
  </Teleport>

  <!-- Full-screen notes overlay — same editor instance's worth of state
       (bound to the same `notes` ref), just given the whole viewport to
       write in instead of the drawer's ~380px column. -->
  <Teleport to="body">
    <div v-if="fullscreenNotes" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" @click.self="fullscreenNotes = false">
      <div class="bg-surface-2 border border-border-strong rounded-xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <p class="text-sm font-medium text-ink">{{ trade.symbol }} — Notes</p>
          <TooltipWrap tip="Close">
            <button type="button" @click="fullscreenNotes = false" class="p-1.5 rounded-lg hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </TooltipWrap>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <QuillEditor v-model="notes" placeholder="What went well? What to improve?" @update:model-value="saveNotesDebounced" />
        </div>
      </div>
    </div>
  </Teleport>

  <ImageLightbox
    :visible="lightboxOpen"
    :src="chartImageUrl"
    :alt="trade.symbol + ' chart'"
    @close="lightboxOpen = false" />
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import ImageLightbox from '@/components/ui/ImageLightbox.vue'
import Dropdown from '@/components/ui/Dropdown.vue'
import QuillEditor from '@/components/ui/QuillEditor.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useTradesStore } from '@/stores/trades'
import { useTradeMetaStore } from '@/stores/tradeMeta'
import { useImageStorageStore } from '@/stores/imageStorage'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { fmt } from '@/lib/stats'
import { format, parseISO } from 'date-fns'

const props = defineProps({ trade: { type: Object, required: true } })
const emit  = defineEmits(['close'])

const tradesStore    = useTradesStore()
const tradeMetaStore = useTradeMetaStore()
const imageStorageStore = useImageStorageStore()
const toast = useToast()
const { confirm: $confirm } = useConfirm()

const notes    = ref(props.trade.notes || '')
const tagList  = ref(Array.isArray(props.trade.tags) ? [...props.trade.tags] : [])
const strategy = ref(props.trade.strategy || null)
const fullscreenNotes = ref(false)

// Tags use the shared Dropdown component's multi-select mode — it takes
// plain { value, label } options like everywhere else Dropdown is used.
const tagOptions = computed(() => tradeMetaStore.tags.map(t => ({ value: t.text, label: t.text })))

// Strategy uses the shared Dropdown component, which needs a plain string
// modelValue — map "no strategy" to a sentinel and back.
const NO_STRATEGY = '__none__'
const strategyOptions = computed(() => [
  { value: NO_STRATEGY, label: 'No strategy' },
  ...tradeMetaStore.strategies.map(s => ({ value: s.text, label: s.text })),
])
const strategyDropdownValue = computed({
  get: () => strategy.value || NO_STRATEGY,
  set: (v) => {
    strategy.value = v === NO_STRATEGY ? null : v
    saveNotes()
  },
})

function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy HH:mm') } catch { return iso }
}

const details = computed(() => [
  { label: 'Side',       val: props.trade.side || 'Long' },
  { label: 'Qty',        val: props.trade.qty },
  { label: 'Entry',      val: props.trade.buy_price != null ? props.trade.buy_price.toFixed(4) : '—' },
  { label: 'Exit',       val: props.trade.sell_price != null ? props.trade.sell_price.toFixed(4) : '—' },
  { label: 'Opened',     val: fmtDate(props.trade.bought_at) },
  { label: 'Closed',     val: fmtDate(props.trade.sold_at) },
  { label: 'Duration',   val: props.trade.duration || '—' },
])

async function saveNotes() {
  await tradesStore.updateTrade(props.trade.id, { notes: notes.value, tags: tagList.value, strategy: strategy.value })
}

// QuillEditor emits update:model-value on every keystroke — calling
// saveNotes() straight from that fired a Supabase write (and, via it, a
// full tradesStore.trades reassignment) on every single character typed.
// Besides being wasteful, that constant trades.value churn was the root
// cause of the Journal's day chart flickering while typing a trade's
// notes elsewhere in the app (see the fingerprint check added around
// JournalView's tradesStore.trades watcher). Debouncing means the write
// only happens once typing actually pauses.
let saveNotesTimer = null
let saveNotesPending = false
function saveNotesDebounced() {
  saveNotesPending = true
  clearTimeout(saveNotesTimer)
  saveNotesTimer = setTimeout(() => { saveNotesPending = false; saveNotes() }, 600)
}
// Flush straight away if the drawer closes mid-debounce — e.g. clicking
// away right after typing — so the last keystrokes aren't lost.
onBeforeUnmount(() => {
  clearTimeout(saveNotesTimer)
  if (saveNotesPending) saveNotes()
})

function removeTag(tag) {
  tagList.value = tagList.value.filter(t => t !== tag)
  saveNotes()
}

// ── Chart image — same storage/behavior as the daily journal's chart image,
// just keyed off this trade's id instead of a journal entry key. Tracked as
// local state (like notes/tagList/strategy above) rather than read straight
// off props.trade: updateTrade() replaces the store's trades array with new
// trade objects, but the parent still holds its own (now-stale) reference to
// the old one, so a prop-derived value here wouldn't reflect the upload
// until the drawer was closed and reopened.
const chartFileInput = ref(null)
const lightboxOpen   = ref(false)
const chartImageUrl  = ref(null)
const chartImage     = ref(props.trade.chartImage || null)
const hasImageFolder = computed(() => !!imageStorageStore.dirHandle && !imageStorageStore.needsPermission)

async function loadChartImageUrl() {
  chartImageUrl.value = null
  if (!chartImage.value) return
  chartImageUrl.value = await imageStorageStore.getImageUrl(chartImage.value)
}
watch(chartImage, loadChartImageUrl, { immediate: true })

// `accept="image/*"` on the <input> is only a hint to the OS file picker —
// nothing stops a user from typing a different extension into the picker's
// filename box or dragging a renamed file in, so the actual type (and a
// sane size cap, so a multi-hundred-MB file doesn't get written straight
// into the chart image folder) are checked here too.
const MAX_CHART_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

async function onChartFileSelected(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  if (!hasImageFolder.value) {
    toast.warn('Connect a chart image folder in Settings first.')
    return
  }

  if (!file.type.startsWith('image/')) {
    toast.error('That file isn\'t an image — pick a PNG, JPG, or similar.')
    return
  }
  if (file.size > MAX_CHART_IMAGE_BYTES) {
    toast.error('That image is too large (max 10MB).')
    return
  }

  try {
    const filename = await imageStorageStore.saveImage('trade_' + props.trade.id, file)
    await tradesStore.updateTrade(props.trade.id, { chartImage: filename })
    chartImage.value = filename
  } catch (err) {
    console.error('Could not save chart image:', err)
    toast.error('Could not save the chart image.')
  }
}

async function removeChartImage() {
  if (!chartImage.value) return
  if (!await $confirm({ title: 'Remove Chart Image', message: 'This chart image will be permanently deleted and cannot be restored.', confirmLabel: 'Remove', danger: true })) return
  const deleted = await imageStorageStore.deleteImage(chartImage.value)
  await tradesStore.updateTrade(props.trade.id, { chartImage: null })
  chartImage.value = null
  if (!deleted) {
    toast.warn('The image reference was removed, but the file could not be deleted from disk.')
  }
}

async function clearBrokenChartImage() {
  await tradesStore.updateTrade(props.trade.id, { chartImage: null })
  chartImage.value = null
}
</script>
