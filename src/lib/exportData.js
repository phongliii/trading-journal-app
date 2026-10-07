// Builds downloadable files (CSV/JSON/zip) for the Export & Restore page.
// Reads straight from the app's existing stores — the raw CSV archive for
// Position/Cash/Account Balance History, the journal/holiday stores for
// Notes (which carries its own read/unread state) and Holidays, and the
// remaining small single-value stores bundled together as Settings — and
// filters by an optional date range before producing a Blob the page hands
// to the browser's normal download flow.

import { startOfWeek, addDays, format } from 'date-fns'
import { useRawCsvArchiveStore } from '@/stores/rawCsvArchive'
import { useJournalStore, DEFAULT_CHECKLIST } from '@/stores/journal'
import { useHolidayStore } from '@/stores/holidays'
import { useTimezoneStore } from '@/stores/timezone'
import { useTradeMetaStore } from '@/stores/tradeMeta'
import { useTradingRulesStore } from '@/stores/tradingRules'
import { useWithdrawReminderStore } from '@/stores/withdrawReminder'
import { useTradesStore } from '@/stores/trades'

export const EXPORT_TYPES = [
  { value: 'position',   label: 'Position History',        kind: 'rawcsv',          archiveKind: 'position' },
  { value: 'cash',        label: 'Cash History',             kind: 'rawcsv',          archiveKind: 'cash' },
  { value: 'balance',     label: 'Account Balance History',  kind: 'rawcsv',          archiveKind: 'balance' },
  // Notes bundles read/unread state AND individual trade notes in with it
  // (previously separate "Read Status" and "Trade Notes" files had to be
  // exported and restored alongside Notes to keep everything in sync — more
  // files to remember, for data that's only ever useful together). Trade
  // notes specifically are the notes/tags/strategy/chart-image a user types
  // onto an INDIVIDUAL trade in the Trade Drawer — separate from the daily/
  // weekly/monthly entries in journalStore.data, and from the raw broker
  // CSVs above (which only ever hold what the broker exported, never
  // anything typed in afterwards). Re-importing Position_History recreates
  // the trade rows but not this — this file is the only backup path for it.
  { value: 'notes',       label: 'Notes',                    kind: 'journal-notes' },
  { value: 'holidays',    label: 'Holidays',                 kind: 'journal-holidays' },
  // Everything else that was previously only ever set by hand and had no
  // export path at all: tags/strategies, the trading-rules cutoff, the
  // daily check-in questions, timezone, and the balance-alert threshold.
  { value: 'settings',    label: 'Settings',                 kind: 'settings-bundle' },
  { value: 'all',         label: 'All Data',                 kind: 'all' },
]

// Which column holds each raw-CSV kind's date, same mapping used at import time.
const DATE_COLUMN = { position: 'Trade Date', cash: 'Date', balance: 'Trade Date' }

function inRange(date, from, to) {
  if (!date || isNaN(date)) return false
  if (from && date < from) return false
  if (to) {
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    if (date > toEnd) return false
  }
  return true
}

// Resolves a journal key ('yyyy-MM-dd' daily, 'yyyy-Wnn' weekly, 'yyyy-MM'
// monthly) to the calendar date it represents, for range filtering. Weekly
// keys resolve to the week's last trading day (skipping holidays), matching
// how the calendar groups entries.
function dateOfKey(key, holidayStore) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  if (/^\d{4}-W\d{2}$/.test(key)) {
    const [yearStr, wStr] = key.split('-W')
    const year = Number(yearStr), wNum = Number(wStr)
    const weekStart = startOfWeek(new Date(year, 0, 1 + (wNum - 1) * 7), { weekStartsOn: 1 })
    let last = addDays(weekStart, 4)
    for (let i = 4; i >= 0; i--) {
      const d = addDays(weekStart, i)
      if (!holidayStore.isHoliday(format(d, 'yyyy-MM-dd'))) { last = d; break }
    }
    return last
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }
  return null
}

function csvCell(v) {
  if (v === null || v === undefined) return ''
  return JSON.stringify(String(v))
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map(h => csvCell(row[h])).join(','))
  return lines.join('\n')
}

// `.toISOString()` reports the UTC date, which rolls to tomorrow's date for
// anyone west of UTC in the evening — use the app's own timezone setting
// (same one Journal/Settings use) instead, so the "All Data" fallback stamp
// always matches the date the user actually sees on screen.
function today() { return useTimezoneStore().localDate() }

// Turns the selected range into a filename suffix, e.g. "_2026-09-01_to_2026-09-28"
// for a multi-day range, or just "_2026-09-28" when start and end are the same
// day — so a file's name always says exactly what's inside it. No range
// selected (from and to both null) yields no suffix at all.
function rangeSuffix(range) {
  if (!range.from && !range.to) return ''
  const from = format(range.from || range.to, 'yyyy-MM-dd')
  const to   = format(range.to || range.from, 'yyyy-MM-dd')
  return from === to ? `_${from}` : `_${from}_to_${to}`
}

function buildCsvExport(archiveKind, fileBase, range) {
  const rawCsvArchive = useRawCsvArchiveStore()
  const headers = rawCsvArchive.headersFor(archiveKind)
  if (!headers.length) return null
  const dateCol = DATE_COLUMN[archiveKind]
  let rows = rawCsvArchive.allRows(archiveKind)
  if (range.from || range.to) {
    rows = rows.filter(r => {
      const raw = (r[dateCol] || '').slice(0, 10)
      return raw && inRange(new Date(raw), range.from, range.to)
    })
  }
  if (!rows.length) return null
  return { filename: `${fileBase}${rangeSuffix(range)}.csv`, blob: new Blob([toCsv(headers, rows)], { type: 'text/csv' }) }
}

// Same identity used for the broker_id-upsert dedupe in storage.js/
// supabaseAdapter.js's insertTrades — broker_id when the import had one,
// else symbol+bought_at+pnl. A trade's own `id` is NOT usable here: it's
// client-generated per-import (crypto.randomUUID()), so a delete-and-
// reimport (or a fresh device re-importing the same CSVs) gives the "same"
// trade a brand new id, and a notes backup keyed by id would never match
// anything again after that.
function tradeKey(t) {
  return t.broker_id || `${t.symbol}|${t.bought_at}|${t.pnl}`
}

// One entry per trade that actually has user-added content — not every
// trade, so a fully-fresh import (no notes/tags/strategy/chart yet)
// contributes nothing to the export, same as everything else here.
function gatherTradeNotes(range) {
  const tradesStore = useTradesStore()
  const entries = {}
  for (const t of tradesStore.trades) {
    if (t.sold_at && (range.from || range.to) && !inRange(new Date(t.sold_at), range.from, range.to)) continue
    const hasContent = (t.notes && t.notes.trim()) || (t.tags && t.tags.length) || t.strategy || t.chartImage
    if (!hasContent) continue
    entries[tradeKey(t)] = { notes: t.notes || '', tags: t.tags || [], strategy: t.strategy || null, chartImage: t.chartImage || null }
  }
  return entries
}

// Notes + read status + individual trade notes, all as one file:
// { data: {...}, readList: [...], tradeNotes: {...} }. readList can
// reference keys with no entry in `data` (viewing an auto-generated,
// never-edited day still marks it read), so the three are gathered/filtered
// independently rather than merged key-by-key.
function buildNotesExport(range) {
  const journalStore = useJournalStore()
  const holidayStore = useHolidayStore()
  const inSelectedRange = (key) => !(range.from || range.to) || inRange(dateOfKey(key, holidayStore), range.from, range.to)

  const data = {}
  for (const [key, value] of Object.entries(journalStore.data)) {
    if (inSelectedRange(key)) data[key] = value
  }
  const readList = journalStore.readList.filter(inSelectedRange)
  const tradeNotes = gatherTradeNotes(range)

  if (!Object.keys(data).length && !readList.length && !Object.keys(tradeNotes).length) return null
  const out = { data, readList }
  if (Object.keys(tradeNotes).length) out.tradeNotes = tradeNotes
  return { filename: `Notes${rangeSuffix(range)}.json`, blob: new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }) }
}

function buildHolidaysExport(range) {
  const holidayStore = useHolidayStore()
  let list = holidayStore.holidayList
  if (range.from || range.to) {
    list = list.filter(dateStr => {
      const [y, m, d] = dateStr.split('-').map(Number)
      return inRange(new Date(y, m - 1, d), range.from, range.to)
    })
  }
  if (!list.length) return null
  return { filename: `Holidays${rangeSuffix(range)}.json`, blob: new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }) }
}

// Settings are not date-scoped (there's no "settings from last week"), so
// `range` is accepted for signature symmetry with the other builders but
// ignored. Returns null when every value is still at its factory default —
// same "nothing to export" convention as the other builders — so a
// never-touched install doesn't produce a file of pure defaults.
function isDefaultSettings({ tags, strategies, cutoffTime, checklistQuestions, timezone, withdrawReminder }) {
  return tags.length === 0
    && strategies.length === 0
    && cutoffTime === '09:30'
    && JSON.stringify(checklistQuestions) === JSON.stringify(DEFAULT_CHECKLIST)
    && timezone.autoDetect === true && !timezone.manualTz
    && withdrawReminder.enabled === false && withdrawReminder.amount == null
}

function buildSettingsExport() {
  const journalStore = useJournalStore()
  const tradeMetaStore = useTradeMetaStore()
  const tradingRulesStore = useTradingRulesStore()
  const timezoneStore = useTimezoneStore()
  const withdrawReminderStore = useWithdrawReminderStore()

  const out = {
    tags: tradeMetaStore.tags,
    strategies: tradeMetaStore.strategies,
    cutoffTime: tradingRulesStore.cutoffTime,
    checklistQuestions: journalStore.checklistQuestions,
    timezone: { autoDetect: timezoneStore.autoDetect, manualTz: timezoneStore.manualTz },
    withdrawReminder: { enabled: withdrawReminderStore.enabled, amount: withdrawReminderStore.amount },
  }

  if (isDefaultSettings(out)) return null

  return { filename: 'Settings.json', blob: new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }) }
}

function buildOne(typeValue, range) {
  switch (typeValue) {
    case 'position': return buildCsvExport('position', 'Position_History', range)
    case 'cash':      return buildCsvExport('cash', 'Cash_History', range)
    case 'balance':   return buildCsvExport('balance', 'Account_Balance_History', range)
    case 'notes':      return buildNotesExport(range)
    case 'holidays':   return buildHolidaysExport(range)
    case 'settings':   return buildSettingsExport()
    default: return null
  }
}

async function buildAllExport(range) {
  const parts = EXPORT_TYPES
    .filter(t => t.value !== 'all')
    .map(t => buildOne(t.value, range))
    .filter(Boolean)
  if (!parts.length) return null

  // Loaded from a CDN at export time rather than bundled, so zipping "All
  // Data" needs no new build dependency — only fetched when actually used.
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
  const zip = new JSZip()
  for (const p of parts) zip.file(p.filename, p.blob)
  const blob = await zip.generateAsync({ type: 'blob' })
  const suffix = rangeSuffix(range)
  return { filename: `EdgeLog_Export${suffix || `_${today()}`}.zip`, blob }
}

// Main entry point: builds the file for a selected type + range, or null if
// there's nothing to export for that selection.
export async function buildExport(typeValue, range) {
  if (typeValue === 'all') return buildAllExport(range)
  return buildOne(typeValue, range)
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// Restores previously-downloaded Notes/Holidays/Settings JSON files back
// into the app. Additive only — never overwrites an existing entry. Accepts
// both the current flat filenames (Notes.json) and the older quarter-split
// ones (Notes_2026-Q1.json) since either could be lying around from before —
// and a standalone ReadStatus.json from before Notes absorbed it still
// restores fine too, it's just nothing exports in that shape anymore.
export async function importJournalFiles(files) {
  const journalStore = useJournalStore()
  const holidayStore = useHolidayStore()
  const tradeMetaStore = useTradeMetaStore()
  const tradingRulesStore = useTradingRulesStore()
  const timezoneStore = useTimezoneStore()
  const withdrawReminderStore = useWithdrawReminderStore()
  const tradesStore = useTradesStore()

  let notesAdded = 0, notesSkipped = 0
  let holidaysAdded = 0, holidaysSkipped = 0
  let readAdded = 0, readSkipped = 0
  let settingsApplied = 0, settingsSkipped = 0
  let tradeNotesApplied = 0, tradeNotesSkipped = 0

  // Journal entries are cloud-only (stores/journal.js) — importEntries()
  // does the same "skip if already present, otherwise add" merge this used
  // to do by hand, and pushes each added entry to Supabase itself.
  async function restoreNoteEntries(entries) {
    const { added, skipped } = await journalStore.importEntries(entries)
    notesAdded += added
    notesSkipped += skipped
  }

  function restoreReadKeys(keys) {
    for (const key of keys) {
      if (journalStore.isRead(key)) { readSkipped++; continue }
      journalStore.markRead(key)
      readAdded++
    }
  }

  // Per-field "never overwrite" like Settings below, not whole-record like
  // Notes/Holidays — a re-imported CSV plus a restored backup can easily
  // land on a trade that already picked up a strategy tag from elsewhere
  // since the backup was made, and that shouldn't get clobbered just
  // because its notes field happens to be empty.
  async function restoreTradeNotes(entries) {
    const byKey = new Map(tradesStore.trades.map(t => [tradeKey(t), t]))
    for (const [key, saved] of Object.entries(entries)) {
      const trade = byKey.get(key)
      if (!trade) { tradeNotesSkipped++; continue }
      const patch = {}
      if (saved.notes && !trade.notes) patch.notes = saved.notes
      if (saved.tags?.length && !trade.tags?.length) patch.tags = saved.tags
      if (saved.strategy && !trade.strategy) patch.strategy = saved.strategy
      if (saved.chartImage && !trade.chartImage) patch.chartImage = saved.chartImage
      if (Object.keys(patch).length) { await tradesStore.updateTrade(trade.id, patch); tradeNotesApplied++ }
      else tradeNotesSkipped++
    }
  }

  for (const file of files) {
    const text = await file.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { continue }

    if (file.name.startsWith('Notes')) {
      // Current format is { data, readList, tradeNotes? }; a file exported
      // before Notes absorbed Read Status is just the flat { key: value }
      // notes map, with no readList/tradeNotes to restore.
      const isCombined = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && ('data' in parsed || 'readList' in parsed || 'tradeNotes' in parsed)
      if (isCombined) {
        await restoreNoteEntries(parsed.data || {})
        restoreReadKeys(parsed.readList || [])
        if (parsed.tradeNotes) await restoreTradeNotes(parsed.tradeNotes)
      } else {
        await restoreNoteEntries(parsed)
      }
    } else if (file.name.startsWith('Holidays')) {
      for (const dateStr of parsed) {
        if (holidayStore.isHoliday(dateStr)) { holidaysSkipped++; continue }
        holidayStore.markHoliday(dateStr)
        holidaysAdded++
      }
    } else if (file.name.startsWith('ReadStatus')) {
      restoreReadKeys(parsed)
    } else if (file.name.startsWith('TradeNotes')) {
      // Backward compat: a standalone TradeNotes.json from before it got
      // folded into Notes.json. Nothing exports in this shape anymore, but
      // an old file like this restores fine.
      await restoreTradeNotes(parsed)
    } else if (file.name.startsWith('Settings')) {
      // These are single values, not collections, so "never overwrite" is
      // applied as: only fill a setting that's still at its factory
      // default — one already changed counts as "existing" and is left
      // alone, same spirit as the per-entry skip above.
      if (Array.isArray(parsed.tags)) {
        for (const t of parsed.tags) { tradeMetaStore.addTagItem(t.text); settingsApplied++ }
      }
      if (Array.isArray(parsed.strategies)) {
        for (const s of parsed.strategies) { tradeMetaStore.addStrategyItem(s.text); settingsApplied++ }
      }
      if (parsed.cutoffTime) {
        if (tradingRulesStore.cutoffTime === '09:30') { tradingRulesStore.cutoffTime = parsed.cutoffTime; settingsApplied++ }
        else settingsSkipped++
      }
      if (Array.isArray(parsed.checklistQuestions)) {
        if (JSON.stringify(journalStore.checklistQuestions) === JSON.stringify(DEFAULT_CHECKLIST)) {
          journalStore.setChecklistQuestions(parsed.checklistQuestions); settingsApplied++
        } else settingsSkipped++
      }
      if (parsed.timezone) {
        if (timezoneStore.autoDetect === true && !timezoneStore.manualTz) {
          if (parsed.timezone.autoDetect === false && parsed.timezone.manualTz) timezoneStore.setManual(parsed.timezone.manualTz)
          timezoneStore.setAuto(parsed.timezone.autoDetect)
          settingsApplied++
        } else settingsSkipped++
      }
      if (parsed.withdrawReminder) {
        if (withdrawReminderStore.enabled === false && withdrawReminderStore.amount == null) {
          withdrawReminderStore.setAmount(parsed.withdrawReminder.amount)
          withdrawReminderStore.setEnabled(parsed.withdrawReminder.enabled)
          settingsApplied++
        } else settingsSkipped++
      }
    }
  }

  return {
    notesAdded, notesSkipped, holidaysAdded, holidaysSkipped, readAdded, readSkipped,
    settingsApplied, settingsSkipped, tradeNotesApplied, tradeNotesSkipped,
  }
}
