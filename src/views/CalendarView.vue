<template>
  <div class="p-6 w-full min-w-[1000px]">

    <!-- Nav -->
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" @click="prev">◀</button>

        <!-- Clickable label steps month → year → decade, then back to month -->
        <button
          @click="toggleView"
          class="text-base font-semibold text-ink min-w-[160px] text-center hover:text-brand transition-colors"
        >
          {{ viewMode === 'month' ? format(current, 'MMMM yyyy') : viewMode === 'year' ? format(current, 'yyyy') : `${decadeStart} – ${decadeStart + 11}` }}
        </button>

        <button class="btn btn-ghost btn-sm" @click="next">▶</button>
        <button v-if="viewMode === 'decade'" class="btn btn-ghost btn-sm" @click="goToday">This Year</button>
        <button v-else-if="viewMode === 'year' || !isCurrentMonth" class="btn btn-ghost btn-sm" @click="goToday">This Month</button>
      </div>

      <!-- Stats pill — month view only -->
      <StatsPill v-if="viewMode === 'month'" label="Monthly stats:" :pnl="monthStats.totalPnl" :secondary="`${tradingDays} days`" />

      <!-- Stats pill — year view only -->
      <StatsPill v-else-if="viewMode === 'year'" label="Year P&L:" :pnl="yearStats.totalPnl" :secondary="`${yearStats.total} trades`" />
    </div>

    <!-- ── MONTH VIEW ── -->
    <div v-if="viewMode === 'month'" class="bg-surface-2 border border-border rounded-2xl overflow-hidden">

      <!-- Day cells — no header row, day name shown inline -->
      <div v-for="(row, ri) in calendarRows" :key="ri" class="grid grid-cols-8"
        :class="ri < calendarRows.length - 1 ? 'border-b border-border' : ''">

        <div v-for="(cell, ci) in row.days" :key="ci"
          class="relative min-h-[100px] border-r border-border p-2.5 transition-colors"
          :class="[
            ri === calendarRows.length - 1 && ci === 0 ? 'rounded-bl-2xl' : '',
            !cell.inMonth ? 'opacity-20' : '',
            cell.inMonth && cell.isFuture ? 'opacity-35' : '',
            cell.inMonth && !cell.isFuture && cell.trades > 0 && cell.pnl > 0 ? 'bg-up/5' : '',
            cell.inMonth && !cell.isFuture && cell.trades > 0 && cell.pnl < 0 ? 'bg-down/5' : '',
            !cell.isFuture ? 'hover:bg-surface-3/40 cursor-pointer' : '',
          ]"
          @click="!cell.isFuture && onDayClick(cell.date, $event, cell)">

          <!-- Date row -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1">
              <span class="text-xs font-bold"
                :class="cell.isToday ? 'text-brand' : cell.inMonth ? 'text-ink' : 'text-ink-faint'">
                {{ cell.num }}
              </span>
              <span class="text-2xs font-medium" :class="cell.isToday ? 'text-brand' : 'text-ink-muted'">{{ format(cell.date, 'EEE') }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span v-if="cell.isToday" class="text-2xs font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded-full leading-none">Today</span>
              <HolidayIcon v-if="cell.inMonth" :date="cell.date" />
            </div>
          </div>

          <!-- Trade stats — same as weekly strip -->
          <div v-if="cell.trades > 0 && cell.inMonth" class="space-y-1">
            <div class="font-mono text-sm font-bold leading-none"
              :class="cell.pnl > 0 ? 'text-up' : 'text-down'">
              <CompactValue :value="cell.pnl" />
            </div>
            <div class="text-2xs text-ink-muted">{{ cell.trades }} trade{{ cell.trades !== 1 ? 's' : '' }}</div>
            <div class="text-2xs" :class="cell.winRate >= 50 ? 'text-up/70' : 'text-down/70'">
              {{ fmtPct(cell.winRate) }} wr
            </div>
          </div>
          <!-- Marked "No-trade day" in the Journal check-in -->
          <template v-else-if="cell.inMonth && !cell.isFuture && isNoTradeDay(cell.date)">
            <div class="text-sm text-ink-muted">No trade</div>
          </template>
          <div v-else-if="cell.inMonth && !cell.isFuture" class="space-y-1">
            <div class="font-mono text-sm font-bold leading-none text-ink-faint/40">$0.00</div>
            <div class="text-2xs text-ink-faint/40">0 trades</div>
          </div>

          <div v-if="cell.trades > 0 && cell.inMonth"
            class="absolute bottom-0 left-0 right-0 h-0.5"
            :class="cell.pnl >= 0 ? 'bg-up' : 'bg-down'" />
        </div>

        <!-- Week total — same style as day cell -->
        <div class="relative min-h-[100px] border-l border-border bg-surface-3/20 p-2.5 transition-colors"
          :class="[
            row.weekPnl > 0 ? 'bg-up/5' : row.weekPnl < 0 ? 'bg-down/5' : '',
            hasWeeklyEntry(row.days[1].date) ? 'cursor-pointer hover:bg-surface-3/40' : '',
          ]"
          @click="goToJournalWeek(row.days[1].date)">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-ink">Week {{ ri + 1 }}</span>
          </div>
          <div class="space-y-1">
            <div class="font-mono text-sm font-bold leading-none"
              :class="row.weekPnl > 0 ? 'text-up' : row.weekPnl < 0 ? 'text-down' : 'text-ink-muted'">
              <CompactValue :value="row.weekPnl" />
            </div>
            <div class="text-2xs text-ink-muted">{{ row.weekTrades }} trade{{ row.weekTrades !== 1 ? 's' : '' }}</div>
            <div v-if="row.weekTrades > 0" class="text-2xs" :class="(row.weekWins / row.weekTrades) >= 0.5 ? 'text-up/70' : 'text-down/70'">
              {{ fmtPct((row.weekWins / row.weekTrades) * 100) }} wr
            </div>
          </div>
          <div v-if="row.weekPnl !== 0"
            class="absolute bottom-0 left-0 right-0 h-0.5"
            :class="row.weekPnl >= 0 ? 'bg-up' : 'bg-down'" />
        </div>
      </div>
    </div>

    <!-- ── YEAR VIEW ── -->
    <div v-else-if="viewMode === 'year'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <button
        v-for="m in yearMonths" :key="m.month"
        @click="drillInto(m.month)"
        class="bg-surface-2 border border-border rounded-2xl p-4 text-left transition-all hover:border-border-strong hover:bg-surface-3/30 relative overflow-hidden"
        :class="m.isCurrentMonth ? 'ring-1 ring-brand/40' : ''">

        <!-- Month header -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold" :class="m.isCurrentMonth ? 'text-brand' : 'text-ink'">{{ m.label }}</span>
          <span class="font-mono text-xs font-bold"
            :class="m.pnl > 0 ? 'text-up' : m.pnl < 0 ? 'text-down' : 'text-ink-faint'">
            <CompactValue v-if="m.pnl !== 0" :value="m.pnl" />
            <span v-else>—</span>
          </span>
        </div>

        <!-- Mini calendar grid -->
        <div class="grid grid-cols-7 gap-px mb-1">
          <div v-for="(d, di) in ['S','M','T','W','T','F','S']" :key="di"
            class="text-center text-2xs text-ink-faint/50 pb-0.5">{{ d }}</div>
          <!-- Empty cells before first day -->
          <div v-for="_ in m.startOffset" :key="'e'+_"></div>
          <!-- Day cells -->
          <div v-for="day in m.days" :key="day.num"
            class="aspect-square rounded-sm flex items-center justify-center text-2xs font-medium transition-colors"
            :class="[
              day.isFuture ? 'text-ink-faint/20' : '',
              !day.isFuture && day.pnl > 0  ? 'bg-up/25 text-up' : '',
              !day.isFuture && day.pnl < 0  ? 'bg-down/25 text-down' : '',
              !day.isFuture && day.pnl === 0 && !day.isWeekend ? 'text-ink-faint/40' : '',
              !day.isFuture && day.pnl === 0 && day.isWeekend  ? 'text-ink-faint/20' : '',
            ]">
            {{ day.num }}
          </div>
        </div>

      </button>
    </div>

    <!-- ── DECADE VIEW ── -->
    <div v-else-if="viewMode === 'decade'" class="grid grid-cols-3 sm:grid-cols-4 gap-4">
      <div v-for="y in decadeYears" :key="y"
        @click="selectDecadeYear(y)"
        class="relative bg-surface-2 border border-border rounded-2xl p-4 transition-all hover:border-border-strong hover:bg-surface-3/30 cursor-pointer"
        :class="y === current.getFullYear() ? 'ring-1 ring-brand/40' : ''">

        <div class="w-full text-left mb-2" :class="!decadeYearData[y].hasData ? 'opacity-70' : ''">
          <div class="flex items-center justify-between">
            <span class="text-base font-semibold" :class="y === current.getFullYear() ? 'text-brand' : 'text-ink'">{{ y }}</span>
            <span v-if="decadeYearData[y].hasData" class="font-mono text-xs font-bold"
              :class="decadeYearData[y].pnl > 0 ? 'text-up' : decadeYearData[y].pnl < 0 ? 'text-down' : 'text-ink-faint'">
            <CompactValue v-if="decadeYearData[y].pnl !== 0" :value="decadeYearData[y].pnl" />
            <span v-else>—</span>
            </span>
            <span v-else class="font-mono text-xs text-ink-faint">—</span>
          </div>
        </div>

        <!-- Sparkline: one bar per month -->
        <svg :width="188" height="44" class="block mb-2" :class="!decadeYearData[y].hasData ? 'opacity-50' : ''">
          <line x1="0" y1="22" x2="188" y2="22" stroke="currentColor" class="text-border" stroke-width="1"/>
          <template v-for="(m, mi) in decadeYearData[y].months" :key="mi">
            <rect
              :x="2 + mi * 15.5"
              :y="m.pnl >= 0 ? 22 - barHeight(y, m.pnl) : 22"
              width="10"
              :height="Math.max(2, barHeight(y, m.pnl))"
              rx="2"
              :fill="m.trades === 0 ? 'transparent' : m.pnl >= 0 ? '#4ade80' : '#f87171'"
              class="transition-opacity hover:opacity-70"
              @mouseenter.stop="showMonthTip($event, y, m)"
              @mouseleave.stop="hideMonthTip" />
          </template>
        </svg>

        <div class="text-2xs text-ink-faint">
          {{ decadeYearData[y].hasData ? `${decadeYearData[y].trades} trades · ${fmtPct(decadeYearData[y].winRate)} WR` : 'No trades' }}
        </div>
      </div>

      <!-- Month hover tooltip -->
      <ChartTooltip :visible="monthTip.visible" :style="monthTip.style">
        <div class="text-ink font-medium mb-0.5">{{ monthTip.label }}</div>
        <div class="font-mono" :class="monthTip.pnl >= 0 ? 'text-up' : 'text-down'">
          {{ monthTip.pnl >= 0 ? '+' : '' }}{{ fmt(monthTip.pnl) }}
        </div>
        <div class="text-ink-faint">{{ monthTip.trades }} trades · {{ fmtPct(monthTip.winRate) }} WR</div>
      </ChartTooltip>
    </div>


    <AddNotePopover :target="noteTarget" @confirm="confirmNote" @cancel="closeNote" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useJournalStore } from '@/stores/journal'
import { useTimezoneStore } from '@/stores/timezone'
import { fmt, fmtPct, computeStats, aggregateTrades } from '@/lib/stats'
import { weekKey } from '@/lib/journalKeys'
import HolidayIcon from '@/components/calendar/HolidayIcon.vue'
import AddNotePopover from '@/components/calendar/AddNotePopover.vue'
import { useCalendarNotes } from '@/composables/useCalendarNotes'
import CompactValue from '@/components/ui/CompactValue.vue'
import StatsPill from '@/components/ui/StatsPill.vue'
import ChartTooltip from '@/components/ui/ChartTooltip.vue'
import {
  format, getMonth, getYear, parseISO,
  startOfWeek, eachWeekOfInterval, startOfMonth, endOfMonth,
  endOfWeek, eachDayOfInterval, isSameMonth,
} from 'date-fns'
import { useRouter } from 'vue-router'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const router = useRouter()
const tradesStore  = useTradesStore()
const journalStore = useJournalStore()
// Day clicks: popover with Close + Open note / Create note.
const { noteTarget, onDayClick, confirmNote, closeNote } = useCalendarNotes()
const tzStore      = useTimezoneStore()

// Week-total cell: "does a weekly entry exist" and "navigate to it". (Day
// cells use useCalendarNotes' popover instead.)
// weekKey() itself lives in lib/journalKeys.js since the Journal's date picker
// builds the same key when creating a weekly note.
function hasJournalEntry(key, list) {
  return list.some(e => e.key === key)
}
function goToJournal(key, list, queryParam) {
  if (!hasJournalEntry(key, list)) return
  router.push({ path: '/journal', query: { [queryParam]: key } })
}

const isNoTradeDay   = (date) => journalStore.getNoTradeDay(format(date, 'yyyy-MM-dd'))
const hasWeeklyEntry = (mondayDate) => hasJournalEntry(weekKey(mondayDate), journalStore.weeklyEntries)
const goToJournalWeek = (mondayDate) => goToJournal(weekKey(mondayDate), journalStore.weeklyEntries, 'week')

const current  = ref(tzStore.localDateObj())
const viewMode = ref('month') // 'month' | 'year' | 'decade'

const decadeStart = computed(() => Math.floor(current.value.getFullYear() / 12) * 12)
const decadeYears = computed(() => Array.from({ length: 12 }, (_, i) => decadeStart.value + i))

const decadeYearData = computed(() => {
  const data = {}
  for (const y of decadeYears.value) {
    const yTrades = tradesStore.trades.filter(t => t.sold_at && getYear(parseISO(t.sold_at)) === y)
    const monthly = Array.from({ length: 12 }, (_, mi) => {
      const mt = yTrades.filter(t => getMonth(parseISO(t.sold_at)) === mi)
      return { label: MONTHS[mi].slice(0, 3), ...aggregateTrades(mt) }
    })
    const yearAgg = aggregateTrades(yTrades)
    data[y] = { ...yearAgg, months: monthly, hasData: yearAgg.trades > 0 }
  }
  return data
})

// Max abs monthly P&L per year, for scaling sparkline bar heights.
// Baseline sits at y=22 in a 44px-tall SVG, giving ~20px of room
// above and below for positive/negative bars (with a small margin).
function barHeight(year, pnl) {
  const months = decadeYearData.value[year]?.months || []
  const maxAbs = Math.max(1, ...months.map(m => Math.abs(m.pnl)))
  const maxBarPx = 18
  return (Math.abs(pnl) / maxAbs) * maxBarPx
}

const monthTip = ref({ visible: false, label: '', pnl: 0, trades: 0, winRate: 0, style: '' })

function showMonthTip(event, year, month) {
  const rect = event.target.getBoundingClientRect()
  monthTip.value = {
    visible: true,
    label: `${month.label} ${year}`,
    pnl: month.pnl,
    trades: month.trades,
    winRate: month.winRate,
    style: `left: ${rect.left}px; top: ${rect.top - 70}px;`,
  }
}

function hideMonthTip() {
  monthTip.value.visible = false
}

function toggleView() {
  if (viewMode.value === 'month') viewMode.value = 'year'
  else if (viewMode.value === 'year') viewMode.value = 'decade'
  else viewMode.value = 'month' // last step → back to the first
}

function prev() {
  const d = new Date(current.value)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() - 1)
  else if (viewMode.value === 'year') d.setFullYear(d.getFullYear() - 1)
  else d.setFullYear(d.getFullYear() - 12)
  current.value = d
}

function next() {
  const d = new Date(current.value)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() + 1)
  else if (viewMode.value === 'year') d.setFullYear(d.getFullYear() + 1)
  else d.setFullYear(d.getFullYear() + 12)
  current.value = d
}

function goToday() {
  current.value = tzStore.localDateObj()
  if (viewMode.value === 'decade') {
    viewMode.value = 'year' // This Year → jump to current year's month grid
  } else {
    viewMode.value = 'month' // This Month → jump to current month
  }
}

function selectDecadeYear(y) {
  const d = new Date(current.value)
  d.setFullYear(y)
  current.value = d
  viewMode.value = 'year'
}

function drillInto(monthIndex) {
  const d = new Date(current.value)
  d.setMonth(monthIndex)
  current.value = d
  viewMode.value = 'month'
}

// ── Month view ────────────────────────────────────────────────
const monthTrades = computed(() => tradesStore.trades.filter(t => {
  if (!t.sold_at) return false
  const d = parseISO(t.sold_at)
  return getMonth(d) === getMonth(current.value) && getYear(d) === getYear(current.value)
}))

const monthStats  = computed(() => computeStats(monthTrades.value))
const isCurrentMonth = computed(() => {
  const today = tzStore.localDateObj()
  return getMonth(current.value) === getMonth(today) && getYear(current.value) === getYear(today)
})
const tradingDays  = computed(() => new Set(monthTrades.value.map(t => t.sold_at ? new Date(t.sold_at).toDateString() : null).filter(Boolean)).size)

const calendarRows = computed(() => {
  const today = tzStore.localDateObj()
  const weekStarts = eachWeekOfInterval(
    { start: startOfMonth(current.value), end: endOfMonth(current.value) },
    { weekStartsOn: 0 }
  )
  return weekStarts.map(ws => {
    const days = eachDayOfInterval({ start: ws, end: endOfWeek(ws, { weekStartsOn: 0 }) }).map(d => {
      const ds = d.toDateString()
      const dt = monthTrades.value.filter(t => t.sold_at && new Date(t.sold_at).toDateString() === ds)
      return {
        date: d, num: d.getDate(),
        inMonth: isSameMonth(d, current.value),
        isToday: ds === today.toDateString(),
        isFuture: d > today,
        ...aggregateTrades(dt),
      }
    })
    const active = days.filter(d => d.inMonth && !d.isFuture && d.trades > 0)
    return {
      days,
      weekPnl:    active.reduce((s, d) => s + d.pnl, 0),
      weekTrades: active.reduce((s, d) => s + d.trades, 0),
      weekWins:   active.reduce((s, d) => s + d.wins, 0),
      weekDays:   new Set(active.map(d => d.date.toDateString())).size,
    }
  })
})

// ── Year view ─────────────────────────────────────────────────
const yearTrades = computed(() => tradesStore.trades.filter(t => {
  if (!t.sold_at) return false
  return getYear(parseISO(t.sold_at)) === getYear(current.value)
}))

const yearStats = computed(() => computeStats(yearTrades.value))

const yearMonths = computed(() => {
  const today = tzStore.localDateObj()
  const yr = getYear(current.value)
  return MONTHS.map((label, mi) => {
    const mt = yearTrades.value.filter(t => getMonth(parseISO(t.sold_at)) === mi)

    // Build daily pnl map for this month
    const pnlByDay = {}
    for (const t of mt) {
      const key = new Date(t.sold_at).getDate()
      pnlByDay[key] = (pnlByDay[key] || 0) + t.pnl
    }

    // Days in month
    const daysInMonth = new Date(yr, mi + 1, 0).getDate()
    const firstDow = new Date(yr, mi, 1).getDay() // 0=Sun

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const num = i + 1
      const d = new Date(yr, mi, num)
      const dow = d.getDay()
      return {
        num,
        pnl: pnlByDay[num] ?? 0,
        isToday: d.toDateString() === today.toDateString(),
        isFuture: d > today,
        isWeekend: dow === 0 || dow === 6,
      }
    })

    return {
      month: mi, label,
      ...aggregateTrades(mt),
      isCurrentMonth: mi === getMonth(today) && yr === getYear(today),
      startOffset: firstDow,
      days,
    }
  })
})
</script>
