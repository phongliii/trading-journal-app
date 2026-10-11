<template>
  <div class="bg-surface-2 border border-border rounded-2xl overflow-hidden">

    <!-- Nav header -->
    <div class="flex items-center justify-between px-5 py-3 border-b border-border">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" @click="prev">◀</button>
        <h2 class="text-base font-semibold text-ink min-w-[80px] text-center">{{ weekLabel }}</h2>
        <button class="btn btn-ghost btn-sm" @click="next" :disabled="offset >= 0">▶</button>
        <button v-if="offset !== 0" class="btn btn-ghost btn-sm" @click="goToday">This Week</button>
      </div>
      <span class="text-sm text-ink-faint">{{ dateRange }}</span>
    </div>

    <!-- Day cells + weekly total -->
    <div class="grid grid-cols-8">
      <div v-for="(day, di) in week" :key="day.dateStr"
        class="relative min-h-[100px] border-r border-border p-2.5 transition-colors"
        :class="[
          di === 0 ? 'rounded-bl-2xl' : '',
          !day.isFuture && day.trades > 0 && day.pnl > 0  ? 'bg-up/5'   : '',
          !day.isFuture && day.trades > 0 && day.pnl < 0  ? 'bg-down/5' : '',
          day.isFuture ? 'opacity-35' : 'hover:bg-surface-3/40 cursor-pointer',
        ]"
        @click="!day.isFuture && onDayClick(day.date, $event)">

        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-1">
            <span class="text-xs font-bold" :class="day.isToday ? 'text-brand' : 'text-ink'">{{ day.num }}</span>
            <span class="text-2xs" :class="day.isToday ? 'text-brand' : 'text-ink-muted'">{{ day.dayName }}</span>
          </div>
          <div class="flex items-center gap-1">
            <span v-if="day.isToday" class="text-2xs font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded-full leading-none">Today</span>
            <HolidayIcon :date="day.date" />
          </div>
        </div>

        <div v-if="day.trades > 0" class="space-y-1">
          <div class="font-mono text-sm font-bold leading-none" :class="day.pnl > 0 ? 'text-up' : 'text-down'">
            <CompactValue :value="day.pnl" />
          </div>
          <div class="text-2xs text-ink-muted">{{ day.trades }} trade{{ day.trades !== 1 ? 's' : '' }}</div>
          <div class="text-2xs" :class="(day.wins / day.trades) >= 0.5 ? 'text-up/70' : 'text-down/70'">
            {{ fmtPct((day.wins / day.trades) * 100) }} wr
          </div>
        </div>
        <!-- Marked "No-trade day" in the Journal check-in -->
        <template v-else-if="!day.isFuture && isNoTradeDay(day.date)">
          <div class="text-sm text-ink-muted">No trade</div>
        </template>
        <div v-else-if="!day.isFuture" class="space-y-1">
          <div class="font-mono text-sm font-bold leading-none text-ink-faint/40">$0.00</div>
          <div class="text-2xs text-ink-faint/40">0 trades</div>
        </div>

        <div v-if="day.trades > 0" class="absolute bottom-0 left-0 right-0 h-0.5"
          :class="day.pnl >= 0 ? 'bg-up' : 'bg-down'" />

        <DayNoteOverlay v-if="isNoteOpen(day.date)" :has-entry="noteTarget.hasEntry"
          @confirm="confirmNote" @close="closeNote" />
      </div>

      <!-- Weekly total — same style as day cell -->
      <div class="relative min-h-[100px] border-l border-border bg-surface-3/20 p-2.5"
        :class="[
          weekPnl > 0 ? 'bg-up/5' : weekPnl < 0 ? 'bg-down/5' : '',
          !week[1].isFuture ? 'cursor-pointer hover:bg-surface-3/40' : '',
        ]"
        @click="!week[1].isFuture && onWeekClick(week[1].date, $event)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-ink">{{ weekLabel }}</span>
        </div>
        <div class="space-y-1">
          <div class="font-mono text-sm font-bold leading-none"
            :class="weekPnl > 0 ? 'text-up' : weekPnl < 0 ? 'text-down' : 'text-ink-muted'">
            <CompactValue :value="weekPnl" />
          </div>
          <div class="text-2xs text-ink-muted">{{ weekTrades }} trade{{ weekTrades !== 1 ? 's' : '' }}</div>
          <div v-if="weekTrades > 0" class="text-2xs" :class="weekWinRate >= 50 ? 'text-up/70' : 'text-down/70'">
            {{ fmtPct(weekWinRate) }} wr
          </div>
        </div>
        <div v-if="weekPnl !== 0" class="absolute bottom-0 left-0 right-0 h-0.5"
          :class="weekPnl >= 0 ? 'bg-up' : 'bg-down'" />

        <DayNoteOverlay v-if="isWeekNoteOpen(week[1].date)" :has-entry="noteTarget.hasEntry"
          @confirm="confirmNote" @close="closeNote" />
      </div>
    </div>


  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { fmtPct, aggregateTrades } from '@/lib/stats'
import { useJournalStore } from '@/stores/journal'
import { useTimezoneStore } from '@/stores/timezone'
import CompactValue from '@/components/ui/CompactValue.vue'
import { startOfWeek, endOfWeek, eachDayOfInterval, format, addWeeks, startOfMonth } from 'date-fns'
import HolidayIcon from '@/components/calendar/HolidayIcon.vue'
import DayNoteOverlay from '@/components/calendar/DayNoteOverlay.vue'
import { useCalendarNotes } from '@/composables/useCalendarNotes'

const props = defineProps({ trades: { type: Array, required: true } })

const journalStore = useJournalStore()
// Day clicks: overlay with Open note / Create note + Close.
const { noteTarget, isNoteOpen, isWeekNoteOpen, onDayClick, onWeekClick, confirmNote, closeNote } = useCalendarNotes()
const tzStore = useTimezoneStore()

const isNoTradeDay   = (date) => journalStore.getNoTradeDay(format(date, 'yyyy-MM-dd'))

const offset = ref(0)
function prev()    { offset.value-- }
function next()    { if (offset.value < 0) offset.value++ }
function goToday() { offset.value = 0 }

const weekStart = computed(() => startOfWeek(addWeeks(tzStore.localDateObj(), offset.value), { weekStartsOn: 0 }))
const weekEnd   = computed(() => endOfWeek(weekStart.value, { weekStartsOn: 0 }))

const weekOfMonth = computed(() => {
  const monthStart = startOfMonth(weekStart.value)
  const firstWeekStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  return Math.round((weekStart.value - firstWeekStart) / (7 * 24 * 60 * 60 * 1000)) + 1
})

const weekLabel = computed(() => `Week ${weekOfMonth.value}`)
const dateRange = computed(() => `${format(weekStart.value, 'MMM d')} – ${format(weekEnd.value, 'MMM d, yyyy')}`)

const week = computed(() => {
  const today = tzStore.localDateObj()
  return eachDayOfInterval({ start: weekStart.value, end: weekEnd.value }).map(d => {
    const ds = d.toDateString()
    const dayTrades = props.trades.filter(t => t.sold_at && new Date(t.sold_at).toDateString() === ds)
    return {
      dateStr: ds, date: d, num: d.getDate(), dayName: format(d, 'EEE'),
      isToday: ds === today.toDateString(), isFuture: d > today,
      ...aggregateTrades(dayTrades),
    }
  })
})

const weekPnl    = computed(() => week.value.reduce((s, d) => s + d.pnl, 0))
const weekTrades  = computed(() => week.value.reduce((s, d) => s + d.trades, 0))
const weekWins    = computed(() => week.value.reduce((s, d) => s + d.wins, 0))
const weekWinRate = computed(() => weekTrades.value ? (weekWins.value / weekTrades.value) * 100 : 0)
</script>
