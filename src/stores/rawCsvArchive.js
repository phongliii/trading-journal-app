import { defineStore } from 'pinia'
import { ref } from 'vue'
import { rawCsvArchiveAdapter } from '@/lib/rawCsvArchiveAdapter'
import { useAccountsStore } from './accounts'
import { useToast } from '@/composables/useToast'
import { reportCloudError } from '@/lib/cloudErrors'

// Keeps the ORIGINAL broker CSV rows (exact columns, untouched) for
// Position_History, Cash_History and Account_Balance_History, so a
// "Backup Now" export can be re-imported later through the normal
// CSV import flow — unlike the app's internal normalized trade records,
// which drop broker-specific columns (fill IDs, raw fee rows, etc.)
// needed to re-derive fees on import.
//
// Cloud-only now (see lib/rawCsvArchiveAdapter.js) — no localStorage copy.
// `data` starts as three empty buckets and is populated by load() (called
// from App.vue once signed in, same gating as trades/journal). A failed
// write surfaces via toast rather than failing silently, since there's no
// local fallback left to catch it.

function emptyData() {
  return {
    position: { headers: [], rows: [] },
    cash:     { headers: [], rows: [] },
    balance:  { headers: [], rows: [] },
  }
}

// Best-effort natural key for de-duplication per kind, falling back to a
// stringified row if the expected id columns aren't present.
function keyFor(kind, row) {
  if (kind === 'position') {
    const k = `${row['Buy Fill ID'] || ''}|${row['Sell Fill ID'] || ''}`
    return k !== '|' ? k : JSON.stringify(row)
  }
  if (kind === 'cash') {
    return row['Transaction ID'] || JSON.stringify(row)
  }
  if (kind === 'balance') {
    return `${row['Account ID'] || ''}|${row['Trade Date'] || ''}` || JSON.stringify(row)
  }
  return JSON.stringify(row)
}

// Which column holds each row's date, for quarterly splitting on backup.
const DATE_COLUMN = { position: 'Trade Date', cash: 'Date', balance: 'Trade Date' }

export const useRawCsvArchiveStore = defineStore('rawCsvArchive', () => {
  const accountsStore = useAccountsStore()
  const data = ref(emptyData())
  const loading = ref(false)
  const loaded  = ref(false)
  const toast = useToast()

  async function load() {
    loading.value = true
    try {
      data.value = await rawCsvArchiveAdapter.load(accountsStore.activeAccountId)
      loaded.value = true
    } catch (e) {
      reportCloudError(toast, e, 'Could not load the raw CSV archive from the cloud:',
        'Could not load your backed-up CSV history from the cloud.')
    } finally {
      loading.value = false
    }
  }

  async function clearAll() {
    await rawCsvArchiveAdapter.clearAll(accountsStore.activeAccountId)
    data.value = emptyData()
  }

  async function mergeRows(kind, headers, rows) {
    if (!rows || !rows.length) return 0
    const bucket = data.value[kind]
    const newHeaders = bucket.headers.length ? bucket.headers : headers
    const existingKeys = new Set(bucket.rows.map(r => keyFor(kind, r)))
    const fresh = rows.filter(r => !existingKeys.has(keyFor(kind, r)))
    if (fresh.length) {
      const newRows = [...bucket.rows, ...fresh]
      data.value = { ...data.value, [kind]: { headers: newHeaders, rows: newRows } }
      try {
        await rawCsvArchiveAdapter.saveBucket(accountsStore.activeAccountId, kind, newHeaders, newRows)
      } catch (e) {
        reportCloudError(toast, e, `Could not save the ${kind} CSV archive to the cloud:`,
          `Could not back up your ${kind} CSV rows to the cloud — try re-importing.`)
      }
    }
    return fresh.length
  }

  // Rows for `kind` whose date column falls within [qStart, qEnd)
  function rowsInRange(kind, qStart, qEnd) {
    const bucket = data.value[kind]
    const col = DATE_COLUMN[kind]
    return bucket.rows.filter(r => {
      const raw = (r[col] || '').slice(0, 10) // yyyy-MM-dd prefix
      if (!raw) return false
      const d = new Date(raw)
      return d >= qStart && d < qEnd
    })
  }

  // All of `kind`'s rows grouped by the calendar quarter of their date column,
  // e.g. Map { '2026-Q1' => [...], '2026-Q3' => [...] }. Used so Backup Now
  // can write every quarter that has data, not just the current one.
  function rowsByQuarter(kind) {
    const bucket = data.value[kind]
    const col = DATE_COLUMN[kind]
    const map = new Map()
    for (const r of bucket.rows) {
      const raw = (r[col] || '').slice(0, 10)
      if (!raw) continue
      const d = new Date(raw)
      if (isNaN(d)) continue
      const label = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(r)
    }
    return map
  }

  function headersFor(kind) {
    return data.value[kind].headers
  }

  // All of `kind`'s rows, unsplit. Used by the Export page — Position/Cash
  // are filtered by date range at export time, and Account Balance History
  // always exports as one cumulative file since its starting balance is
  // derived from the earliest row in whichever file gets re-imported.
  function allRows(kind) {
    return data.value[kind].rows
  }

  return { data, loading, loaded, load, clearAll, mergeRows, rowsInRange, rowsByQuarter, headersFor, allRows }
})
