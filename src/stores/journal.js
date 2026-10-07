import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useTradesStore } from './trades'
import { useAccountsStore } from './accounts'
import {
  startOfWeek, endOfWeek, startOfMonth,
  format, parseISO, getYear, getMonth, getWeek,
  eachDayOfInterval, isMonday, isFriday, addDays
} from 'date-fns'
import { pushSettingsPatch } from '@/lib/cloudSettings'
import { journalAdapter } from '@/lib/journalAdapter'
import { useToast } from '@/composables/useToast'
import { reportCloudError } from '@/lib/cloudErrors'

// Exported (not just module-local) so lib/exportData.js can tell "still at
// the factory default" apart from "the user actually customized this" when
// deciding whether there's anything worth including in a Settings export.
export const DEFAULT_CHECKLIST = [
  { id: 'sleep',   text: 'Did you sleep well?',              yesIsGood: true  },
  { id: 'rules',   text: 'Did you follow your rules?',        yesIsGood: true  },
  { id: 'emotion', text: 'Did you trade emotionally?',        yesIsGood: false },
  { id: 'sizing',  text: 'Did you stick to your position sizing?', yesIsGood: true },
]

// readList mirrors journal_entries' per-row `read` flag, which is scoped
// per PORTFOLIO (account_id) now — the same date key means a different
// entry in a different portfolio, so its local cache has to be keyed per
// portfolio too, or switching portfolios would show read/unread badges
// left over from whichever portfolio was active last.
//
// checklistQuestions is NOT scoped this way on purpose: it's the list of
// self-assessment QUESTIONS ("Did you sleep well?"), a setting like tags
// or holidays, not per-entry data — stays one shared list across every
// portfolio, same as the rest of user_settings (see cloudSettings.js).
function readKeyFor(accountId) { return `edgelog:journal:read:${accountId}` }
const CHECKLIST_KEY = 'edgelog:journal:checklist'
// `data` itself used to live under this key, back when journal.js was
// local-first with a best-effort cloud mirror — see load()'s one-time
// migration below for why this is still referenced even though nothing
// writes to it any more.
const LEGACY_DATA_KEY = 'edgelog:journal'

// The entry fields that actually hold content — used by load()'s legacy
// migration and importEntries()'s restore merge, both of which need to
// fill in a MISSING-OR-EMPTY field on an entry that otherwise already
// exists, without touching a field that already has real content.
//
// "Missing" alone isn't enough: every day gets an auto-generated entry
// with defaultSections() the first time it's viewed (content: '' in every
// section), so by the time a restore runs, `sections` is almost never
// strictly `undefined` — it's an object full of empty placeholders. If we
// only filled in a field that was `undefined`, those placeholders would
// forever look "already has a value" and block the backup's real text
// from ever coming back in (this is why `image` restored fine — it really
// was null/undefined — while `sections` didn't). So "empty" is judged by
// content, the same way dailyEntries/weeklyEntries already decide whether
// an entry has anything worth keeping unread state for.
const ENTRY_FIELDS = ['sections', 'checklist', 'image']
function isEmptyField(field, value) {
  if (value === undefined || value === null) return true
  if (field === 'sections') {
    return !Array.isArray(value) ||
      !value.some(s => s?.content && String(s.content).replace(/<[^>]*>/g, '').trim())
  }
  if (field === 'checklist') {
    return typeof value !== 'object' || Object.keys(value).length === 0
  }
  if (field === 'image') {
    return !value
  }
  return false
}
// Used by the dailyEntries/weeklyEntries watchers below to decide whether
// a newly-appeared entry actually has something worth keeping "read"
// status for, or is just an empty placeholder that happened to inherit a
// stale read mark (e.g. from the cross-device readList union merge).
// Checks every field that counts as real content — not just `sections` —
// since a day's "note" is just as often a chart screenshot (`image`) or
// answered checklist with no typed text at all.
function entryHasContent(rawEntry) {
  if (!rawEntry) return false
  return !isEmptyField('sections', rawEntry.sections) ||
    !isEmptyField('checklist', rawEntry.checklist) ||
    !isEmptyField('image', rawEntry.image)
}

function fillMissingFields(existing, incoming) {
  let changed = false
  const merged = { ...existing }
  for (const field of ENTRY_FIELDS) {
    // Only replace a field that's currently empty, and only with an
    // incoming value that actually has content — never overwrite real
    // content with real content (that's not a "fill in what's missing"
    // merge, it'd be silently picking the backup over today's edits), and
    // never replace empty with empty.
    if (isEmptyField(field, merged[field]) && !isEmptyField(field, incoming[field])) {
      merged[field] = incoming[field]
      changed = true
    }
  }
  return { merged, changed }
}

// Used specifically by an explicit "restore from backup" — unlike
// fillMissingFields (used for the silent, automatic legacy-localStorage
// recovery above, where guessing wrong and clobbering a real same-day
// edit would be worse than leaving an old field alone), a restore the
// person deliberately ran is supposed to actually bring the backup's
// content back, including replacing today's cloud copy when the backup
// has real content and the cloud copy doesn't currently match it. The one
// thing it still won't do is erase real current content with a BLANK
// backup field — a day that isn't in the backup file at all, or whose
// backup copy for that field is itself empty, keeps whatever's there now.
function overwriteFromBackup(existing, incoming) {
  let changed = false
  const merged = { ...existing }
  for (const field of ENTRY_FIELDS) {
    if (isEmptyField(field, incoming[field])) continue
    if (JSON.stringify(merged[field]) !== JSON.stringify(incoming[field])) {
      merged[field] = incoming[field]
      changed = true
    }
  }
  return { merged, changed }
}

export const useJournalStore = defineStore('journal', () => {
  const tradesStore  = useTradesStore()
  const accountsStore = useAccountsStore()
  const toast = useToast()

  // `data` (the actual note content) is cloud-only, no local cache — that's
  // the piece that was silently losing writes under the old local-first
  // design (see journalAdapter.js's header comment), so it stays strict:
  // always the fresh cloud copy, nothing to fall back on if a write fails.
  //
  // readList and checklistQuestions are the opposite case: read constantly
  // (every unread badge, every journal row) and written rarely, so forcing
  // a network round trip for them on every load is pure overhead for data
  // that's fine being briefly stale — same reasoning holidays.js already
  // applies. Both keep a localStorage cache for instant read, same as
  // before, with the cloud call in load()/syncSettingsOnLoad reconciling
  // in the background rather than gating the UI.
  const data     = ref({})
  // Seeded empty, not from localStorage — unlike checklistQuestions below,
  // which account's cache to even read isn't known yet at store-creation
  // time (accountsStore hasn't loaded yet when this line runs). doLoad()
  // loads the right one once accountId is actually known, same moment it
  // loads everything else for that portfolio.
  const readList = ref([])
  const checklistQuestions = ref(JSON.parse(localStorage.getItem(CHECKLIST_KEY) || 'null') || DEFAULT_CHECKLIST)
  const loading  = ref(false)
  const loaded   = ref(false) // becomes true once load() has completed at least once

  function saveRead()      { localStorage.setItem(readKeyFor(accountsStore.activeAccountId), JSON.stringify(readList.value)) }
  function saveChecklist() { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklistQuestions.value)) }

  // Tracks the in-flight load() call so other code (JournalView's
  // onMounted, specifically) can wait for the SAME load App.vue already
  // kicked off instead of either racing ahead of it or triggering a
  // second redundant one. See whenLoaded() below.
  //
  // load() itself ALSO needs to reuse an in-flight call, not just let
  // whenLoaded() observe one — without the `if (loadPromise) return
  // loadPromise` guard below, two independent triggers calling load()
  // close together (e.g. a route-navigation refresh and the entry-click
  // refresh in JournalView's refreshSelectedEntryFromCloud, each on its
  // own separate throttle) start two overlapping doLoad() runs. Both
  // read localStorage, fetch the cloud, and end with `readList.value =
  // merged` — and whichever one RESOLVES LAST wins, even if it's the one
  // that started first and so captured an older localStorage snapshot.
  // That's exactly how marking an entry read could show it as read for a
  // moment and then flip back to unread: the earlier-started call's
  // stale merge (taken before markRead()'s synchronous localStorage
  // write landed) overwrote the later call's correct one. Coalescing
  // into one shared promise means only one doLoad() is ever running at a
  // time, so there's nothing left to race.
  let loadPromise = null
  async function load() {
    if (loadPromise) return loadPromise
    loadPromise = doLoad().finally(() => { loadPromise = null })
    return loadPromise
  }
  async function doLoad() {
    loading.value = true
    const accountId = accountsStore.activeAccountId
    try {
      // Re-seed from THIS account's own local cache every time — not just
      // on first load — since a load() here can also mean "the active
      // portfolio just changed" (App.vue's watch), and the previous
      // portfolio's readList has no bearing on this one at all.
      let localRead = []
      try { localRead = JSON.parse(localStorage.getItem(readKeyFor(accountId)) || '[]') } catch { /* ignore */ }
      const { data: cloudData, readList: cloudRead } = await journalAdapter.load(accountId)
      data.value = cloudData

      // Re-read localStorage now, right before merging, instead of only
      // trusting the snapshot taken above before the cloud fetch started.
      // markRead() writes to localStorage SYNCHRONOUSLY — if it runs
      // while the fetch above is in flight (opening an entry while a
      // background refresh is already running), the snapshot taken
      // before the fetch started simply doesn't have it yet. Without this
      // second read, the unconditional `readList.value = merged` just
      // below would overwrite the correct, already-current readList.value
      // (markRead() also pushes into it directly) with this stale merge —
      // the entry would show as read for a moment, then flip back to
      // unread the instant this load() finishes. Re-reading here picks up
      // anything written in the meantime, no matter which trigger started
      // this particular load().
      try { localRead = JSON.parse(localStorage.getItem(readKeyFor(accountId)) || '[]') } catch { /* ignore */ }

      // Union, not overwrite: either side having marked a key read is
      // enough to call it read, and this also self-heals a markRead()
      // whose push to the cloud failed earlier (still read locally here,
      // and the line below catches the cloud back up to it).
      const merged = new Set([...localRead, ...cloudRead])
      readList.value = [...merged]
      saveRead()
      const localOnly = readList.value.filter(k => !cloudRead.includes(k))
      if (localOnly.length) {
        journalAdapter.setReadMany(accountId, localOnly, true).catch(e =>
          console.error('Could not push locally-read keys missing from the cloud:', e))
      }

      // One-time migration: before journal entries became cloud-only,
      // `data` lived in localStorage under LEGACY_DATA_KEY with Supabase as
      // a best-effort mirror — anything written there that never made it
      // to the cloud (e.g. a chart image attached right before this
      // device's last push failed or ran out of time) just got silently
      // overwritten by the line above the moment load() started trusting
      // the cloud outright. Recover it here: for any key the legacy copy
      // has that the cloud is either missing entirely or missing a FIELD
      // of (sections/checklist/image), fill it in and push it back up.
      // Never overwrites a field the cloud copy already has a value for.
      let legacy = null
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_DATA_KEY) || 'null') } catch { /* ignore */ }
      if (legacy && typeof legacy === 'object') {
        const nextData = { ...data.value }
        const toPush = []
        for (const [key, legacyEntry] of Object.entries(legacy)) {
          const cloudEntry = nextData[key]
          if (!cloudEntry) {
            nextData[key] = legacyEntry
            toPush.push(key)
          } else {
            const { merged, changed } = fillMissingFields(cloudEntry, legacyEntry)
            if (changed) { nextData[key] = merged; toPush.push(key) }
          }
        }
        if (toPush.length) {
          data.value = nextData
          await Promise.all(toPush.map(key => saveEntryToCloud(key, nextData[key])))
          console.info(`Recovered ${toPush.length} journal entr${toPush.length !== 1 ? 'ies' : 'y'} from a pre-cloud-migration local copy.`)
        }
        // Done recovering whatever was there — this key is never written
        // to again, so there's nothing more for it to do going forward.
        localStorage.removeItem(LEGACY_DATA_KEY)
      }

      loaded.value = true
    } catch (e) {
      reportCloudError(toast, e, 'Could not load journal entries from the cloud:',
        'Could not load your journal from the cloud — try reloading the page.')
    } finally {
      loading.value = false
    }
  }

  // Lets a view wait for the load App.vue already triggered on sign-in,
  // rather than selecting/cloning an entry before that load resolves and
  // freezing a stale (empty-placeholder) snapshot of it — the actual
  // root cause of "notes don't show until I refresh" (JournalView's
  // onMounted auto-selects the first entry the instant it mounts, which
  // can easily win the race against the cloud fetch if Journal is the
  // first page opened after signing in). Resolves immediately if load()
  // has already finished, or if it was never called at all (not signed
  // in) — either way there's nothing further to wait for.
  async function whenLoaded() {
    if (loaded.value) return
    if (loadPromise) await loadPromise
  }

  function setChecklistQuestions(questions) {
    checklistQuestions.value = questions
    saveChecklist()
    pushSettingsPatch({ checklistQuestions: questions })
  }

  // lib/cloudSettings.js's sync-on-load calls these by name (see
  // syncSettingsOnLoad) — not used by anything in this file itself. This is
  // the one piece of journal.js's state that's a small, human-edited
  // settings list rather than a growing per-key entry, so it rides along in
  // user_settings' blob (cloudSettings.js) instead of journal_entries —
  // same reasoning as holidays.js, including the local cache.
  function applyChecklistQuestionsFromCloud(questions) {
    checklistQuestions.value = questions
    saveChecklist()
  }
  function checklistQuestionsToCloudValue() { return checklistQuestions.value }

  // Removes a question from the list AND strips its recorded answer off
  // every entry that has one — otherwise that answer just sits in the
  // cloud forever under an id nothing shows anymore.
  async function removeChecklistQuestion(id) {
    checklistQuestions.value = checklistQuestions.value.filter(q => q.id !== id)
    pushSettingsPatch({ checklistQuestions: checklistQuestions.value })

    const next = {}
    const touchedKeys = []
    let changed = false
    for (const [dateKey, entry] of Object.entries(data.value)) {
      if (entry?.checklist && Object.prototype.hasOwnProperty.call(entry.checklist, id)) {
        const checklist = { ...entry.checklist }
        delete checklist[id]
        next[dateKey] = { ...entry, checklist }
        touchedKeys.push(dateKey)
        changed = true
      } else {
        next[dateKey] = entry
      }
    }
    if (changed) {
      data.value = next
      await Promise.all(touchedKeys.map(key => saveEntryToCloud(key, next[key])))
    }
  }

  function getChecklistAnswers(dateKey) {
    return data.value[dateKey]?.checklist || {}
  }

  // Shared by every mutator below: writes one entry's content to Supabase
  // and toasts if it fails. There's no local copy to fall back on any
  // more, so a failed write here means the edit really didn't persist —
  // the toast is how the person finds that out instead of just losing it
  // silently on next reload.
  async function saveEntryToCloud(key, content) {
    try {
      await journalAdapter.saveEntry(accountsStore.activeAccountId, key, content)
    } catch (e) {
      reportCloudError(toast, e, `Could not save journal entry "${key}" to the cloud:`,
        `Could not save "${key}" to the cloud — try again.`)
    }
  }

  async function setChecklistAnswers(dateKey, answers) {
    data.value = { ...data.value, [dateKey]: { ...(data.value[dateKey] || {}), checklist: answers } }
    await saveEntryToCloud(dateKey, data.value[dateKey])
  }

  function getEntryImage(dateKey) {
    return data.value[dateKey]?.image || null
  }

  async function setEntryImage(dateKey, filename) {
    data.value = { ...data.value, [dateKey]: { ...(data.value[dateKey] || {}), image: filename } }
    await saveEntryToCloud(dateKey, data.value[dateKey])
  }

  // Clears the image reference on every entry (used when the image folder's
  // files are all deleted at once, so entries don't point at missing files).
  async function clearAllEntryImages() {
    const next = {}
    const touchedKeys = []
    for (const [key, entry] of Object.entries(data.value)) {
      if (entry?.image) { next[key] = { ...entry, image: null }; touchedKeys.push(key) }
      else next[key] = entry
    }
    data.value = next
    await Promise.all(touchedKeys.map(key => saveEntryToCloud(key, next[key])))
  }

  async function markRead(key) {
    if (!readList.value.includes(key)) {
      readList.value.push(key)
      saveRead()
      try {
        await journalAdapter.setRead(accountsStore.activeAccountId, key, true)
      } catch (e) {
        console.error(`Could not mark "${key}" read in the cloud:`, e)
        // Not worth a toast — read state is low-stakes and this is called
        // on every entry you open, which would be a lot of toasts.
      }
    }
  }
  function isRead(key)   { return readList.value.includes(key) }

  function getSections(key) { return data.value[key]?.sections || null }
  async function setSections(key, sections) {
    data.value = { ...data.value, [key]: { ...(data.value[key] || {}), sections } }
    await saveEntryToCloud(key, data.value[key])
  }

  async function clearWeeklyData() {
    // Remove all weekly keys from data
    const removedKeys = new Set()
    const newData = {}
    for (const [key, val] of Object.entries(data.value)) {
      if (key.match(/^\d{4}-W\d{2}$/)) removedKeys.add(key)
      else newData[key] = val
    }
    data.value = newData
    // Clear weekly read state
    for (const k of readList.value) if (k.match(/^\d{4}-W\d{2}$/)) removedKeys.add(k)
    readList.value = readList.value.filter(k => !k.match(/^\d{4}-W\d{2}$/))
    saveRead()
    try {
      await journalAdapter.deleteEntries(accountsStore.activeAccountId, [...removedKeys])
    } catch (e) {
      reportCloudError(toast, e, 'Could not clear weekly journal data in the cloud:',
        'Could not clear weekly data in the cloud — try again.')
    }
  }

  async function clearAllData() {
    data.value = {}
    readList.value = []
    saveRead()
    try {
      await journalAdapter.clearAll(accountsStore.activeAccountId)
    } catch (e) {
      reportCloudError(toast, e, 'Could not clear journal data in the cloud:',
        'Could not clear journal data in the cloud — try again.')
    }
  }

  async function clearReadState() {
    readList.value = []
    saveRead()
    try {
      await journalAdapter.clearReadState(accountsStore.activeAccountId)
    } catch (e) {
      reportCloudError(toast, e, 'Could not clear journal read-state in the cloud:',
        'Could not clear read state in the cloud — try again.')
    }
  }

  async function deleteEntry(key) {
    data.value = { ...data.value }
    delete data.value[key]
    const idx = readList.value.indexOf(key)
    if (idx >= 0) { readList.value.splice(idx, 1); saveRead() }
    try {
      await journalAdapter.deleteEntry(accountsStore.activeAccountId, key)
    } catch (e) {
      reportCloudError(toast, e, `Could not delete journal entry "${key}" in the cloud:`,
        `Could not delete "${key}" in the cloud — try again.`)
    }
  }

  // Used by lib/exportData.js's restore flow (importJournalFiles) — this
  // is a deliberate "restore from backup" the person asked for, so unlike
  // the silent legacy-migration above, it actually RESTORES: a day that
  // doesn't exist yet gets added wholesale, and a day that already exists
  // gets every field the backup has real content for overwritten with the
  // backup's version (sections/checklist/image), even if the current
  // cloud copy already has something there. The only thing left alone is
  // a field the backup itself has nothing for (or a day the backup
  // doesn't mention at all) — there's nothing to restore it FROM, so
  // today's data for that field just stays as is. Pushes every touched
  // entry to the cloud. Returns counts so the caller's toast can report
  // them the same way it always has.
  async function importEntries(entries) {
    const next = { ...data.value }
    const touchedKeys = []
    let added = 0, skipped = 0
    for (const [key, value] of Object.entries(entries)) {
      const existing = next[key]
      if (existing === undefined) {
        next[key] = value
        touchedKeys.push(key)
        added++
        continue
      }
      const { merged, changed } = overwriteFromBackup(existing, value)
      if (changed) { next[key] = merged; touchedKeys.push(key); added++ }
      else skipped++
    }
    if (touchedKeys.length) {
      data.value = next
      await Promise.all(touchedKeys.map(key => saveEntryToCloud(key, next[key])))
    }
    return { added, skipped }
  }

  function defaultSections() {
    return [
      { id: 'thesis',     emoji: '🧠', title: 'Thesis',     content: '', placeholder: 'What was your thesis?' },
      { id: 'entry',      emoji: '🎯', title: 'Entry',      content: '', placeholder: 'How did you enter?' },
      { id: 'management', emoji: '📈', title: 'Management', content: '', placeholder: 'How did you manage?' },
      { id: 'review',     emoji: '📝', title: 'Review',     content: '', placeholder: 'How did today go overall?' },
    ]
  }

  function weeklyDefaultSections() {
    return [
      { id: 'review',  emoji: '📝', title: 'Week Review',  content: '', placeholder: 'How did the week go overall?' },
      { id: 'lessons', emoji: '💡', title: 'Key Lessons',  content: '', placeholder: 'What did you learn this week?' },
      { id: 'goals',   emoji: '🎯', title: 'Next Week Goals', content: '', placeholder: 'What are your goals for next week?' },
    ]
  }

  function monthlyDefaultSections() {
    return [
      { id: 'review',  emoji: '📝', title: 'Month Review', content: '', placeholder: 'How did the month go?' },
      { id: 'lessons', emoji: '💡', title: 'Key Lessons',  content: '', placeholder: 'What did you learn this month?' },
      { id: 'goals',   emoji: '🎯', title: 'Next Month Goals', content: '', placeholder: 'Goals for next month?' },
    ]
  }

  // ── Daily entries ──────────────────────────────────────────────────────
  const dailyEntries = computed(() => {
    const byDate = {}
    for (const t of tradesStore.trades) {
      if (!t.sold_at) continue
      const date = t.sold_at.slice(0, 10)
      if (!byDate[date]) byDate[date] = []
      byDate[date].push(t)
    }
    // Include manual entries
    for (const key of Object.keys(data.value)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && !byDate[key]) byDate[key] = []
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, trades]) => ({
        key: date, date, trades,
        sections: data.value[date]?.sections || defaultSections(),
        isRead: readList.value.includes(date),
        type: 'daily',
      }))
  })

  // ── Weekly entries ─────────────────────────────────────────────────────
  // Weekly and monthly reviews are opt-in: a period only appears here once
  // you've created its entry (Journal's "+ New" picker), not
  // automatically when the week/month ends. Daily entries stay derived from
  // your trades — those are just a list of days you traded, not extra notes.
  const weeklyEntries = computed(() => {
    const weeks = new Map()

    for (const t of tradesStore.trades) {
      if (!t.sold_at) continue
      const d = parseISO(t.sold_at)
      const ws = startOfWeek(d, { weekStartsOn: 1 })
      const key = `${format(ws, 'yyyy')}-W${String(getWeek(ws, { weekStartsOn: 1 })).padStart(2, '0')}`
      if (!weeks.has(key)) weeks.set(key, { weekStart: ws, trades: [] })
      weeks.get(key).trades.push(t)
    }

    // Weeks you've created an entry for, even if they have no trades.
    for (const key of Object.keys(data.value)) {
      if (/^\d{4}-W\d{2}$/.test(key) && !weeks.has(key)) {
        // Parse week start from key
        const [year, wNum] = key.split('-W')
        // approximate weekStart
        const ws = startOfWeek(new Date(Number(year), 0, 1 + (Number(wNum) - 1) * 7), { weekStartsOn: 1 })
        weeks.set(key, { weekStart: ws, trades: [] })
      }
    }

    const result = []
    for (const [key, { weekStart, trades }] of weeks) {
      if (!data.value[key]) continue

      const we = endOfWeek(weekStart, { weekStartsOn: 1 })
      const friday = addDays(weekStart, 4)
      const weekLabel = `Week ${getWeek(weekStart, { weekStartsOn: 1 })} · ${format(weekStart, 'MMM d')}–${format(friday, 'MMM d')}`
      result.push({
        key,
        weekStart,
        weekEnd: we,
        trades,
        label: weekLabel,
        sections: data.value[key]?.sections || weeklyDefaultSections(),
        isRead: readList.value.includes(key),
        type: 'weekly',
      })
    }

    return result.sort((a, b) => b.weekStart - a.weekStart)
  })

  // ── Monthly entries ────────────────────────────────────────────────────
  const monthlyEntries = computed(() => {
    const months = new Map()

    for (const t of tradesStore.trades) {
      if (!t.sold_at) continue
      const d = parseISO(t.sold_at)
      const key = format(d, 'yyyy-MM')
      if (!months.has(key)) months.set(key, { year: getYear(d), month: getMonth(d), trades: [] })
      months.get(key).trades.push(t)
    }

    // Also include months with manual journal notes but no trades
    for (const key of Object.keys(data.value)) {
      if (/^\d{4}-\d{2}$/.test(key) && !months.has(key)) {
        const [y, m] = key.split('-').map(Number)
        months.set(key, { year: y, month: m - 1, trades: [] })
      }
    }

    const result = []
    for (const [key, { year, month, trades }] of months) {
      if (!data.value[key]) continue

      result.push({
        key,
        year, month,
        trades,
        label: format(new Date(year, month, 1), 'MMMM yyyy'),
        sections: data.value[key]?.sections || monthlyDefaultSections(),
        isRead: readList.value.includes(key),
        type: 'monthly',
      })
    }

    return result.sort((a, b) => b.key.localeCompare(a.key))
  })

  // Auto-clean stale read keys when daily entries change
  let prevDailyKeys = null // null = not yet initialized this session
  watch(dailyEntries, (newEntries) => {
    const newKeys = new Set(newEntries.map(e => e.key))

    // First invocation after page load: just record the baseline,
    // don't treat every entry as "newly appeared" (which would wipe
    // read state for entries that were already read in a prior session).
    if (prevDailyKeys === null) {
      prevDailyKeys = newKeys
      return
    }

    let changed = false
    const removed = []

    // Remove read state for daily entries that disappeared
    const filtered = readList.value.filter(k => {
      if (!k.match(/^\d{4}-\d{2}-\d{2}$/)) return true
      if (!newKeys.has(k)) { changed = true; removed.push(k); return false }
      return true
    })

    // Reset read state for entries that reappeared with no content. Checks
    // the RAW stored entry (data.value[entry.key]), not entry.sections —
    // `entry.sections` here already fell back to defaultSections() (empty
    // placeholders) when there's no real data, which made this always
    // read "no content" for a day whose actual note lives in `checklist`
    // or `image` only (a chart screenshot with no typed text is a very
    // normal trading-journal entry). See entryHasContent's comment.
    for (const entry of newEntries) {
      if (!prevDailyKeys.has(entry.key)) {
        if (!entryHasContent(data.value[entry.key])) {
          const idx = filtered.indexOf(entry.key)
          if (idx >= 0) { filtered.splice(idx, 1); changed = true; removed.push(entry.key) }
        }
      }
    }

    if (changed) {
      readList.value = filtered
      saveRead()
      journalAdapter.setReadMany(accountsStore.activeAccountId, removed, false).catch(e =>
        console.error('Could not clean up stale daily read-state in the cloud:', e))
    }

    prevDailyKeys = newKeys
  }, { flush: 'sync' })
  let prevWeeklyKeys = null // null = not yet initialized this session
  watch(weeklyEntries, (newEntries) => {
    const newKeys = new Set(newEntries.map(e => e.key))

    // First invocation after page load: just record the baseline.
    if (prevWeeklyKeys === null) {
      prevWeeklyKeys = newKeys
      return
    }

    let changed = false
    const removed = []

    // Remove read state for weekly entries that disappeared
    const filtered = readList.value.filter(k => {
      if (!k.match(/^\d{4}-W\d{2}$/)) return true
      if (!newKeys.has(k)) { changed = true; removed.push(k); return false }
      return true
    })

    // Reset read state for entries that reappeared with no content (see
    // the matching comment in the daily watcher above for why this checks
    // the raw stored entry rather than entry.sections).
    for (const entry of newEntries) {
      if (!prevWeeklyKeys.has(entry.key)) {
        if (!entryHasContent(data.value[entry.key])) {
          const idx = filtered.indexOf(entry.key)
          if (idx >= 0) { filtered.splice(idx, 1); changed = true; removed.push(entry.key) }
        }
      }
    }

    if (changed) {
      readList.value = filtered
      saveRead()
      journalAdapter.setReadMany(accountsStore.activeAccountId, removed, false).catch(e =>
        console.error('Could not clean up stale weekly read-state in the cloud:', e))
    }

    prevWeeklyKeys = newKeys
  }, { flush: 'sync' })
  // True when the entry for `key` has something actually written in it
  // (text, checklist answers or a chart image) — not just a derived/empty
  // placeholder. Calendar uses this for its "has a note" dot, since every
  // day with trades already has an (empty) entry.
  function hasNote(key) { return entryHasContent(data.value[key]) }

  const unreadDaily   = computed(() => dailyEntries.value.filter(e => !e.isRead).length)
  const unreadWeekly  = computed(() => weeklyEntries.value.filter(e => !e.isRead).length)
  const hasUnread     = computed(() => unreadDaily.value > 0 || unreadWeekly.value > 0)

  return {
    data, readList, checklistQuestions, loading, loaded, whenLoaded,
    dailyEntries, weeklyEntries, monthlyEntries,
    unreadDaily, unreadWeekly, hasUnread, hasNote,
    load, markRead, isRead, getSections, setSections, deleteEntry, clearReadState, clearWeeklyData, clearAllData,
    defaultSections, weeklyDefaultSections, monthlyDefaultSections,
    setChecklistQuestions, removeChecklistQuestion, getChecklistAnswers, setChecklistAnswers,
    getEntryImage, setEntryImage, clearAllEntryImages, importEntries,
    applyChecklistQuestionsFromCloud, checklistQuestionsToCloudValue,
  }
})
