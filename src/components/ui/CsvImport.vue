<template>
  <slot :trigger="openPicker" />

  <!-- Import CSV: one drop zone for any mix of Position History, Cash
       History and Account Balance History — each file does its own part
       (see importFiles / lib/tradeImport.js). -->
  <FileImportModal
    :open="modalOpen" title="Import CSV"
    subtitle="Drop any of your broker files — each one can be imported on its own."
    :disabled="!fileList.length"
    @close="closeModal" @submit="runImport">
    <FileDropZone
      accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel"
      hint="Position, Cash, Account Balance History — any combination"
      @files="onFiles" />
    <ul v-if="fileList.length" class="space-y-2">
      <FileListRow
        v-for="f in fileList" :key="f.zone"
        :name="f.file.name" :status="f.label" :ok="true"
        @remove="zoneFiles[f.zone] = null" />
    </ul>
    <ul class="text-2xs text-ink-faint space-y-1 leading-relaxed">
      <li><span class="text-ink-muted">Position History</span> — adds your trades, with fees from any Cash History you've imported.</li>
      <li><span class="text-ink-muted">Cash History</span> — deposits &amp; withdrawals, and fees on trades you already have. Never adds trades.</li>
      <li><span class="text-ink-muted">Account Balance History</span> — sets your starting balance.</li>
    </ul>
  </FileImportModal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parseCSV, parseRows, detectCSVFormat, parseBalanceHistory } from '@/lib/csvParser'
import { buildTradeImport } from '@/lib/tradeImport'
import { useTradesStore } from '@/stores/trades'
import { useBalanceStore } from '@/stores/balance'
import { useCashEventsStore } from '@/stores/cashEvents'
import { useRawCsvArchiveStore } from '@/stores/rawCsvArchive'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useBusy } from '@/composables/useBusy'
import FileImportModal from '@/components/ui/FileImportModal.vue'
import FileDropZone from '@/components/ui/FileDropZone.vue'
import FileListRow from '@/components/ui/FileListRow.vue'

const emit = defineEmits(['done'])
const tradesStore  = useTradesStore()
const balanceStore = useBalanceStore()
const cashEventsStore = useCashEventsStore()
const rawCsvArchive = useRawCsvArchiveStore()
const toast = useToast()
const { confirm: $confirm } = useConfirm()
const busy = useBusy()

// zoneFiles: the one file of each kind waiting to be imported.
const modalOpen = ref(false)
const zoneFiles = ref({ position: null, cash: null, balance: null })

// prefill: { position?, cash?, balance? } files (not a click event, which
// the slot's `trigger` passes when used straight as a handler).
function openPicker(prefill) {
  const files = prefill instanceof Event ? {} : prefill || {}
  zoneFiles.value = { position: null, cash: null, balance: null, ...files }
  modalOpen.value = true
}
function closeModal() { modalOpen.value = false }

const KINDS = ['position', 'cash', 'balance']
const LABELS = { position: 'Position History', cash: 'Cash History', balance: 'Account Balance History' }

// Each dropped/picked file is classified by its own content
// (detectCSVFormat), so there's nothing to get wrong about which is which.
async function onFiles(files) {
  for (const file of files) {
    const fmt = detectCSVFormat(await file.text())
    if (KINDS.includes(fmt)) zoneFiles.value[fmt] = file
    else toast.error(`${file.name} doesn't look like a Position, Cash or Account Balance History file`)
  }
}

const fileList = computed(() =>
  KINDS.filter(k => zoneFiles.value[k]).map(k => ({ zone: k, file: zoneFiles.value[k], label: LABELS[k] })))

async function runImport() {
  if (!fileList.value.length) return
  const files = { ...zoneFiles.value }
  modalOpen.value = false
  await importFiles(files)
}

const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`

// Imports any mix of the three files behind one confirm step. What a
// Position-only or Cash-only import does is worked out by lib/tradeImport.js.
async function importFiles({ position, cash, balance }) {
  try {
    const [posText, cashText, balText] = await Promise.all([position, cash, balance].map(f => (f ? f.text() : null)))

    // Account Balance History: the computed numbers are always shown before
    // committing, so a right-shaped file for the wrong account is caught.
    let bal = null
    if (balText) {
      bal = parseBalanceHistory(balText)
      if (bal.errors.length) { toast.error(bal.errors.join('; ')); return }
    }

    let plan = null
    if (posText || cashText) {
      // Fees come from the rows earlier imports saved — make sure they're here.
      if (!rawCsvArchive.loaded) await rawCsvArchive.load()
      plan = buildTradeImport({
        positionText: posText, cashText,
        savedPosition: rawCsvArchive.data.position, savedCash: rawCsvArchive.data.cash,
        existingTrades: tradesStore.trades,
      })
      if (plan.errors.length) { toast.error(plan.errors.join('; ')); return }
      if (posText && !plan.fileTradeCount) { toast.error('No valid trades found'); return }
      // Surface structural issues before the confirm dialog, not after.
      for (const w of plan.warnings) toast.warn(w)
    }

    const adds = []
    if (plan?.newTradeCount) adds.push(plural(plan.newTradeCount, 'trade'))
    if (plan?.fundTransactions.length) adds.push(plural(plan.fundTransactions.length, 'fund transaction'))
    const lines = []
    if (adds.length) lines.push(`This will add ${adds.join(' and ')} to your journal.`)
    if (plan?.updateCount) lines.push(`${plural(plan.updateCount, 'trade')} you already have will be updated.`)
    if (plan?.refreshCount) lines.push('Fees on matching trades you already have will be updated.')
    if (plan?.unchangedCount && !lines.length) lines.push(`All ${plural(plan.unchangedCount, 'trade')} in this file are already in your journal.`)
    if (cashText && !lines.length) lines.push('This will update your cash history.')
    if (bal) lines.push(`Starting balance will be set to $${bal.rawStarting.toFixed(2)}, effective ${bal.earliestBalanceDate || 'unknown date'}.`)

    const ok = await $confirm({ title: 'Import CSV', message: lines.join(' '), confirmLabel: 'Import' })
    if (!ok) return

    // Everything from here on writes to Supabase, often several saves in a
    // row — the loading cover blocks the page until they've all finished.
    const hasCash = plan && (plan.fundTransactions.length || plan.cashEvents.length)
    const backups = !!(bal || posText || cashText)
    const total = [bal, hasCash, backups, plan?.trades.length].filter(Boolean).length
    await busy.run('Importing…', async step => {
      if (bal) {
        step('Setting starting balance')
        await balanceStore.setStartingBalance(bal.rawStarting, bal.earliestBalanceDate)
        toast.success(`Starting balance set to $${bal.rawStarting.toFixed(2)}`)
      }

      if (hasCash) {
        step('Recording deposits & withdrawals')
        // Fund transactions + raw cash events (drawdown/peak equity), merged
        // together: both update their store before their first await, so the
        // Dashboard's charts redraw once for the pair instead of once each.
        const [added] = await Promise.all([
          plan.fundTransactions.length ? balanceStore.mergeTransactions(plan.fundTransactions) : 0,
          plan.cashEvents.length ? cashEventsStore.mergeEvents(plan.cashEvents) : 0,
        ])
        if (added > 0) toast.success(`${plural(added, 'fund transaction')} recorded`)
      }

      // Archive the original, untouched CSV rows (exact broker columns): later
      // imports take fees from them, and an Export page download of them
      // re-imports the same way this file did.
      if (backups) step('Backing up your files')
      for (const [kind, text] of [['balance', balText], ['position', posText], ['cash', cashText]]) {
        const rows = text ? parseRows(text) : []
        if (rows.length) await rawCsvArchive.mergeRows(kind, Object.keys(rows[0]), rows)
      }
      if (!plan) return

      if (plan.trades.length) step('Saving trades')
      const result = plan.trades.length
        ? await tradesStore.insertTrades(plan.trades)
        : { inserted: 0, updated: 0, skipped: 0 }
      if (posText) {
        reportTrades({ ...result, skipped: result.skipped + plan.unchangedCount })
      } else {
        toast.success(result.updated > 0
          ? `Cash History imported — fees updated on ${plural(result.updated, 'trade')}`
          : 'Cash History imported')
        emit('done', result)
      }
    }, { total })
  } catch (e) {
    toast.error('Import failed: ' + e.message)
  }
}

// ── primary entry point (drag-drop onto a page, e.g. TradesView) ──────────────
// Broker files open the modal with them filled in, so more can be added;
// a Performance / unrecognised file imports straight away.
async function handleFiles(files) {
  if (!files.length) return
  const labeled = await Promise.all(files.map(async f => {
    const text = await f.text()
    return { file: f, text, fmt: detectCSVFormat(text) }
  }))

  const prefill = {}
  for (const l of labeled) if (KINDS.includes(l.fmt) && !prefill[l.fmt]) prefill[l.fmt] = l.file
  if (Object.keys(prefill).length) { openPicker(prefill); return }

  const perf = labeled.find(l => l.fmt === 'performance')
  await runSingle((perf || labeled[0]).text)
}

// ── Performance.csv / generic files ──────────────────────────────────────────
async function runSingle(text) {
  try {
    const { trades, errors, warnings } = parseCSV(text)
    if (errors.length) { toast.error(errors.join('; ')); return }
    if (!trades.length) { toast.error('No valid trades found'); return }
    // Surface structural issues (missing columns, skipped blank rows) before
    // the confirm dialog, so they're seen BEFORE committing, not buried in a
    // toast after the fact when the person's already moved on.
    for (const w of warnings) toast.warn(w)

    const ok = await $confirm({
      title: 'Import CSV',
      message: `This will add ${plural(trades.length, 'trade')} to your journal.`,
      confirmLabel: 'Import',
    })
    if (!ok) return

    await busy.run(`Importing ${plural(trades.length, 'trade')}…`, async step => {
      step('Saving trades')
      reportTrades(await tradesStore.insertTrades(trades))
    })
  } catch (e) {
    toast.error('Import failed: ' + e.message)
  }
}

function reportTrades({ inserted, updated, skipped }) {
  if (!inserted && !updated && skipped) {
    toast.success(`No new trades — ${skipped === 1 ? 'it was' : `all ${skipped} were`} already in your journal`)
    emit('done', { inserted, updated, skipped })
    return
  }
  let msg = `Imported ${plural(inserted, 'trade')}`
  const extras = []
  if (updated > 0) extras.push(`${updated} updated`)
  if (skipped > 0) extras.push(`${skipped} unchanged`)
  if (extras.length) msg += ` (${extras.join(', ')})`
  toast.success(msg)
  emit('done', { inserted, updated, skipped })
}

// expose for drag-drop from parent views
async function processFiles(files) { await handleFiles([...files]) }

defineExpose({ openPicker, processFiles })
</script>
