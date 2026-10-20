<template>
  <slot :trigger="openPicker" />

  <!-- Import CSV modal: one drop zone for any mix of Position History, Cash
       History and Account Balance History — each file does its own part
       (see importFiles / lib/tradeImport.js). -->
  <Teleport to="body">
    <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="closeModal">
      <div class="bg-surface-2 border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="text-sm font-semibold text-ink">Import CSV</h2>
            <p class="text-xs text-ink-muted mt-0.5">Drop any of your broker files — each one can be imported on its own.</p>
          </div>
          <TooltipWrap tip="Close">
            <button class="text-ink-faint hover:text-ink transition-colors flex-shrink-0" @click="closeModal">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </TooltipWrap>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto">
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
        </div>

        <div class="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <button class="btn btn-ghost btn-sm flex-1" @click="closeModal">Cancel</button>
          <button
            class="btn btn-primary btn-sm flex-1"
            :disabled="!fileList.length"
            @click="runImport">
            Import
          </button>
        </div>
      </div>
    </div>
  </Teleport>
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
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import FileDropZone from '@/components/ui/FileDropZone.vue'
import FileListRow from '@/components/ui/FileListRow.vue'

const emit = defineEmits(['done'])
const tradesStore  = useTradesStore()
const balanceStore = useBalanceStore()
const cashEventsStore = useCashEventsStore()
const rawCsvArchive = useRawCsvArchiveStore()
const toast = useToast()
const { confirm: $confirm } = useConfirm()

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
      if (plan.errors.length) { toast.warn(plan.errors.join('; ')); return }
      if (posText && !plan.newTradeCount) { toast.error('No valid trades found'); return }
      // Surface structural issues before the confirm dialog, not after.
      for (const w of plan.warnings) toast.warn(w)
    }

    const adds = []
    if (plan?.newTradeCount) adds.push(plural(plan.newTradeCount, 'trade'))
    if (plan?.fundTransactions.length) adds.push(plural(plan.fundTransactions.length, 'fund transaction'))
    const lines = []
    if (adds.length) lines.push(`This will add ${adds.join(' and ')} to your journal.`)
    if (plan?.refreshCount) lines.push('Fees on matching trades you already have will be updated.')
    if (cashText && !lines.length) lines.push('This will update your cash history.')
    if (bal) lines.push(`Starting balance will be set to $${bal.rawStarting.toFixed(2)}, effective ${bal.earliestBalanceDate || 'unknown date'}.`)

    const ok = await $confirm({ title: 'Import CSV', message: lines.join(' '), confirmLabel: 'Import' })
    if (!ok) return

    // Everything from here on writes to Supabase — the loading toast is the
    // only sign anything's happening until it resolves.
    const loadingId = toast.loading('Importing…')
    try {
      if (bal) {
        await balanceStore.setStartingBalance(bal.rawStarting, bal.earliestBalanceDate)
        // Archive the original rows so the Export page can produce a re-importable file
        const balRows = parseRows(balText)
        if (balRows.length) await rawCsvArchive.mergeRows('balance', Object.keys(balRows[0]), balRows)
        toast.success(`Starting balance set to $${bal.rawStarting.toFixed(2)}`)
      }
      if (!plan) return

      if (plan.fundTransactions.length) {
        const added = await balanceStore.mergeTransactions(plan.fundTransactions)
        if (added > 0) toast.info(`${plural(added, 'fund transaction')} recorded`)
      }
      // Raw cash events for drawdown/peak equity calculation
      if (plan.cashEvents.length) await cashEventsStore.mergeEvents(plan.cashEvents)
      // Archive the original, untouched CSV rows (exact broker columns): later
      // imports take fees from them, and an Export page download of them
      // re-imports the same way this file did.
      if (posText) {
        const posRows = parseRows(posText)
        if (posRows.length) await rawCsvArchive.mergeRows('position', Object.keys(posRows[0]), posRows)
      }
      if (cashText) {
        const cashRows = parseRows(cashText)
        if (cashRows.length) await rawCsvArchive.mergeRows('cash', Object.keys(cashRows[0]), cashRows)
      }

      const result = plan.trades.length
        ? await tradesStore.insertTrades(plan.trades)
        : { inserted: 0, updated: 0, skipped: 0 }
      if (posText) {
        reportTrades(result)
      } else {
        toast.success(result.updated > 0
          ? `Cash History imported — fees updated on ${plural(result.updated, 'trade')}`
          : 'Cash History imported')
        emit('done', result)
      }
    } finally {
      toast.dismiss(loadingId)
    }
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
    if (errors.length) { toast.warn(errors.join('; ')); return }
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

    const loadingId = toast.loading(`Importing ${plural(trades.length, 'trade')}…`)
    try {
      reportTrades(await tradesStore.insertTrades(trades))
    } finally {
      toast.dismiss(loadingId)
    }
  } catch (e) {
    toast.error('Import failed: ' + e.message)
  }
}

function reportTrades({ inserted, updated, skipped }) {
  let msg = `Imported ${plural(inserted, 'trade')}`
  const extras = []
  if (updated > 0) extras.push(`${updated} updated`)
  if (skipped > 0) extras.push(`${skipped} unchanged`)
  if (extras.length) msg += ` (${extras.join(', ')})`
  toast.success(msg)
  emit('done', { inserted, updated, skipped })
}

// expose for drag-drop from parent views
async function processFile(file)   { await handleFiles([file]) }
async function processFiles(files) { await handleFiles([...files]) }

defineExpose({ openPicker, processFile, processFiles })
</script>
