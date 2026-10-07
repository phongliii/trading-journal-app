<template>
  <div :class="fullWidth ? 'relative block w-full' : 'relative inline-block'" ref="root">
    <button
      type="button"
      ref="triggerBtn"
      class="flex items-center gap-1.5 bg-surface-3 border rounded-md px-2 py-1 text-2xs text-ink-muted outline-none transition-colors whitespace-nowrap"
      :class="[open ? 'border-brand' : 'border-border', fullWidth ? 'w-full justify-between px-3 py-2' : '']"
      @click="toggleOpen">
      <span :class="fullWidth ? 'truncate' : ''">{{ overrideLabel || selectedLabel }}</span>
      <svg class="w-3 h-3 flex-shrink-0" :class="open ? 'text-brand' : 'text-ink-faint'" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <polyline v-if="open" points="18 15 12 9 6 15"/>
        <polyline v-else points="6 9 12 15 18 9"/>
      </svg>
    </button>
  </div>

  <!-- Teleported to body (like the Pick-a-year modal below) and positioned
       with fixed coordinates computed from the trigger's own position —
       an absolutely-positioned panel here would get clipped by any
       ancestor card that sets overflow-hidden (e.g. Settings' cards). -->
  <Teleport to="body">
    <div v-if="open" ref="panelEl"
      class="fixed w-max bg-surface-3 border border-border rounded-lg shadow-2xl z-[60] max-h-48 overflow-y-auto"
      :style="panelStyle">
      <div v-if="multiple && emptyMessage && !nonAllOptions.length" class="px-3 py-3 text-2xs text-ink-faint">{{ emptyMessage }}</div>
      <template v-for="item in groupedNonAllOptions" :key="item.isGroup ? 'group:' + item.group : 'opt:' + item.value">
        <div v-if="item.isGroup" class="px-3 pt-2 pb-1 text-2xs font-semibold text-ink-faint uppercase tracking-wide select-none first:rounded-t-lg">{{ item.group }}</div>
        <button v-else
          type="button"
          class="flex items-center gap-2 w-full text-left px-3 py-1.5 text-2xs whitespace-nowrap transition-colors hover:bg-surface-4 first:rounded-t-lg"
          :class="!multiple && !forceNoActive && item.value === modelValue ? 'text-brand' : 'text-ink'"
          @click="select(item.value)">
          <span v-if="multiple" class="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
            :class="isChecked(item.value) ? 'bg-brand border-brand' : 'border-border-strong'">
            <svg v-if="isChecked(item.value)" class="w-2.5 h-2.5 text-surface-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          {{ item.label }}
        </button>
      </template>
      <button
        v-if="yearOptions && yearOptions.length"
        type="button"
        class="block w-full text-left px-3 py-1.5 text-2xs whitespace-nowrap transition-colors hover:bg-surface-4"
        :class="[isYearSelected ? 'text-brand' : 'text-ink', !allOption ? 'last:rounded-b-lg' : '']"
        @click="openYearModal">
        Pick a year
      </button>
      <button
        v-if="allOption"
        type="button"
        class="block w-full text-left px-3 py-1.5 text-2xs whitespace-nowrap transition-colors hover:bg-surface-4 border-t border-border last:rounded-b-lg"
        :class="!forceNoActive && allOption.value === modelValue ? 'text-brand' : 'text-ink'"
        @click="select(allOption.value)">
        {{ allOption.label }}
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="yearModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="yearModalOpen = false">
      <div class="bg-surface-3 border border-border-strong rounded-xl w-64 p-4 shadow-2xl">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-medium text-ink">Pick a year</p>
          <button type="button" class="text-ink-faint hover:text-ink transition-colors" aria-label="Close" @click="yearModalOpen = false">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2 max-h-[132px] overflow-y-auto pr-0.5">
          <button
            v-for="y in yearOptions" :key="y"
            type="button"
            class="py-2 text-2xs rounded-md border transition-colors"
            :class="y === highlightYear ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-surface-4 border-border text-ink hover:border-border-strong'"
            @click="selectYear(y)">
            {{ y }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Small custom-styled dropdown, same pattern as the Export page's data-type
// menu (a native <select>'s open menu can't be themed): a button showing the
// selected label + chevron, and an absolutely-positioned option list under
// it that closes on an outside click. Shared here so any card-local picker
// (e.g. the Dashboard's Performance period selectors) looks and behaves the
// same way instead of re-implementing this per usage.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  // A single value (String) normally, or an array of values when `multiple`
  // is set — e.g. a trade's list of tags.
  modelValue:     { type: [String, Array], required: true },
  options:        { type: Array, required: true }, // [{ value, label }]
  yearOptions:    { type: Array, default: () => [] }, // optional: [2023, 2024, ...]
  // Which year counts as "currently selected" in the Pick-a-year modal —
  // passed in explicitly because a shortcut like 'thisYear'/'lastYear'
  // should still highlight its equivalent year, not just a literal
  // modelValue of 'year:YYYY'.
  highlightYear:  { type: Number, default: null },
  // When set, shown instead of the label derived from modelValue/options —
  // e.g. a month clicked in another card that this dropdown doesn't itself
  // have an option for, or the static trigger text for a `multiple` picker
  // (selections are shown elsewhere, e.g. as pills above the trigger).
  overrideLabel:  { type: String, default: '' },
  // When true, none of the options list highlights as selected — used
  // alongside overrideLabel when the real selection came from outside this
  // dropdown (modelValue is stale/irrelevant while that's active).
  forceNoActive:  { type: Boolean, default: false },
  // Stretches the trigger (and dropdown) to the width of its container —
  // used when this dropdown sits in a form field layout instead of a
  // compact inline control like the Dashboard's period pickers.
  fullWidth:      { type: Boolean, default: false },
  // Multi-select mode: modelValue is an array, clicking an option toggles
  // it (checkbox-style) instead of replacing the value and closing the
  // menu. Used for picking several tags on a trade at once.
  multiple:       { type: Boolean, default: false },
  // Message shown in place of the options list when `multiple` is true and
  // there are no options to pick from yet.
  emptyMessage:   { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const yearModalOpen = ref(false)
const root = ref(null)
const triggerBtn = ref(null)
const panelEl = ref(null)
const panelStyle = ref('')
const isYearSelected = computed(() => !props.multiple && props.modelValue.startsWith('year:'))
const selectedLabel = computed(() => {
  if (props.multiple) return ''
  if (isYearSelected.value) return props.modelValue.slice('year:'.length)
  return props.options.find(o => o.value === props.modelValue)?.label || ''
})
// "All" is pulled out and rendered last (after the "Pick a year" row)
// regardless of where it sits in the options array, so callers don't have
// to reorder their own option lists to get that layout.
const nonAllOptions = computed(() => props.options.filter(o => o.value !== 'all'))
const allOption = computed(() => props.options.find(o => o.value === 'all') || null)

// Options can optionally carry a `group` (e.g. timezone region) — when
// present, a non-clickable header row is inserted above the first option of
// each new group. Options without a `group` (the common case) render
// exactly as before, no headers.
const groupedNonAllOptions = computed(() => {
  const items = []
  let lastGroup
  for (const opt of nonAllOptions.value) {
    if (opt.group !== undefined && opt.group !== lastGroup) {
      items.push({ isGroup: true, group: opt.group })
      lastGroup = opt.group
    }
    items.push({ isGroup: false, ...opt })
  }
  return items
})

function isChecked(value) {
  return props.multiple && Array.isArray(props.modelValue) && props.modelValue.includes(value)
}

function select(value) {
  if (props.multiple) {
    const next = isChecked(value)
      ? props.modelValue.filter(v => v !== value)
      : [...props.modelValue, value]
    emit('update:modelValue', next)
    // Stays open — picking one tag shouldn't close the menu on a
    // multi-select picker.
    return
  }
  emit('update:modelValue', value)
  open.value = false
}
function openYearModal() {
  open.value = false
  yearModalOpen.value = true
}
function selectYear(year) {
  emit('update:modelValue', `year:${year}`)
  yearModalOpen.value = false
}

// The options panel is teleported to <body> (see template), positioned with
// fixed coordinates computed from the trigger button's own rect — so it's
// never clipped by an ancestor card that sets overflow-hidden.
async function toggleOpen() {
  if (open.value) { open.value = false; return }
  open.value = true
  await nextTick()
  updatePanelPosition()
}

function updatePanelPosition() {
  if (!triggerBtn.value || !panelEl.value) return
  const rect = triggerBtn.value.getBoundingClientRect()
  const panelW = panelEl.value.offsetWidth
  const panelH = panelEl.value.offsetHeight
  const margin = 6

  // Prefer opening below the trigger; flip above only if there's not
  // enough room below but there is above.
  const spaceBelow = window.innerHeight - rect.bottom
  const showAbove = spaceBelow < panelH + margin && rect.top > panelH + margin
  const top = showAbove ? rect.top - panelH - margin : rect.bottom + margin

  // Left-align with the trigger by default, clamped so it never runs off
  // the right edge of the viewport.
  let left = rect.left
  const maxLeft = window.innerWidth - panelW - margin
  if (left > maxLeft) left = Math.max(margin, maxLeft)

  panelStyle.value = `top:${top}px; left:${left}px; min-width:${rect.width}px;`
}

function onClickOutside(e) {
  if (!open.value) return
  const insideTrigger = root.value && root.value.contains(e.target)
  const insidePanel = panelEl.value && panelEl.value.contains(e.target)
  if (!insideTrigger && !insidePanel) open.value = false
}
function onKeydown(e) {
  if (e.key === 'Escape' && yearModalOpen.value) yearModalOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>
