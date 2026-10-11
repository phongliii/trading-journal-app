import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import { useJournalStore } from '@/stores/journal'
import { weekKey } from '@/lib/journalKeys'

// Day- and week-cell click behavior shared by CalendarView (month grid) and
// CalendarStrip (weekly strip): clicking a past/today day, or a week's total
// cell, covers that cell with DayNoteOverlay — "Open note" when it already
// has a Journal entry, "Create note" when it doesn't, plus Close. Clicking
// anywhere outside the overlay or pressing Esc also closes it.
export function useCalendarNotes() {
  const router = useRouter()
  const journalStore = useJournalStore()

  // { type: 'daily' | 'weekly', key, hasEntry } of the cell whose overlay is
  // showing, or null.
  const noteTarget = ref(null)

  const dayKey = (date) => format(date, 'yyyy-MM-dd')
  const isNoteOpen     = (date)       => noteTarget.value?.type === 'daily'  && noteTarget.value.key === dayKey(date)
  const isWeekNoteOpen = (mondayDate) => noteTarget.value?.type === 'weekly' && noteTarget.value.key === weekKey(mondayDate)

  function onOutside() { closeNote() }
  function onKey(e) { if (e.key === 'Escape') closeNote() }

  function open(type, key, list, event) {
    // Keep this click from reaching the window listener added below.
    event.stopPropagation()
    noteTarget.value = { type, key, hasEntry: list.some(e => e.key === key) }
    window.addEventListener('click', onOutside)
    window.addEventListener('keydown', onKey)
  }

  const onDayClick  = (date, event)       => open('daily',  dayKey(date),        journalStore.dailyEntries,  event)
  const onWeekClick = (mondayDate, event) => open('weekly', weekKey(mondayDate), journalStore.weeklyEntries, event)

  function closeNote() {
    noteTarget.value = null
    window.removeEventListener('click', onOutside)
    window.removeEventListener('keydown', onKey)
  }

  function confirmNote() {
    const target = noteTarget.value
    if (!target) return
    closeNote()
    if (!target.hasEntry) {
      const sections = target.type === 'weekly' ? journalStore.weeklyDefaultSections() : journalStore.defaultSections()
      journalStore.setSections(target.key, sections)
    }
    const param = target.type === 'weekly' ? 'week' : 'date'
    router.push({ path: '/journal', query: { [param]: target.key } })
  }

  onBeforeUnmount(closeNote)

  return { noteTarget, isNoteOpen, isWeekNoteOpen, onDayClick, onWeekClick, confirmNote, closeNote }
}
