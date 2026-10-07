<template>
  <div class="p-6 space-y-4 w-full min-w-[1000px]">

    <!-- Skeleton: shown only on the initial load, before we know whether
         there are any trades yet — avoids flashing the "drop your CSV"
         empty state for a moment before real data (or the real table)
         appears. -->
    <div v-if="tradesStore.loading && tradesStore.trades.length === 0" class="space-y-4">
      <div class="flex items-center gap-3">
        <Skeleton class="h-8 flex-1 max-w-xs !rounded-lg" />
        <Skeleton class="h-8 w-20 !rounded-lg" />
        <Skeleton class="h-8 w-20 !rounded-lg" />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Skeleton v-for="i in 6" :key="i" class="h-16 !rounded-xl" />
      </div>
      <div class="bg-surface-2 border border-border rounded-xl p-4 space-y-2">
        <Skeleton v-for="i in 8" :key="i" class="h-7 w-full" />
      </div>
    </div>

    <template v-else>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3 gap-y-2">
      <!-- Search -->
      <div class="relative flex-1 min-w-[180px] max-w-xs">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input v-model="search" class="input pl-9 py-1.5 text-xs" placeholder="Search symbol…" />
      </div>

      <!-- Filter outcome -->
      <div class="flex flex-wrap gap-1">
        <button v-for="f in filters" :key="f.val"
          @click="outcome = f.val"
          class="btn btn-ghost btn-sm whitespace-nowrap"
          :class="outcome === f.val ? '!border-border-strong !text-ink !bg-surface-3' : ''">
          {{ f.label }}
        </button>
      </div>

      <div class="flex items-center gap-2 flex-wrap sm:ml-auto">
        <DatePickerCalendar v-if="tradesStore.trades.length" v-model="filterDate" v-model:range-start="rangeStart" v-model:range-end="rangeEnd" />
        <div class="hidden"><CsvImport ref="importer" /></div>
        <button v-if="canDelete" class="btn btn-danger btn-sm whitespace-nowrap" @click="confirmClearTrades">
          {{ clearLabel }}
        </button>
      </div>
    </div>

    <!-- Summary cards: stats for currently filtered/searched trades -->
    <div v-if="tradesStore.trades.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
      <div v-for="m in summaryMetrics" :key="m.label" class="bg-surface-2 border border-border rounded-xl px-4 py-3">
        <div class="flex items-center justify-between gap-2 mb-1">
          <div class="text-2xs text-ink-muted">{{ m.label }}</div>
          <TooltipWrap v-if="m.tip" :tip="m.tip">
            <svg class="w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
              <path d="M11 12h1v5h1" stroke-linecap="round"/>
            </svg>
          </TooltipWrap>
        </div>
        <div class="font-mono text-lg font-semibold" :class="m.class">
          <CompactValue v-if="m.raw !== undefined" :value="m.raw" />
          <template v-else>{{ m.val }}</template>
        </div>
      </div>
    </div>

    <!-- Drop zone (empty) -->
    <div v-if="tradesStore.trades.length === 0"
      class="border-2 border-dashed border-border rounded-2xl p-16 text-center cursor-pointer transition-colors hover:border-brand/40 hover:bg-brand/5"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
      @click="importer?.openPicker()"
      :class="{ '!border-brand/60 !bg-brand/10': dragOver }">
      <div class="w-12 h-12 rounded-xl bg-surface-3 border border-border flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
      </div>
      <p class="text-sm font-medium text-ink mb-1">Drop your CSV file here</p>
      <p class="text-xs text-ink-muted">or click to browse · Supports TradeStation, Rithmic, NinjaTrader</p>
    </div>

    <!-- Table -->
    <div v-if="tradesStore.trades.length > 0" class="bg-surface-2 border border-border rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="w-8">#</th>
              <th @click="sort('symbol')" class="cursor-pointer hover:text-ink">
                Symbol <SortArrow field="symbol" :current="sortField" :dir="sortDir" />
              </th>
              <th>Side</th>
              <th>Qty</th>
              <th @click="sort('buy_price')" class="cursor-pointer hover:text-ink">
                Entry <SortArrow field="buy_price" :current="sortField" :dir="sortDir" />
              </th>
              <th @click="sort('sell_price')" class="cursor-pointer hover:text-ink">
                Exit <SortArrow field="sell_price" :current="sortField" :dir="sortDir" />
              </th>
              <th @click="sort('pnl')" class="cursor-pointer hover:text-ink">
                P&L <SortArrow field="pnl" :current="sortField" :dir="sortDir" />
              </th>
              <th @click="sort('fees')" class="cursor-pointer hover:text-ink">
                Fees <SortArrow field="fees" :current="sortField" :dir="sortDir" />
              </th>
              <th>Result</th>
              <th @click="sort('sold_at')" class="cursor-pointer hover:text-ink">
                Date <SortArrow field="sold_at" :current="sortField" :dir="sortDir" />
              </th>
              <th>Time</th>
              <th>Duration</th>
              <th class="w-10"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="shown.length === 0">
              <td colspan="11" class="text-center py-12 text-ink-muted text-xs">
                <div v-if="filterDate || (rangeStart && rangeEnd)">
                  No trades for {{ rangeStart && rangeEnd ? `${rangeStart} – ${rangeEnd}` : filterDate }}
                </div>
                <div v-else>No trades match your filters</div>
              </td>
            </tr>
            <tr v-for="(t, i) in paginated" :key="t.id || i" @click="openDetail(t)" class="cursor-pointer">
              <td class="text-ink-faint font-mono text-2xs">{{ (page - 1) * perPage + i + 1 }}</td>
              <td class="font-mono font-semibold text-ink">{{ t.symbol }}</td>
              <td>
                <span class="badge-neutral" v-if="!t.side || t.side === 'long'">Long</span>
                <span class="badge-down" v-else>Short</span>
              </td>
              <td class="font-mono">{{ t.qty }}</td>
              <td class="font-mono text-xs text-ink-muted">{{ t.buy_price != null ? t.buy_price.toFixed(2) : '—' }}</td>
              <td class="font-mono text-xs text-ink-muted">{{ t.sell_price != null ? t.sell_price.toFixed(2) : '—' }}</td>
              <td class="font-mono font-semibold" :class="t.pnl >= 0 ? 'text-up' : 'text-down'">
                {{ fmt(t.pnl) }}
              </td>
              <td class="font-mono text-xs text-down">
                {{ t.fees ? '-' + fmt(t.fees) : '—' }}
              </td>
              <td>
                <span v-if="(t.gross_pnl ?? t.pnl) > 0" class="badge-up">Win</span>
                <span v-else-if="(t.gross_pnl ?? t.pnl) < 0" class="badge-down">Loss</span>
                <span v-else class="badge-neutral">Breakeven</span>
              </td>
              <td class="text-ink-faint text-xs whitespace-nowrap">{{ fmtDay(t.sold_at) }}</td>
              <td class="text-ink-faint text-xs whitespace-nowrap font-mono">
                {{ fmtTime(t.bought_at) }} <span class="text-ink-faint/50">→</span> {{ fmtTime(t.sold_at) }}
              </td>
              <td class="text-ink-faint text-xs">{{ t.duration || '—' }}</td>
              <td @click.stop>
                <TooltipWrap tip="Delete">
                  <button @click="confirmDelete(t)" class="p-1 rounded text-ink-faint hover:text-down transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                </TooltipWrap>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-ink">
        <span>{{ shown.length }} trades</span>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost btn-sm" :disabled="page === 1" @click="page--">←</button>
          <span class="px-2">{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="page >= totalPages" @click="page++">→</button>
        </div>
      </div>
    </div>

    <!-- Trade detail drawer -->
    <TradeDrawer v-if="selected" :trade="selected" @close="selected = null" />

    </template>

  </div>
</template>

<script setup>
import { useConfirm } from '@/composables/useConfirm'
const { confirm: $confirm } = useConfirm()
import { ref, computed, h, watch } from 'vue'
import { useTradesStore }   from '@/stores/trades'
import { useJournalStore }  from '@/stores/journal'
import { useBalanceStore }  from '@/stores/balance'
import { useCashEventsStore } from '@/stores/cashEvents'
import { useTimezoneStore } from '@/stores/timezone'
import { useToast }        from '@/composables/useToast'
import { fmt, fmtPct, computeStats } from '@/lib/stats'
import { format, parseISO } from 'date-fns'
import CsvImport         from '@/components/ui/CsvImport.vue'
import DatePickerCalendar from '@/components/ui/DatePickerCalendar.vue'
import TooltipWrap from '@/components/ui/TooltipWrap.vue'
import CompactValue from '@/components/ui/CompactValue.vue'
import TradeDrawer  from '@/components/logs/TradeDrawer.vue'
import Skeleton     from '@/components/ui/Skeleton.vue'

// Inline sort arrow micro-component
const SortArrow = {
  props: ['field', 'current', 'dir'],
  render() {
    if (this.field !== this.current) return null
    return h('span', { class: 'ml-0.5 text-ink-faint' }, this.dir === 'asc' ? '↑' : '↓')
  }
}

const tradesStore     = useTradesStore()
const journalStore    = useJournalStore()
const balanceStore    = useBalanceStore()
const cashEventsStore = useCashEventsStore()
const tzStore         = useTimezoneStore()
const toast = useToast()
const importer = ref(null)
const search      = ref('')
const filterDate  = ref('')
const rangeStart  = ref('')
const rangeEnd    = ref('')

const dayTrades = computed(() => {
  if (rangeStart.value && rangeEnd.value) {
    return tradesStore.filteredTrades.filter(t => {
      const d = t.sold_at?.slice(0, 10)
      return d && d >= rangeStart.value && d <= rangeEnd.value
    })
  }
  if (filterDate.value) {
    return tradesStore.filteredTrades.filter(t => t.sold_at?.slice(0, 10) === filterDate.value)
  }
  return []
})

async function confirmClearTrades() {
  const isFiltered = filterDate.value || (rangeStart.value && rangeEnd.value)
  const tradesToClear = isFiltered ? dayTrades.value : tradesStore.trades
  const count = tradesToClear.length

  let title, message
  if (!isFiltered) {
    title   = 'Delete All Trades'
    message = 'All your trades and fund transactions will be permanently deleted and cannot be restored.'
  } else if (rangeStart.value && rangeEnd.value) {
    title   = 'Delete Trades'
    message = `${count} trade${count !== 1 ? 's' : ''} from ${rangeStart.value} – ${rangeEnd.value} will be permanently deleted and cannot be restored.`
  } else {
    title   = 'Delete Trades'
    message = `${count} trade${count !== 1 ? 's' : ''} on ${filterDate.value} will be permanently deleted and cannot be restored.`
  }

  if (!await $confirm({ title, message, confirmLabel: 'Delete', danger: true })) return

  if (isFiltered) {
    // One batch delete instead of one deleteTrade() call per trade — a loop
    // here rewrites the whole trades array to localStorage on every single
    // iteration, which is the "modal won't close / page looks frozen" bug.
    await tradesStore.deleteTrades(tradesToClear.map(t => t.id))
    // Clear fund transactions within the same date range
    const start = rangeStart.value || filterDate.value
    const end   = rangeEnd.value   || filterDate.value
    balanceStore.setFundTransactions(
      balanceStore.fundTransactions.filter(t => t.date < start || t.date > end)
    )
    // Clear cash events within the same date range
    cashEventsStore.removeInRange(start, end + 'T23:59:59')
  } else {
    await tradesStore.clearAll()
    balanceStore.clearFundTransactions()
    cashEventsStore.clearAll()
    journalStore.clearWeeklyData()
  }

  filterDate.value = ''
  rangeStart.value = ''
  rangeEnd.value   = ''
  toast.success(`Cleared ${count} trade${count !== 1 ? 's' : ''}`)
}
const outcome  = ref('all')
const dragOver = ref(false)
const sortField = ref('sold_at')
const sortDir   = ref('desc')
const page      = ref(1)

watch([filterDate, rangeStart, rangeEnd], () => {
  page.value = 1
})
const perPage   = 15

const canDelete = computed(() => {
  const isFiltered = filterDate.value || (rangeStart.value && rangeEnd.value)
  return isFiltered ? dayTrades.value.length > 0 : tradesStore.trades.length > 0
})

const clearLabel = computed(() => {
  const isFiltered = filterDate.value || (rangeStart.value && rangeEnd.value)
  return isFiltered ? 'Delete Trades' : 'Delete All Trades'
})


const selected  = ref(null)

const filters = [
  { label: 'All',        val: 'all'  },
  { label: 'Wins',       val: 'win'  },
  { label: 'Breakeven',  val: 'breakeven' },
  { label: 'Losses',     val: 'loss' },
]

const shown = computed(() => {
  let list = tradesStore.filteredTrades
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(t => t.symbol?.toLowerCase().includes(q))
  }
  if (outcome.value === 'win')       list = list.filter(t => (t.gross_pnl ?? t.pnl) > 0)
  if (outcome.value === 'loss')      list = list.filter(t => (t.gross_pnl ?? t.pnl) < 0)
  if (outcome.value === 'breakeven') list = list.filter(t => (t.gross_pnl ?? t.pnl) === 0)

  // Date filter
  if (rangeStart.value && rangeEnd.value) {
    list = list.filter(t => {
      const d = t.sold_at?.slice(0, 10)
      return d && d >= rangeStart.value && d <= rangeEnd.value
    })
  } else if (filterDate.value) {
    list = list.filter(t => t.sold_at?.slice(0, 10) === filterDate.value)
  }

  list = [...list].sort((a, b) => {
    let av = a[sortField.value], bv = b[sortField.value]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir.value === 'asc' ? -1 : 1
    if (av > bv) return sortDir.value === 'asc' ? 1 : -1
    return 0
  })
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(shown.value.length / perPage)))
const paginated  = computed(() => shown.value.slice((page.value - 1) * perPage, page.value * perPage))

// Deleting the last trade(s) on the current page shrinks totalPages out from
// under `page` — without this, `paginated` silently slices past the end of
// the (now shorter) list and renders nothing, with no "no trades" message
// either (shown.length is still > 0), so the table looks frozen until
// something resets `page` back to 1, like a reload.
watch(totalPages, tp => { if (page.value > tp) page.value = tp })

const shownStats = computed(() => computeStats(shown.value))
const summaryMetrics = computed(() => {
  const s = shownStats.value
  const totalFees = shown.value.reduce((sum, t) => sum + (t.fees || 0), 0)
  return [
    { label: 'Trades',        val: String(s.total),   class: 'text-ink', tip: 'Number of trades in the current filter.' },
    { label: 'Win Rate',      val: fmtPct(s.winRate),  class: s.winRate >= 50 ? 'text-up' : 'text-down', tip: 'Percentage of trades with positive gross P&L (before fees).' },
    { label: 'Wins',          val: String(s.wins),    class: 'text-up', tip: 'Trades with positive gross P&L (before fees).' },
    { label: 'Breakeven',     val: String(s.breakeven), class: 'text-ink-muted', tip: 'Trades with exactly zero gross P&L (before fees).' },
    { label: 'Losses',        val: String(s.losses),  class: 'text-down', tip: 'Trades with negative gross P&L (before fees).' },
    { label: 'Total P&L',     raw: s.totalPnl,   class: s.totalPnl >= 0 ? 'text-up' : 'text-down', tip: 'Sum of net P&L (after fees) for all trades in the current filter.' },
    { label: 'Profit Factor', val: s.profitFactor === 999 ? '∞' : s.profitFactor.toFixed(2), class: s.profitFactor >= 1 ? 'text-up' : 'text-down', tip: 'Ratio of total profits to total losses.' },
    { label: 'Avg Win',       raw: s.avgWin,      class: 'text-up', tip: 'Average net P&L of winning trades.' },
    { label: 'Avg Loss',      raw: s.avgLoss,     class: 'text-down', tip: 'Average net P&L of losing trades.' },
    { label: 'Largest Win',   raw: s.largestGain, class: 'text-up', tip: 'Largest single winning trade by net P&L.' },
    { label: 'Largest Loss',  raw: s.largestLoss, class: 'text-down', tip: 'Largest single losing trade by net P&L.' },
    { label: 'Total Fees',    raw: totalFees > 0 ? -totalFees : 0, class: 'text-down', tip: 'Total commissions and exchange fees paid.' },
  ]
})

function sort(field) {
  if (sortField.value === field) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortField.value = field; sortDir.value = 'desc' }
  page.value = 1
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy HH:mm') } catch { return iso }
}

function fmtDay(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'MMM d, yyyy') } catch { return iso }
}

function fmtTime(iso) {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'HH:mm') } catch { return iso }
}

function onDrop(e) {
  dragOver.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (files.length) importer.value?.processFiles(files)
}

function openDetail(t) { selected.value = t }

async function confirmDelete(t) {
  if (!await $confirm({ title: 'Delete Trade', message: `${t.symbol} ${fmt(t.pnl)}`, confirmLabel: 'Delete', danger: true })) return
  await tradesStore.deleteTrade(t.id)
  toast.success('Trade deleted')
}


</script>
