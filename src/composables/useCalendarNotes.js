import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { format } from 'date-fns'
import { useJournalStore } from '@/stores/journal'

// Day-cell click behavior shared by CalendarView (month grid) and
// CalendarStrip (weekly strip): clicking any past/today day covers that cell
// with DayNoteOverlay — "Open note" when the day already has a Journal entry
// (trades or a written note), "Create note" when it doesn't, plus Close.
// Clicking anywhere outside the overlay or pressing Esc also closes it.
// Weekly entries keep their own helpers in the views.
export function useCalendarNotes() {
  const router = useRouter()
  const journalStore = useJournalStore()

  // { key, hasEntry } of the day whose overlay is showing, or null.
  const noteTarget = ref(null)

  const dayKey = (date) => format(date, 'yyyy-MM-dd')
  const hasDailyEntry = (date) => journalStore.dailyEntries.some(e => e.key === dayKey(date))
  const isNoteOpen = (date) => noteTarget.value?.key === dayKey(date)

  function onOutside() { closeNote() }
  function onKey(e) { if (e.key === 'Escape') closeNote() }

  function onDayClick(date, event) {
    // Keep this click from reaching the window listener added below.
    event.stopPropagation()
    noteTarget.value = { key: dayKey(date), hasEntry: hasDailyEntry(date) }
    window.addEventListener('click', onOutside)
    window.addEventListener('keydown', onKey)
  }

  function closeNote() {
    noteTarget.value = null
    window.removeEventListener('click', onOutside)
    window.removeEventListener('keydown', onKey)
  }

  function confirmNote() {
    const target = noteTarget.value
    if (!target) return
    closeNote()
    if (!target.hasEntry) journalStore.setSections(target.key, journalStore.defaultSections())
    router.push({ path: '/journal', query: { date: target.key } })
  }

  onBeforeUnmount(closeNote)

  return { noteTarget, isNoteOpen, onDayClick, confirmNote, closeNote }
}
