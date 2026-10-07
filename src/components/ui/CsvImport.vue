<template>
  <slot :trigger="openPicker" />

  <!-- Import CSV modal: Trade tab (Position required, Cash optional) and
       Account tab (Balance only), so balance-only imports aren't blocked
       on having a Position History file. -->
  <Teleport to="body">
    <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="closeModal">
      <div class="bg-surface-2 border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="text-sm font-semibold text-ink">Import CSV</h2>
            <p class="text-xs text-ink-muted mt-0.5">Import trades, or set up account balance.</p>
          </div>
          <TooltipWrap tip="Close">
            <button class="text-ink-faint hover:text-ink transition-colors flex-shrink-0" @click="closeModal">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </TooltipWrap>
        </div>

        <div class="px-5 pt-3 flex gap-1 border-b border-border flex-shrink-0">
          <button
            class="px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors"
            :class="activeTab === 'trade' ? 'text-brand border-brand' : 'text-ink-faint border-transparent hover:text-ink-muted'"
            @click="activeTab = 'trade'">
            Trade
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors"
            :class="activeTab === 'account' ? 'text-brand border-brand' : 'text-ink-faint border-transparent hover:text-ink-muted'"
            @click="activeTab = 'account'">
            Account
          </button>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto">

          <template v-if="activeTab === 'trade'">
            <div>
              <p class="text-xs font-medium text-ink mb-1.5">
                CSV Files <span class="text-ink-faint font-normal">— Position History required, Cash History optional</span>
              </p>
              <FileDropZone
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel"
                hint="Drop one or both files — the type is detected automatically"
                @files="onTradeFiles" />
              <ul v-if="tradeFileList.length" class="mt-3 space-y-2">
                <FileListRow
                  v-for="f in tradeFileList" :key="f.zone"
                  :name="f.file.name" :status="f.label" :ok="true"
                  @remove="zoneFiles[f.zone] = null" />
              </ul>
            </div>
          </template>

          <template v-else>
            <div>
              <p class="text-xs font-medium text-ink mb-1.5">Account Balance History <span class="text-down">*</span></p>
              <FileDropZone
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel"
                :multiple="false"
                hint="Account_Balance_History.csv"
                @files="onBalanceFiles" />
              <ul v-if="accountFileList.length" class="mt-3 space-y-2">
                <FileListRow
                  v-for="f in accountFileList" :key="f.zone"
                  :name="f.file.name" :status="f.label" :ok="true"
                  @remove="zoneFiles.balance = null" />
              </ul>
            </div>
          </template>

        </div>

        <div class="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <button class="btn btn-ghost btn-sm flex-1" @click="closeModal">Cancel</button>
          <button
            class="btn btn-primary btn-sm flex-1"
            :disabled="activeTab === 'trade' ? !zoneFiles.position : !zoneFiles.balance"
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
import { parseCSV, parseDualCSV, parseRows, detectCSVFormat, parseBalanceHistory } from '@/lib/csvParser'
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

// modal = { open, activeTab: 'trade' | 'account', zoneFiles: { position, cash, balance } }
const modalOpen = ref(false)
const activeTab = ref('trade')
const zoneFiles = ref({ position: null, cash: null, balance: null })

function openPicker() {
  activeTab.value = 'trade'
  zoneFiles.value = { position: null, cash: null, balance: null }
  modalOpen.value = true
}
function closeModal() { modalOpen.value = false }

// Trade tab: one drop zone takes Position History and/or Cash History
// together — each dropped/picked file is classified by its own content
// (detectCSVFormat), not by which box it landed in, so there's nothing
// to get wrong about which file goes where.
async function onTradeFiles(files) {
  for (const file of files) {
    const fmt = detectCSVFormat(await file.text())
    if (fmt === 'position') zoneFiles.value.position = file
    else if (fmt === 'cash') zoneFiles.value.cash = file
    else toast.error(`${file.name} doesn't look like a Position or Cash History file`)
  }
}

// Account tab: single Account Balance History file.
async function onBalanceFiles(files) {
  for (const file of files) {
    const fmt = detectCSVFormat(await file.text())
    if (fmt === 'balance') zoneFiles.value.balance = file
    else toast.error(`${file.name} doesn't look like an Account Balance History file`)
  }
}

const tradeFileList = computed(() => {
  const list = []
  if (zoneFiles.value.position) list.push({ zone: 'position', file: zoneFiles.value.position, label: 'Position History' })
  if (zoneFiles.value.cash) list.push({ zone: 'cash', file: zoneFiles.value.cash, label: 'Cash History (fees)' })
  return list
})
const accountFileList = computed(() => {
  return zoneFiles.value.balance
    ? [{ zone: 'balance', file: zoneFiles.value.balance, label: 'Account Balance History' }]
    : []
})

async function runImport() {
  if (activeTab.value === 'account') {
    if (!zoneFiles.value.balance) return
    const balanceFile = zoneFiles.value.balance
    modalOpen.value = false
    await runBalance(balanceFile)
    return
  }

  if (!zoneFiles.value.position) return
  const posFile  = zoneFiles.value.position
  const cashFile = zoneFiles.value.cash
  modalOpen.value = false

  if (cashFile) {
    await runDual(posFile, cashFile)
  } else {
    await runSingle(await posFile.text())
  }
}

// Parses an Account Balance History file and, after the person confirms the
// computed starting balance and effective date, sets it up for tracking.
// Guards against importing a file with the right shape but wrong data (e.g.
// the wrong account) by always showing the computed numbers before committing.
async function runBalance(file) {
  try {
    const text = await file.text()
    const { rawStarting, earliestBalanceDate, errors } = parseBalanceHistory(text)
    if (errors.length) { toast.error(errors.join('; ')); return }

    const dateLabel = earliestBalanceDate || 'unknown date'
    const ok = await $confirm({
      title: 'Set Starting Balance',
      message: `Set starting balance to $${rawStarting.toFixed(2)}, effective ${dateLabel}?`,
      confirmLabel: 'Set Balance',
    })
    if (!ok) return

    // Everything from here on writes to Supabase (setStartingBalance,
    // rawCsvArchive.mergeRows), which didn't used to be true when this was
    // all localStorage — a loading toast is the only sign anything's
    // happening until it resolves.
    const loadingId = toast.loading('Setting starting balance…')
    try {
      await balanceStore.setStartingBalance(rawStarting, earliestBalanceDate)
      // Archive the original rows so the Export page can produce a re-importable file
      const balRows = parseRows(text)
      if (balRows.length) await rawCsvArchive.mergeRows('balance', Object.keys(balRows[0]), balRows)
      toast.success(`Starting balance set to $${rawStarting.toFixed(2)}`)
    } finally {
      toast.dismiss(loadingId)
    }
  } catch (e) {
    toast.error('Failed to parse balance file: ' + e.message)
  }
}

// ── primary entry point (drag-drop onto a page, e.g. TradesView) ──────────────
async function handleFiles(files) {
  if (!files.length) return

  if (files.length === 1) {
    await handleSingleFile(files[0])
    return
  }

  // Multiple files — try to pair them
  const labeled = await Promise.all(files.map(async f => ({ file: f, fmt: detectCSVFormat(await f.text()) })))
  const position = labeled.find(l => l.fmt === 'position')
  const cash     = labeled.find(l => l.fmt === 'cash')
  const balance  = labeled.find(l => l.fmt === 'balance')
  const perf     = labeled.find(l => l.fmt === 'performance')

  if (position && cash) {
    await runDual(position.file, cash.file)
  } else if (perf) {
    await runSingle(await perf.file.text())
  } else if (position) {
    await runSingle(await position.file.text())
  } else if (balance) {
    // Balance alone imports on its own — open the Account tab with it pre-filled.
    activeTab.value = 'account'
    zoneFiles.value = { position: null, cash: null, balance: balance.file }
    modalOpen.value = true
  } else if (cash) {
    // Cash alone can't be imported — open the modal with Cash pre-filled so
    // they can drop the matching Position History file in (which is required).
    activeTab.value = 'trade'
    zoneFiles.value = { position: null, cash: cash.file, balance: null }
    modalOpen.value = true
    toast.info('Add the matching Position History file to import')
  } else {
    // Generic: just try first file
    await runSingle(await files[0].text())
  }
}

async function handleSingleFile(file) {
  const text = await file.text()
  const fmt  = detectCSVFormat(text)

  if (fmt === 'performance' || fmt === 'unknown') {
    await runSingle(text)
    return
  }

  // Balance imports entirely on its own — open straight to the Account tab.
  if (fmt === 'balance') {
    activeTab.value = 'account'
    zoneFiles.value = { position: null, cash: null, balance: file }
    modalOpen.value = true
    return
  }

  // Position/Cash need a partner — open the Trade tab with the loaded file pre-filled
  activeTab.value = 'trade'
  if (fmt === 'position') {
    zoneFiles.value = { position: file, cash: null, balance: null }
  } else if (fmt === 'cash') {
    zoneFiles.value = { position: null, cash: file, balance: null }
  }
  modalOpen.value = true
}

// ── core runners ─────────────────────────────────────────────────────────────
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
      message: `This will add ${trades.length} trade${trades.length !== 1 ? 's' : ''} to your journal.`,
      confirmLabel: 'Import',
    })
    if (!ok) return

    const loadingId = toast.loading(`Importing ${trades.length} trade${trades.length !== 1 ? 's' : ''}…`)
    try {
      await finish(trades)
    } finally {
      toast.dismiss(loadingId)
    }
  } catch (e) {
    toast.error('Import failed: ' + e.message)
  }
}

async function runDual(posFile, cashFile) {
  try {
    const [posText, cashText] = await Promise.all([posFile.text(), cashFile.text()])
    const { trades, fundTransactions, cashEvents, errors, warnings } = parseDualCSV(posText, cashText)
    if (errors.length) { toast.warn(errors.join('; ')); return }
    if (!trades.length) { toast.error('No valid trades found'); return }
    for (const w of warnings) toast.warn(w)

    const parts = [`${trades.length} trade${trades.length !== 1 ? 's' : ''}`]
    if (fundTransactions.length) parts.push(`${fundTransactions.length} fund transaction${fundTransactions.length !== 1 ? 's' : ''}`)
    const ok = await $confirm({
      title: 'Import CSV',
      message: `This will add ${parts.join(' and ')} to your journal.`,
      confirmLabel: 'Import',
    })
    if (!ok) return

    const loadingId = toast.loading(`Importing ${parts.join(' and ')}…`)
    try {
      // Auto-merge fund transactions
      if (fundTransactions.length) {
        const added = await balanceStore.mergeTransactions(fundTransactions)
        if (added > 0) toast.info(`${added} fund transaction${added !== 1 ? 's' : ''} recorded`)
      }
      // Merge raw cash events for drawdown/peak equity calculation
      if (cashEvents.length) {
        await cashEventsStore.mergeEvents(cashEvents)
      }
      // Archive the original, untouched CSV rows (exact broker columns) so a
      // later Export page download can be re-imported the same way this file was.
      const posRows = parseRows(posText)
      if (posRows.length) await rawCsvArchive.mergeRows('position', Object.keys(posRows[0]), posRows)
      const cashRows = parseRows(cashText)
      if (cashRows.length) await rawCsvArchive.mergeRows('cash', Object.keys(cashRows[0]), cashRows)
      await finish(trades)
    } finally {
      toast.dismiss(loadingId)
    }
  } catch (e) {
    toast.error('Import failed: ' + e.message)
  }
}

async function finish(trades) {
  const { inserted, updated, skipped } = await tradesStore.insertTrades(trades)
  let msg = `Imported ${inserted} trade${inserted !== 1 ? 's' : ''}`
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
