<template>
  <div class="p-6 space-y-5 w-full min-w-[1000px]">

    <!-- Skeleton: shown only on the initial load, before we know whether
         there's any data yet — avoids a flash of the zeroed-out stat cards
         / empty charts before real numbers (or the "No trades yet" empty
         state) land. Waits on trades AND balance AND cashEvents (see
         initialLoading) so it doesn't come down until every store this
         page reads from is actually ready. -->
    <div v-if="initialLoading" class="space-y-5">
      <Skeleton class="h-24 !rounded-xl" />
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Skeleton v-for="i in 5" :key="i" class="h-20 !rounded-xl" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton class="h-56 !rounded-xl" />
        <Skeleton class="h-56 !rounded-xl" />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton class="h-72 !rounded-xl" />
        <Skeleton class="h-72 !rounded-xl" />
      </div>
    </div>

    <template v-else>

    <!-- Weekly calendar -->
    <section>
      <CalendarStrip :trades="tradesStore.trades" />
    </section>

    <!-- Stat cards -->
    <section class="grid gap-3" :class="balanceStore.hasBalance ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'">
      <StatCard
        v-if="balanceStore.hasBalance"
        label="Account Balance"
        :raw-value="balanceStore.currentBalance ?? 0"
        :value-class="(balanceStore.currentBalance ?? 0) >= 0 ? 'text-up' : 'text-down'" />

      <StatCard label="Trades"
        :value="String(stats.total)"
        value-class="text-ink"
        tooltip="Number of trades closed in this period." />

      <StatCard label="Win Rate"
        :value="fmtPct(stats.winRate)"
        :value-class="stats.winRate >= 50 ? 'text-up' : 'text-down'"
        tooltip="Percentage of trades with positive gross P&L (before fees)." />

      <StatCard
        :raw-value="pnlMode === 'gross' ? totalGrossPnl : stats.totalPnl"
        :value-class="(pnlMode === 'gross' ? totalGrossPnl : stats.totalPnl) >= 0 ? 'text-up' : 'text-down'"
        :tooltip="pnlMode === 'gross' ? 'Total profit or loss before fees and commissions.' : 'Total profit or loss after fees and commissions.'">
        <template #label>
          <PnlModeTabs v-model="pnlMode" />
        </template>
      </StatCard>

      <StatCard label="Profit Factor"
        :value="stats.profitFactor === 999 ? '∞' : stats.profitFactor.toFixed(2)"
        :value-class="stats.profitFactor >= 1 ? 'text-up' : 'text-down'"
        tooltip="Ratio of total profits to total losses." />

      <StatCard label="Max Drawdown"
        :raw-value="periodDrawdown.maxDrawdown"
        value-class="text-down"
        tooltip="Maximum peak-to-trough equity decline, computed from realized cash flow including fees at time of charge." />
    </section>

    <!-- Daily P&L + Equity Curve -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <DashboardCard title="Realized P&L" info-next tooltip="Net P&L (after fees) from closed trades, for the selected range. Bars are days for 1W and 1M, weeks for 3M and YTD, and months for ALL once you have more than a year of history. Independent of the period selected above.">
        <template #actions>
          <RangeTabs v-model="realizedRange" :options="REALIZED_RANGES" storage-key="edgelog:realizedRange" />
        </template>
        <p class="font-mono text-xs mb-2" :class="realized.total > 0 ? 'text-up' : realized.total < 0 ? 'text-down' : 'text-ink-muted'">
          {{ realized.total > 0 ? '+' : '' }}{{ fmt(realized.total) }}
        </p>
        <div class="h-40">
          <DailyBarChart :labels="realized.labels" :values="realized.values" :titles="realized.titles" />
        </div>
      </DashboardCard>

      <DashboardCard :tooltip="equityMode === 'balance' ? 'Account balance over time, including deposits and withdrawals.' : 'Cumulative net P&L (after fees) over time for the selected period.'">
        <template #header>
          <EquityModeTabs v-model="equityMode" :disabled="!balanceStore.hasBalance" />
        </template>
        <div class="h-44">
          <EquityCurve
            :curve="equityMode === 'balance' ? balanceCurve : stats.equityCurve"
            :period="tradesStore.period"
            :pnl-curve="stats.equityCurve"
            :fund-base-curve="fundBaseCurve"
            :base-balance="balanceStore.correctStarting"
            :has-balance="balanceStore.hasBalance" />
        </div>
      </DashboardCard>
    </section>

    <!-- Performance by Month | DOW + Avg Win/Loss + Total Fees -->
    <section ref="perfSection" class="relative grid grid-cols-1 lg:grid-cols-2 gap-5">

      <svg v-if="connectorPath" :width="sectionSize.width" :height="sectionSize.height"
        class="absolute inset-0 pointer-events-none hidden lg:block" style="overflow: visible;">
        <path :d="connectorPath" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" class="text-border-strong" />
      </svg>

      <!-- Left: Performance by Month (full height) -->
      <div ref="monthColEl" class="h-full flex flex-col">
        <div class="flex items-center gap-2 mb-2 h-3">
          <span class="text-2xs font-medium text-ink-faint uppercase tracking-wide">Performance</span>
          <div ref="monthDividerBar" class="flex-1 h-px bg-border-strong"></div>
        </div>
        <DashboardCard title="Performance by Month" info-next tooltip="Net P&L (after fees) and win rate for each calendar month." class="flex-1">
          <template #actions>
            <div class="w-[110px]"><Dropdown :model-value="monthPeriodOption" @update:model-value="onMonthPeriodPicked" :options="MONTH_PERIOD_OPTIONS" :year-options="monthAvailableYears" :highlight-year="monthEffectiveYear" full-width /></div>
          </template>
          <BarList :items="monthPerfScoped" clickable :active-index="dowMonthSync ? dowMonthSync.monthIndex : null" @select="(item, index) => selectMonthForDow(item, index)" />
        </DashboardCard>
      </div>

      <!-- Right: stacked -->
      <div class="flex flex-col gap-5">

        <!-- Avg Win/Loss | Largest Win/Loss | Total Fees -->
        <div class="grid grid-cols-3 gap-5">

          <DashboardCard title="Avg Win / Loss" tooltip="Ratio of average winning trade to average losing trade.">
            <SplitBarStat :win="stats.avgWin" :loss="stats.avgLoss" :ratio="winLossRatio" />
          </DashboardCard>

          <DashboardCard title="Largest Win / Loss" tooltip="Best and worst single trade ever.">
            <SplitBarStat :win="allTimeStats.largestGain" :loss="allTimeStats.largestLoss" />
          </DashboardCard>

          <DashboardCard title="Total Fees" tooltip="Total commissions and exchange fees paid.">
            <div class="text-2xl font-bold font-mono text-down truncate min-w-0">
              <template v-if="tradesStore.totalFees > 0">-<CompactValue :value="tradesStore.totalFees" /></template>
              <template v-else>$0.00</template>
            </div>
          </DashboardCard>

        </div>

        <!-- Performance by Day of Week -->
        <div ref="dowColEl" class="flex-1 flex flex-col">
          <div class="flex items-center gap-2 mb-2 h-3">
            <span class="text-2xs font-medium text-ink-faint uppercase tracking-wide">Performance</span>
            <div ref="dowDividerBar" class="flex-1 h-px bg-border-strong"></div>
          </div>
          <DashboardCard title="Performance by Day of Week" info-next tooltip="Net P&L (after fees) and win rate grouped by weekday, across all trades." class="flex-1">
            <template #actions>
              <div class="w-[110px]"><Dropdown :model-value="dowPeriodOption" @update:model-value="onDowPeriodPicked" :options="dowOptionsForDropdown" :override-label="dowMonthSync ? dowMonthSync.label : ''" :force-no-active="!!dowMonthSync" full-width /></div>
            </template>
            <BarList :items="dowPerfScoped" />
          </DashboardCard>
        </div>

      </div>

    </section>

    <!-- Empty state -->
    <section v-if="stats.total === 0"
      class="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl">
      <div class="w-14 h-14 rounded-2xl bg-surface-3 border border-border flex items-center justify-center mb-4">
        <svg class="w-7 h-7 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2z"/>
        </svg>
      </div>
      <h3 class="text-sm font-semibold text-ink mb-1">No trades yet</h3>
      <p class="text-xs text-ink-muted max-w-xs">Import a CSV file from your broker to start analyzing your performance.</p>
      <CsvImport ref="importer">
        <template #default="{ trigger }">
          <button class="btn btn-primary mt-4" @click="trigger">Import trades</button>
        </template>
      </CsvImport>
    </section>

    </template>

  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useTradesStore } from '@/stores/trades'
import { useBalanceStore } from '@/stores/balance'
import { useCashEventsStore } from '@/stores/cashEvents'
import { useTimezoneStore } from '@/stores/timezone'
import { format } from 'date-fns'
import { fmt, fmtPct, computeStats, computeDrawdownFromEvents, computeBalanceCurve, computeFundBaseCurve, groupByMonth, groupByDow, resolvePeriodRange, filterTradesByDateRange, filterTradesByMonth } from '@/lib/stats'
import StatCard      from '@/components/ui/StatCard.vue'
import PnlModeTabs   from '@/components/ui/PnlModeTabs.vue'
import EquityModeTabs from '@/components/ui/EquityModeTabs.vue'
import CompactValue  from '@/components/ui/CompactValue.vue'
import BarList       from '@/components/ui/BarList.vue'
import EquityCurve   from '@/components/charts/EquityCurve.vue'
import DailyBarChart from '@/components/charts/DailyBarChart.vue'
import RangeTabs from '@/components/ui/RangeTabs.vue'
import { buildRealizedBuckets, REALIZED_RANGES } from '@/lib/realizedPnl'
import CalendarStrip from '@/components/calendar/CalendarStrip.vue'
import CsvImport     from '@/components/ui/CsvImport.vue'
import DashboardCard from '@/components/ui/DashboardCard.vue'
import SplitBarStat  from '@/components/ui/SplitBarStat.vue'
import Dropdown       from '@/components/ui/Dropdown.vue'
import Skeleton       from '@/components/ui/Skeleton.vue'

const tradesStore     = useTradesStore()
const balanceStore    = useBalanceStore()
const cashEventsStore = useCashEventsStore()
const tzStore         = useTimezoneStore()
const stats           = computed(() => tradesStore.stats)
const pnlMode         = ref('gross')
const equityMode      = ref('equity')

// Realized P&L card: its own range tabs (independent of the dashboard-wide
// period), computed from ALL trades so ranges longer than that period work.
const realizedRange = ref('1M')
const realizedBars = computed(() => {
  const byDay = {}
  for (const t of tradesStore.trades) {
    if (!t.sold_at) continue
    const k = format(new Date(t.sold_at), 'yyyy-MM-dd') // same day-bucketing as stats.dailyBars
    byDay[k] = (byDay[k] || 0) + t.pnl
  }
  return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, pnl]) => ({ date, pnl }))
})
const realized = computed(() => buildRealizedBuckets(realizedBars.value, realizedRange.value, tzStore.localDateObj()))

// Drives the skeleton below — true until trades, balance AND cashEvents
// have ALL loaded at least once, not just trades. This used to gate on
// tradesStore alone: trades usually resolves first, so the skeleton came
// down and the real page rendered, but currentBalance/the equity curve/
// drawdown (all driven by balanceStore and cashEventsStore) were still
// using their empty initial state at that moment — then popped to the
// real numbers a beat later once those two finished. Waiting for every
// store the page actually reads from closes that gap.
const initialLoading = computed(() =>
  tradesStore.trades.length === 0 && (tradesStore.loading || !balanceStore.loaded || !cashEventsStore.loaded)
)

// Capital base (starting balance adjusted only by deposits/withdrawals, never
// by trading P&L) — full history, so the running base at any date stays
// accurate regardless of the selected period.
const fundBaseCurve = computed(() => {
  if (!balanceStore.hasBalance) return []
  return computeFundBaseCurve(balanceStore.fundTransactions, balanceStore.correctStarting)
})

const balanceCurve = computed(() => {
  if (!balanceStore.hasBalance) return []
  // Build the full curve from ALL history so cumulative values stay accurate,
  // then slice to the selected period — matching how filteredTrades works.
  const full = computeBalanceCurve(tradesStore.trades, balanceStore.fundTransactions, balanceStore.correctStarting)
  if (tradesStore.period === 0) return full
  const cutoff = subDaysISO(tradesStore.period)
  return full.filter(p => p.date.slice(0, 10) >= cutoff)
})
const allTimeStats    = computed(() => computeStats(tradesStore.trades))
const totalGrossPnl = computed(() =>
  Math.round(tradesStore.filteredTrades.reduce((s, t) => s + (t.gross_pnl ?? t.pnl), 0) * 100) / 100
)

// Max Drawdown / Peak Equity using raw chronological cash events, filtered by period
const periodDrawdown = computed(() => {
  const period = tradesStore.period
  const from = period === 0 ? null : subDaysISO(period)
  return computeDrawdownFromEvents(cashEventsStore.events, from, null)
})

// `.toISOString()` reports the UTC date, which is wrong once you're west of
// UTC in the evening (same bug fixed on the Export page) — subtract days
// from the app's own timezone-aware "today" instead of the raw browser Date.
// `localDateObj()` already represents that calendar day as local fields, so
// day math + a plain field readout (not another Intl/timezone pass) keeps it
// from getting shifted a second time.
function subDaysISO(days) {
  const d = tzStore.localDateObj()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const winLossRatio = computed(() => {
  if (!stats.value.avgLoss || !stats.value.avgWin) return '—'
  return (Math.abs(stats.value.avgWin) / Math.abs(stats.value.avgLoss)).toFixed(2)
})

// Performance by Month / Performance by Day of Week each get their own
// period control, independent of the dashboard's global 30d/60d/90d/1Y/All
// selector — groupByMonth()/groupByDow() bucket purely by month-of-year or
// day-of-week with no year discrimination, so feeding them a period that
// spans multiple years silently merges e.g. every January together. A
// rolling/calendar-scoped window sidesteps that instead of requiring a
// year picker.
const MONTH_PERIOD_OPTIONS = [
  { value: 'thisYear', label: 'This year' },
  { value: 'lastYear',  label: 'Last year' },
  { value: 'all',       label: 'All' },
]
const DOW_PERIOD_OPTIONS = [
  { value: 'thisMonth',   label: 'This month' },
  { value: 'lastMonth',   label: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'lastQuarter', label: 'Last quarter' },
  { value: 'all',         label: 'All' },
]
// Persisted like tradesStore's own 30d/60d/90d period (stores/trades.js) —
// otherwise these two reset to their defaults on every reload, losing
// whatever Performance window you'd set up. The month-click sync
// (dowMonthSync, below) is deliberately NOT persisted — it's a one-off
// "show me that month's weekdays" action, not a standing preference.
const MONTH_PERIOD_KEY = 'edgelog:dashboardMonthPeriod'
const DOW_PERIOD_KEY   = 'edgelog:dashboardDowPeriod'

const monthPeriodOption = ref(localStorage.getItem(MONTH_PERIOD_KEY) || 'thisYear')
const dowPeriodOption   = ref(localStorage.getItem(DOW_PERIOD_KEY) || 'thisMonth')

watch(monthPeriodOption, v => localStorage.setItem(MONTH_PERIOD_KEY, v))
watch(dowPeriodOption,   v => localStorage.setItem(DOW_PERIOD_KEY, v))

const monthPerfScoped = computed(() => {
  const { from, to } = resolvePeriodRange(monthPeriodOption.value, tzStore.localDateObj())
  return groupByMonth(filterTradesByDateRange(tradesStore.trades, from, to))
})

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Clicking a month in the Month card syncs the Day of Week card to just
// that month's trades (overriding its own dropdown selection). Manually
// picking an option from the Day of Week dropdown clears the sync (see the
// watcher below).
const dowMonthSync = ref(null) // { monthIndex, year: number|null, label } | null

function selectMonthForDow(item, index) {
  let year = null
  const opt = monthPeriodOption.value
  if (opt === 'thisYear') year = tzStore.localDateObj().getFullYear()
  else if (opt === 'lastYear') year = tzStore.localDateObj().getFullYear() - 1
  else if (opt.startsWith('year:')) year = parseInt(opt.slice('year:'.length), 10)
  // 'all' -> year stays null, meaning "this month across every year"
  dowMonthSync.value = {
    monthIndex: index,
    year,
    label: year ? `${MONTH_SHORT[index]} ${year}` : MONTH_SHORT[index],
  }
}
// Explicit handlers rather than v-model + a watch(): a watch only fires
// when the value actually changes, so picking an option that happens to
// match the ref's current value (e.g. clicking "This month" while
// dowPeriodOption is still its default 'thisMonth') would silently fail to
// clear the sync. These run on every pick, changed or not.
function onMonthPeriodPicked(value) {
  monthPeriodOption.value = value
  dowMonthSync.value = null
}
function onDowPeriodPicked(value) {
  dowPeriodOption.value = value
  dowMonthSync.value = null
}

// While synced to a month clicked from the Month card, hide whichever
// rolling option would resolve to that exact same month — e.g. clicking
// September (the real current month) hides "This month"; clicking August
// hides "Last month" — since it'd be a redundant duplicate of what's
// already showing. Only hides the one that actually matches; other months
// clicked (say, March) leave both "This month" and "Last month" visible.
const dowOptionsForDropdown = computed(() => {
  if (!dowMonthSync.value) return DOW_PERIOD_OPTIONS
  const { monthIndex, year } = dowMonthSync.value
  const today = tzStore.localDateObj()
  const thisMonthMatch = year === today.getFullYear() && monthIndex === today.getMonth()
  let lastMonthMatch = false
  if (!thisMonthMatch) {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    lastMonthMatch = year === d.getFullYear() && monthIndex === d.getMonth()
  }
  return DOW_PERIOD_OPTIONS.filter(o => {
    if (thisMonthMatch && o.value === 'thisMonth') return false
    if (lastMonthMatch && o.value === 'lastMonth') return false
    return true
  })
})

const dowPerfScoped = computed(() => {
  if (dowMonthSync.value) {
    const { monthIndex, year } = dowMonthSync.value
    return groupByDow(filterTradesByMonth(tradesStore.trades, monthIndex, year))
  }
  const { from, to } = resolvePeriodRange(dowPeriodOption.value, tzStore.localDateObj())
  return groupByDow(filterTradesByDateRange(tradesStore.trades, from, to))
})

// Which year the Month card's period selector currently resolves to, so
// the "Pick a year" modal can highlight it even when it got there via
// "This year"/"Last year" rather than an explicit year pick. null for 'all'
// (no single year to highlight).
const monthEffectiveYear = computed(() => {
  const opt = monthPeriodOption.value
  const today = tzStore.localDateObj()
  if (opt === 'thisYear') return today.getFullYear()
  if (opt === 'lastYear') return today.getFullYear() - 1
  if (opt.startsWith('year:')) return parseInt(opt.slice('year:'.length), 10)
  return null
})

// Years for the Month card's "Pick a year" modal: every year that has
// trade data, plus the current year even if it has none yet (so you can
// always jump to "this year" as soon as it starts).
const monthAvailableYears = computed(() => {
  const years = new Set([tzStore.localDateObj().getFullYear()])
  for (const t of tradesStore.trades) {
    if (!t.sold_at) continue
    // sold_at may be an ISO string, a Date, or something else depending on
    // where the trade came from — go through Date() rather than string
    // slicing so an unexpected shape here can't silently break the whole
    // "Pick a year" list (a thrown error in a computed renders nothing).
    const d = new Date(t.sold_at)
    if (!Number.isNaN(d.getTime())) years.add(d.getFullYear())
  }
  return [...years].sort((a, b) => a - b)
})

// Connects the two Performance cards' divider lines with a thin line that
// bends from the Month card's divider down into the Day of Week card's
// column. Measured against the real rendered DOM (not hardcoded pixel
// guesses) so it stays correct across window sizes and content changes;
// skipped below the lg breakpoint where the grid stacks to one column and
// the two cards are no longer side by side.
const perfSection     = ref(null)
const monthColEl      = ref(null)
const dowColEl         = ref(null)
const monthDividerBar = ref(null)
const dowDividerBar   = ref(null)
const connectorPath   = ref('')
const sectionSize     = ref({ width: 0, height: 0 })

function updateConnector() {
  const section  = perfSection.value
  const monthCol = monthColEl.value
  const dowCol   = dowColEl.value
  const monthBar = monthDividerBar.value
  const dowBar   = dowDividerBar.value
  if (!section || !monthCol || !dowCol || !monthBar || !dowBar || window.innerWidth < 1024) {
    connectorPath.value = ''
    return
  }

  const sectionRect = section.getBoundingClientRect()
  sectionSize.value = { width: sectionRect.width, height: sectionRect.height }

  const xTop    = monthCol.getBoundingClientRect().right - sectionRect.left
  const xBottom = dowCol.getBoundingClientRect().left - sectionRect.left
  const x       = Math.round((xTop + xBottom) / 2)
  const monthBarRect = monthBar.getBoundingClientRect()
  const dowBarRect   = dowBar.getBoundingClientRect()
  const yTop        = Math.round(monthBarRect.top + monthBarRect.height / 2 - sectionRect.top)
  const yBottomFull  = Math.round(dowBarRect.top + dowBarRect.height / 2 - sectionRect.top)
  const r = 12 // matches DashboardCard's rounded-xl corner radius
  // Stop short of the second divider rather than merging into it — the
  // floor must clear the curve's own height (r) or the straight segment
  // below it would run backwards.
  const yBottom = Math.max(yTop + r + 6, yBottomFull - 12)

  // Start the stroke a couple pixels into the divider bar rather than
  // exactly at its measured edge — getBoundingClientRect() is fractional
  // and rounding it can leave a hairline gap between the CSS-rendered bar
  // and the SVG stroke at some zoom levels. Overlapping guarantees they
  // always visually meet.
  connectorPath.value = `M ${Math.round(xTop) - 2} ${yTop} H ${x - r} Q ${x} ${yTop} ${x} ${yTop + r} V ${yBottom}`
}

let perfResizeObserver
onMounted(async () => {
  await nextTick()
  updateConnector()
  window.addEventListener('resize', updateConnector)
  perfResizeObserver = new ResizeObserver(updateConnector)
  if (perfSection.value) perfResizeObserver.observe(perfSection.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateConnector)
  perfResizeObserver?.disconnect()
})
watch([monthPerfScoped, dowPerfScoped], () => nextTick(updateConnector))
</script>
