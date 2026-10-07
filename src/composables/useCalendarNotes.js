import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import { useJournalStore } from '@/stores/journal'

// Day-cell behavior shared by CalendarView (month grid) and CalendarStrip
// (weekly strip): which days have a written note (the dot), and what a click
// on a day does — open its entry if one exists, otherwise offer to add one
// (AddNotePopover). Weekly entries keep their own helpers in the views.
export function useCalendarNotes() {
  const router = useRouter()
  const journalStore = useJournalStore()

  // { date, rect } of the empty day the popover is anchored to, or null.
  const addTarget = ref(null)

  const dayKey = (date) => format(date, 'yyyy-MM-dd')
  const hasDailyEntry = (date) => journalStore.dailyEntries.some(e => e.key === dayKey(date))
  const hasNote = (date) => journalStore.hasNote(dayKey(date))

  function openEntry(key) {
    router.push({ path: '/journal', query: { date: key } })
  }

  function onDayClick(date, event) {
    if (hasDailyEntry(date)) {
      openEntry(dayKey(date))
      return
    }
    const r = event.currentTarget.getBoundingClientRect()
    addTarget.value = { date, rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width } }
  }

  function confirmAdd() {
    const target = addTarget.value
    if (!target) return
    addTarget.value = null
    const key = dayKey(target.date)
    journalStore.setSections(key, journalStore.defaultSections())
    openEntry(key)
  }

  function cancelAdd() {
    addTarget.value = null
  }

  return { addTarget, hasDailyEntry, hasNote, onDayClick, confirmAdd, cancelAdd }
}
