<template>
  <div class="relative inline-block">
    <button v-if="noteMode" ref="triggerBtn" @click="open = !open"
      class="text-2xs text-brand hover:underline whitespace-nowrap">+ New</button>
    <button v-else ref="triggerBtn" @click="open = !open"
      class="flex items-center gap-2 px-3 py-1.5 text-xs text-ink bg-surface-2 border border-border rounded-lg hover:border-border-strong transition-colors">
      <svg class="w-3.5 h-3.5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span>{{ displayLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
    </Teleport>

    <div v-if="open" class="absolute z-50 mt-2 bg-surface-2 border border-border rounded-2xl shadow-2xl flex overflow-hidden" :class="alignLeft ? 'left-0' : 'right-0'" :style="noteMode ? 'width: 320px;' : 'min-width: 520px;'">

      <!-- Presets -->
      <div v-if="!noteMode" class="w-40 border-r border-border py-2 flex-shrink-0">
        <button v-for="preset in presets" :key="preset.label"
          @click="applyPreset(preset)"
          class="w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between"
          :class="activePreset === preset.label ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-3 hover:text-ink'">
          {{ preset.label }}
          <span v-if="activePreset === preset.label" class="text-brand">✓</span>
        </button>
      </div>

      <!-- Calendar -->
      <div class="p-4 flex-1">
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
          <button @click="navPrev" class="p-1 rounded hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors">◀</button>
          <button v-if="view === 'days'" @click="view = 'months'"
            class="text-sm font-semibold text-ink hover:text-brand transition-colors">
            {{ format(viewMonth, 'MMMM yyyy') }}
          </button>
          <button v-else-if="view === 'months'" @click="view = 'years'"
            class="text-sm font-semibold text-ink hover:text-brand transition-colors">
            {{ viewMonth.getFullYear() }}
          </button>
          <!-- Last step: clicking the label goes back to the first step -->
          <button v-else @click="view = firstView"
            class="text-sm font-semibold text-ink hover:text-brand transition-colors">
            {{ yearRange[0] }} – {{ yearRange[yearRange.length - 1] }}
          </button>
          <button @click="navNext" class="p-1 rounded hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors">▶</button>
        </div>

        <!-- With `fixedHeight`, all three views (years / months / days) are
             rendered and stacked in the same grid cell with only the active
             one visible, so the area is always as tall as the tallest view
             (the 6-row day grid) and the divider and buttons underneath never
             move. Hidden views use `invisible` (not display:none) so they
             keep their height but can't be clicked or tabbed to. Without it,
             only the active view is rendered and the popup sizes to it. -->
        <div class="grid">
          <!-- Year picker -->
          <div v-if="fixedHeight || view === 'years'" class="grid grid-cols-3 gap-2 content-start" style="grid-area: 1 / 1;"
            :class="view !== 'years' ? 'invisible' : ''" :aria-hidden="view !== 'years'">
            <button v-for="y in yearRange" :key="y" @click="selectYear(y)" :disabled="noteMode && y > todayYear"
              class="relative rounded-lg text-xs font-medium transition-colors" :style="noteMode ? 'height: 44px;' : ''"
              :class="[noteMode ? '' : 'py-2', yearClass(y)]">
              {{ y }}
            </button>
          </div>

          <!-- Month picker -->
          <div v-if="fixedHeight || view === 'months'" class="grid grid-cols-3 gap-2 content-start" style="grid-area: 1 / 1;"
            :class="view !== 'months' ? 'invisible' : ''" :aria-hidden="view !== 'months'">
            <button v-for="(m, i) in MONTHS" :key="m" @click="selectMonth(i)" :disabled="noteMode && monthLocked(i)"
              class="relative rounded-lg text-xs font-medium transition-colors" :style="noteMode ? 'height: 44px;' : ''"
              :class="[noteMode ? '' : 'py-2', monthClass(i)]">
              {{ m }}
            </button>
          </div>

          <!-- Day grid -->
          <div v-if="fixedHeight || view === 'days'" style="grid-area: 1 / 1;" :class="view !== 'days' ? 'invisible' : ''" :aria-hidden="view !== 'days'">
            <div class="grid grid-cols-7 mb-1">
              <div v-for="(d,i) in ['S','M','T','W','T','F','S']" :key="i" class="text-center text-2xs text-ink-faint py-1">{{ d }}</div>
            </div>
            <!-- No colour transition on day cells: cells are keyed by date, so a day
                 that stays on screen while paging (e.g. the 29th–31st shown as
                 "previous month" days) would otherwise fade from bright to dim
                 instead of just switching. -->
            <div class="grid grid-cols-7 gap-0.5">
              <button v-for="cell in cells" :key="cell.key"
                @click="selectDay(cell.date, cell.inMonth)"
                @mouseenter="hoverDate = cell.key"
                @mouseleave="hoverDate = ''"
                :disabled="noteMode && cell.future"
                class="relative aspect-square text-xs flex items-center justify-center"
                :class="[noteMode ? '' : 'rounded-lg', dayClass(cell)]">
                {{ cell.num }}
              </button>
            </div>
          </div>
        </div>

        <!-- Actions (note mode) -->
        <div v-if="noteMode" class="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border">
          <span class="text-2xs font-semibold text-ink truncate">{{ selectionLabel }}</span>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button @click="open = false" class="text-2xs text-ink-muted hover:text-ink transition-colors">Cancel</button>
            <button @click="confirmNote" :disabled="!selectedKey"
              class="btn btn-primary btn-sm text-2xs" :class="!selectedKey ? 'opacity-40 cursor-not-allowed' : ''">
              {{ selectedExists ? 'Open note →' : '+ Create note' }}
            </button>
          </div>
        </div>

        <!-- Actions (range mode) -->
        <div v-else class="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div></div>
          <div class="flex items-center gap-3">
            <button @click="clearSelection" class="text-2xs text-ink-muted hover:text-down transition-colors">Clear</button>
            <button @click="applySelection" :disabled="!isComplete"
              class="btn btn-primary btn-sm text-2xs"
              :class="!isComplete ? 'opacity-40 cursor-not-allowed' : ''">Apply</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks, addDays,
  eachDayOfInterval, isSameMonth,
  addMonths, subMonths, addYears, subYears, isWithinInterval,
  subDays, startOfYear, endOfYear } from 'date-fns'
import { useTimezoneStore } from '@/stores/timezone'
import { weekKey } from '@/lib/journalKeys'

const props = defineProps({
  modelValue: { type: String, default: '' },
  rangeStart: { type: String, default: '' },
  rangeEnd:   { type: String, default: '' },
  // 'range' = the normal Trades/Dashboard/Export picker. 'daily' | 'weekly' |
  // 'monthly' = note mode, the Journal's "+ New": no presets, single
  // selection, Create/Open footer.
  mode:       { type: String, default: 'range' },
  // Note mode: keys that already have a note (yyyy-MM-dd, yyyy-Www, yyyy-MM)
  existing:   { type: Array, default: () => [] },
  // Keep the popup the same height for every view and month, so the divider
  // and buttons never move (Trades log). Off = size to the content.
  fixedHeight: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'update:rangeStart', 'update:rangeEnd', 'create', 'open'])

const tzStore = useTimezoneStore()

// Note mode (Journal "+ New") vs. the normal range picker.
const noteMode = computed(() => props.mode !== 'range')
// The first step of the header drill-down: what you land on when opening,
// and where the year-range label (the last step) takes you back to.
const firstView = computed(() => props.mode === 'monthly' ? 'months' : 'days')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function localParse(ds) {
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toStr(d) { return format(d, 'yyyy-MM-dd') }

// "Today" per the app's own timezone setting (Settings → Time Zone), not
// just the browser's local clock — so presets like "This Month" and the
// calendar's today-highlight agree with the rest of the app (Journal,
// Calendar) even when a manual timezone override is set.
const today = () => tzStore.localDateObj()
const isTodayFn = (d) => toStr(d) === toStr(today())

// Weeks run Sunday–Saturday, matching the calendar page's own week rows.
const presets = [
  { label: 'Today',         start: () => toStr(today()),                        end: () => toStr(today()) },
  { label: 'Yesterday',     start: () => toStr(subDays(today(), 1)),             end: () => toStr(subDays(today(), 1)) },
  { label: 'This Week',     start: () => toStr(startOfWeek(today(), { weekStartsOn: 0 })), end: () => toStr(endOfWeek(today(), { weekStartsOn: 0 })) },
  { label: 'Last Week',     start: () => toStr(startOfWeek(subWeeks(today(), 1), { weekStartsOn: 0 })), end: () => toStr(endOfWeek(subWeeks(today(), 1), { weekStartsOn: 0 })) },
  { label: 'This Month',    start: () => toStr(startOfMonth(today())),           end: () => toStr(endOfMonth(today())) },
  { label: 'Last Month',    start: () => toStr(startOfMonth(subMonths(today(), 1))), end: () => toStr(endOfMonth(subMonths(today(), 1))) },
  { label: 'Last 12 Months',start: () => toStr(subMonths(today(), 12)),              end: () => toStr(today()) },
  { label: 'Last Year',     start: () => toStr(startOfYear(subMonths(today(), 12))), end: () => toStr(endOfYear(subMonths(today(), 12))) },
  { label: 'YTD',           start: () => toStr(startOfYear(today())),           end: () => toStr(today()), showDateRange: true },
  { label: 'Custom Range', custom: true },
]

const open         = ref(false)
const view         = ref('days')
const viewMonth    = ref(today())
const pendingStart = ref('')
const pendingEnd   = ref('')
const hoverDate    = ref('')
const activePreset = ref('')
const triggerBtn   = ref(null)
const alignLeft    = ref(false)
const selectedDate = ref('') // note mode: picked day (weekly: any day in the week; monthly: 1st of month)

// The popup defaults to right-aligned (expanding leftward from the
// trigger), which is fine when there's room to the left — but a trigger
// sitting near the left edge of the page pushes the ~520px-wide popup off
// the left of the screen. Pick whichever side actually has more room.
function updateAlignment() {
  if (!triggerBtn.value) return
  const rect = triggerBtn.value.getBoundingClientRect()
  const spaceLeft  = rect.right               // room to expand leftward (right-aligned)
  const spaceRight = window.innerWidth - rect.left // room to expand rightward (left-aligned)
  alignLeft.value = spaceRight > spaceLeft
}

watch(open, (isOpen) => {
  if (isOpen && noteMode.value) {
    // Preselect the current day / week / month. On a Sunday the week's
    // Mon–Fri band is the *next* one (grid is Sunday-first), so use Friday
    // to land on the week that just ended, like the Journal's own weekKey.
    const now = today()
    selectedDate.value = props.mode === 'monthly' ? toStr(startOfMonth(now))
      : props.mode === 'weekly' && now.getDay() === 0 ? toStr(subDays(now, 2))
      : toStr(now)
    viewMonth.value = localParse(selectedDate.value)
    view.value = firstView.value
    nextTick(updateAlignment)
    return
  }
  if (isOpen) {
    pendingStart.value = props.rangeStart || props.modelValue || ''
    pendingEnd.value   = props.rangeEnd || ''
    // Show later date's month
    if (pendingEnd.value) viewMonth.value = localParse(pendingEnd.value)
    else if (pendingStart.value) viewMonth.value = localParse(pendingStart.value)
    else viewMonth.value = today()
    view.value = 'days'
    nextTick(updateAlignment)
    // Detect active preset
    activePreset.value = detectPreset()
  }
})

watch(() => props.mode, () => { open.value = false })

function detectPreset() {
  const s = props.rangeStart || props.modelValue
  const e = props.rangeEnd || props.modelValue
  if (!s) return ''
  for (const p of presets) {
    if (p.custom) continue
    if (p.start() === s && p.end() === e) return p.label
  }
  return 'Custom Range'
}

const appliedStart = computed(() => props.rangeStart || props.modelValue || '')
const appliedEnd   = computed(() => props.rangeEnd || '')

const isComplete = computed(() => {
  const hasComplete = !!(pendingStart.value && pendingEnd.value)
  const isClearing  = !pendingStart.value && !pendingEnd.value && !!(appliedStart.value || appliedEnd.value)
  const changed = pendingStart.value !== appliedStart.value || pendingEnd.value !== appliedEnd.value
  return (hasComplete || isClearing) && changed
})

const yearRange = computed(() => {
  const base = Math.floor(viewMonth.value.getFullYear() / 12) * 12
  return Array.from({ length: 12 }, (_, i) => base + i)
})

const displayLabel = computed(() => {
  const s = props.rangeStart || props.modelValue
  const e = props.rangeEnd
  // Check if matches a preset
  const preset = presets.find(p => !p.custom && p.start() === s && p.end() === (e || s))
  if (preset && !preset.showDateRange) return preset.label
  if (s && e && s !== e) return `${format(localParse(s), 'MMM d')} – ${format(localParse(e), 'MMM d')}`
  if (s) return format(localParse(s), 'MMM d, yyyy')
  return 'Select date'
})

// With `fixedHeight` the grid is always 6 weeks (42 days), so paging
// between months with 4, 5 or 6 weeks doesn't resize the popup; the extra
// row is just the next month's leading days, dimmed like the others.
// Otherwise it's only as many weeks as the month needs.
const cells = computed(() => {
  const start = startOfWeek(startOfMonth(viewMonth.value))
  const end   = props.fixedHeight ? addDays(start, 41) : endOfWeek(endOfMonth(viewMonth.value))
  return eachDayOfInterval({ start, end }).map(d => ({
    key: toStr(d), date: d, num: d.getDate(),
    inMonth: isSameMonth(d, viewMonth.value),
    isToday: isTodayFn(d),
    future: noteMode.value ? isFutureCell(d) : false,
  }))
})

function dayClass(cell) {
  if (noteMode.value) return noteDayClass(cell)
  const ds    = cell.key
  const start = pendingStart.value
  const end   = pendingEnd.value
  const hover = hoverDate.value

  let rangeStart = start, rangeEnd = end
  if (start && !end && hover && hover !== start) {
    rangeStart = hover < start ? hover : start
    rangeEnd   = hover < start ? start : hover
  }

  const isStart   = ds === start
  const isEnd     = ds === end
  const isInRange = rangeStart && rangeEnd
    ? isWithinInterval(cell.date, { start: localParse(rangeStart), end: localParse(rangeEnd) })
    : false

  const classes = []
  if (!cell.inMonth && !isInRange && !isStart && !isEnd) classes.push('text-ink-faint/30 hover:text-ink-faint')
  else if (cell.inMonth && cell.isToday && !isStart && !isEnd && !isInRange) classes.push('text-ink ring-1 ring-inset ring-ink-faint hover:bg-surface-3')
  else if (cell.inMonth && !isStart && !isEnd && !isInRange) classes.push('text-ink hover:bg-surface-3')
  if (isStart || isEnd) classes.push('bg-brand text-white hover:bg-brand z-10 relative')
  else if (isInRange) classes.push('bg-brand/20 text-ink')
  return classes.join(' ')
}

function yearClass(y) {
  if (noteMode.value) {
    if (y > todayYear.value) return 'text-ink-faint/30 cursor-not-allowed'
    // Current year highlighted, like the Trades picker
    return y === todayYear.value ? 'bg-brand text-white' : 'text-ink hover:bg-surface-3'
  }
  const now = today().getFullYear()
  if (!pendingStart.value) return y === now ? 'bg-brand text-white' : 'text-ink hover:bg-surface-3'
  const sy = parseInt(pendingStart.value.slice(0, 4))
  const ey = pendingEnd.value ? parseInt(pendingEnd.value.slice(0, 4)) : null
  if (y === sy || y === ey) return 'bg-brand text-white'
  if (ey && y > sy && y < ey) return 'bg-brand/20 text-ink'
  return 'text-ink hover:bg-surface-3'
}

function monthClass(i) {
  if (noteMode.value) return noteMonthClass(i)
  const year = viewMonth.value.getFullYear()
  const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`
  const now = today()
  if (!pendingStart.value) {
    return (i === now.getMonth() && year === now.getFullYear()) ? 'bg-brand text-white' : 'text-ink hover:bg-surface-3'
  }
  const ss = pendingStart.value.slice(0, 7)
  const es = pendingEnd.value ? pendingEnd.value.slice(0, 7) : ''
  if (monthStr === ss || monthStr === es) return 'bg-brand text-white'
  if (es && monthStr > ss && monthStr < es) return 'bg-brand/20 text-ink'
  return 'text-ink hover:bg-surface-3'
}

function navPrev() {
  if (view.value === 'days') viewMonth.value = subMonths(viewMonth.value, 1)
  else if (view.value === 'months') viewMonth.value = subYears(viewMonth.value, 1)
  else viewMonth.value = subYears(viewMonth.value, 12)
}
function navNext() {
  if (view.value === 'days') viewMonth.value = addMonths(viewMonth.value, 1)
  else if (view.value === 'months') viewMonth.value = addYears(viewMonth.value, 1)
  else viewMonth.value = addYears(viewMonth.value, 12)
}
function selectYear(y) {
  if (noteMode.value) return noteSelectYear(y)
  viewMonth.value = new Date(y, viewMonth.value.getMonth(), 1); view.value = 'months'
}
function selectMonth(i) {
  if (noteMode.value) return noteSelectMonth(i)
  viewMonth.value = new Date(viewMonth.value.getFullYear(), i, 1); view.value = 'days'
}

function selectDay(date, inMonth) {
  if (noteMode.value) return noteSelectDay(date, inMonth)
  const ds = toStr(date)
  if (!inMonth) viewMonth.value = new Date(date.getFullYear(), date.getMonth(), 1)
  activePreset.value = 'Custom Range'

  if (!pendingStart.value || pendingEnd.value) {
    pendingStart.value = ds; pendingEnd.value = ''
  } else if (ds === pendingStart.value) {
    pendingEnd.value = ds // same date twice = single day
  } else {
    if (ds < pendingStart.value) { pendingEnd.value = pendingStart.value; pendingStart.value = ds }
    else pendingEnd.value = ds
  }
}

function applyPreset(preset) {
  const s = preset.start()
  const e = preset.end()
  activePreset.value = preset.label
  emit('update:modelValue', '')
  emit('update:rangeStart', s)
  emit('update:rangeEnd', e)
  open.value = false
}

function clearSelection() {
  pendingStart.value = ''
  pendingEnd.value   = ''
  activePreset.value = ''
}

function applySelection() {
  if (!isComplete.value) return
  if (pendingStart.value && pendingEnd.value) {
    emit('update:modelValue', '')
    emit('update:rangeStart', pendingStart.value)
    emit('update:rangeEnd', pendingEnd.value)
  } else {
    emit('update:modelValue', '')
    emit('update:rangeStart', '')
    emit('update:rangeEnd', '')
  }
  open.value = false
}

// ── Note mode (Journal "+ New") ───────────────────────────────────────────
const todayYear = computed(() => today().getFullYear())

// The grid is Sunday-first, so a Sunday belongs to the Mon–Fri band on its right.
const rowMonday = (d) => addDays(startOfWeek(d, { weekStartsOn: 0 }), 1)
// Days are locked once in the future; in weekly mode a whole row is locked once its Monday is.
const isFutureCell = (d) => props.mode === 'weekly' ? toStr(rowMonday(d)) > toStr(today()) : toStr(d) > toStr(today())

const selectedKey = computed(() => {
  const ds = selectedDate.value
  if (!ds) return ''
  if (props.mode === 'weekly')  return weekKey(rowMonday(localParse(ds)))
  if (props.mode === 'monthly') return ds.slice(0, 7)
  return ds
})
const selectedExists = computed(() => !!selectedKey.value && props.existing.includes(selectedKey.value))
const selectionLabel = computed(() => {
  if (!selectedDate.value) return props.mode === 'monthly' ? 'Select a month' : props.mode === 'weekly' ? 'Select a week' : 'Select a day'
  const d = localParse(selectedDate.value)
  if (props.mode === 'monthly') return format(d, 'MMMM yyyy')
  if (props.mode === 'weekly') {
    const mon = rowMonday(d)
    return `Week ${selectedKey.value.split('-W')[1]} · ${format(mon, 'MMM d')} – ${format(addDays(mon, 4), 'MMM d')}`
  }
  return format(d, 'EEE, MMM d, yyyy')
})

const hoverMonday = computed(() => {
  if (props.mode !== 'weekly' || !hoverDate.value) return ''
  const mon = toStr(rowMonday(localParse(hoverDate.value)))
  return mon > toStr(today()) ? '' : mon
})
const selectedMonday = computed(() =>
  props.mode === 'weekly' && selectedDate.value ? toStr(rowMonday(localParse(selectedDate.value))) : '')

// Rounded outer ends of the Mon–Fri band.
const bandEdge = (dow) => dow === 1 ? 'rounded-l-lg' : dow === 5 ? 'rounded-r-lg' : ''

function noteDayClass(cell) {
  const c = []
  if (props.mode === 'weekly') {
    const dow = cell.date.getDay()
    const weekday = dow >= 1 && dow <= 5
    const mon = toStr(rowMonday(cell.date))
    const sel = weekday && selectedMonday.value === mon
    const hov = weekday && !sel && hoverMonday.value === mon
    if (sel) {
      c.push(dow === 1 || dow === 5 ? 'bg-brand text-white font-bold' : 'bg-brand/20 text-ink')
      c.push(bandEdge(dow))
    } else if (hov) {
      c.push('bg-brand/10 text-ink', bandEdge(dow))
    } else if (cell.future) c.push('text-ink-faint/30 cursor-not-allowed rounded-lg')
    else c.push((cell.inMonth ? 'text-ink' : 'text-ink-faint/40') + ' rounded-lg')
    if (cell.isToday && !sel) c.push('ring-1 ring-inset ring-ink-faint')
    return c.filter(Boolean).join(' ')
  }
  c.push('rounded-lg')
  if (cell.future) c.push('text-ink-faint/30 cursor-not-allowed')
  else if (selectedDate.value === cell.key) c.push('bg-brand text-white font-bold')
  else c.push(cell.inMonth ? 'text-ink hover:bg-surface-3' : 'text-ink-faint/40 hover:bg-surface-3')
  if (cell.isToday && selectedDate.value !== cell.key) c.push('ring-1 ring-inset ring-ink-faint')
  return c.join(' ')
}

const monthKeyOf = (i) => `${viewMonth.value.getFullYear()}-${String(i + 1).padStart(2, '0')}`
const monthLocked = (i) => monthKeyOf(i) > toStr(today()).slice(0, 7)
function noteMonthClass(i) {
  if (monthLocked(i)) return 'text-ink-faint/30 cursor-not-allowed'
  const isCurrent = monthKeyOf(i) === toStr(today()).slice(0, 7)
  if (props.mode === 'monthly') {
    // The picked month takes the solid fill; the current month keeps a ring.
    if (selectedKey.value === monthKeyOf(i)) return 'bg-brand text-white font-bold'
    return isCurrent ? 'text-ink ring-1 ring-inset ring-ink-faint hover:bg-surface-3' : 'text-ink hover:bg-surface-3'
  }
  // Daily / weekly drill-down: current month highlighted, like the Trades picker
  return isCurrent ? 'bg-brand text-white' : 'text-ink hover:bg-surface-3'
}

// A year pick goes straight back to the day grid (monthly stays on its month grid).
function noteSelectYear(y) {
  let m = viewMonth.value.getMonth()
  const now = today()
  if (y === now.getFullYear() && m > now.getMonth()) m = now.getMonth()
  viewMonth.value = new Date(y, m, 1)
  view.value = props.mode === 'monthly' ? 'months' : 'days'
}
function noteSelectMonth(i) {
  if (monthLocked(i)) return
  viewMonth.value = new Date(viewMonth.value.getFullYear(), i, 1)
  if (props.mode === 'monthly') selectedDate.value = `${monthKeyOf(i)}-01`
  else view.value = 'days'
}
function noteSelectDay(date, inMonth) {
  if (isFutureCell(date)) return
  if (!inMonth) viewMonth.value = new Date(date.getFullYear(), date.getMonth(), 1)
  selectedDate.value = toStr(date)
}
function confirmNote() {
  const key = selectedKey.value
  if (!key) return
  const exists = props.existing.includes(key)
  open.value = false
  emit(exists ? 'open' : 'create', key)
}
</script>
