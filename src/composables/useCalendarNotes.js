import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import { useJournalStore } from '@/stores/journal'

// Day-cell click behavior shared by CalendarView (month grid) and
// CalendarStrip (weekly strip): clicking any past/today day opens a small
// popover (AddNotePopover) with Close plus "Open note" when the day already
// has a Journal entry (trades or a written note), or "Create note" when it
// doesn't. Weekly entries keep their own helpers in the views.
export function useCalendarNotes() {
  const router = useRouter()
  const journalStore = useJournalStore()

  // { date, rect, hasEntry, hasNote, trades, pnl } of the day the popover is
  // anchored to, or null.
  const noteTarget = ref(null)

  const dayKey = (date) => format(date, 'yyyy-MM-dd')
  const hasDailyEntry = (date) => journalStore.dailyEntries.some(e => e.key === dayKey(date))

  function openEntry(key) {
    router.push({ path: '/journal', query: { date: key } })
  }

  // `stats` is the cell's own { trades, pnl }, shown in the popover.
  function onDayClick(date, event, stats = {}) {
    const r = event.currentTarget.getBoundingClientRect()
    noteTarget.value = {
      date,
      rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
      hasEntry: hasDailyEntry(date),
      hasNote: journalStore.hasNote(dayKey(date)),
      trades: stats.trades || 0,
      pnl: stats.pnl || 0,
    }
  }

  function confirmNote() {
    const target = noteTarget.value
    if (!target) return
    noteTarget.value = null
    const key = dayKey(target.date)
    if (!target.hasEntry) journalStore.setSections(key, journalStore.defaultSections())
    openEntry(key)
  }

  function closeNote() {
    noteTarget.value = null
  }

  return { noteTarget, hasDailyEntry, onDayClick, confirmNote, closeNote }
}
