<template>
  <div class="relative h-full min-h-[160px]">
    <canvas ref="canvas"></canvas>
    <div v-if="!hasData" class="absolute inset-0 flex items-center justify-center text-ink-faint text-xs">
      No data yet — import trades to see your equity curve
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, computed } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { format, parseISO, eachDayOfInterval, isWeekend, isSameWeek, differenceInCalendarDays } from 'date-fns'
import { rangeStart } from '@/lib/realizedPnl'
import { fmt } from '@/lib/stats'
import { createExternalTooltip } from '@/lib/chartTooltip'
import { useChart } from '@/lib/useChart'
import { useTimezoneStore } from '@/stores/timezone'

const tzStore = useTimezoneStore()

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

// A day with both a deposit and a withdrawal gets a split dot: the point
// itself is drawn in the deposit colour, and this paints its right half in
// the withdrawal colour on top. Options: { indices: [dataIndex…], color }.
const splitDotPlugin = {
  id: 'splitFundDot',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.indices?.length) return
    const points = chart.getDatasetMeta(0).data
    const ctx = chart.ctx
    ctx.save()
    ctx.fillStyle = opts.color
    for (const i of opts.indices) {
      const pt = points[i]
      if (!pt || pt.skip) continue
      const r = (pt.options.radius || 0) + (pt.options.borderWidth || 0) / 2
      ctx.beginPath()
      ctx.moveTo(pt.x, pt.y)
      ctx.arc(pt.x, pt.y, r, -Math.PI / 2, Math.PI / 2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  },
}

const zeroLinePlugin = {
  id: 'zeroLine',
  afterDraw(chart) {
    const yScale = chart.scales.y
    if (!yScale) return
    const y = yScale.getPixelForValue(0)
    if (y < yScale.top || y > yScale.bottom) return
    const ctx = chart.ctx
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(chart.chartArea.left, y)
    ctx.lineTo(chart.chartArea.right, y)
    ctx.strokeStyle = '#7a92b0cc'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }
}

const props = defineProps({
  curve:  { type: Array,  default: () => [] }, // [{ date, value }] currently-plotted curve (equity or balance)
  range:  { type: String, default: '1M' }, // '1W' | '1M' | '3M' | 'YTD' | 'ALL' (see lib/realizedPnl.js)
  // Trading P&L within the range (from 0 at its start, never moved by
  // deposits/withdrawals) — drives the line colour and the hover %.
  pnlCurve:     { type: Array,  default: () => [] },
  // Money put in over time (starting balance + deposits − withdrawals) and
  // its value before the first deposit/withdrawal; the hover % is pnlCurve ÷
  // this at each point. baseCapital null = no starting balance, no %.
  capitalCurve: { type: Array,  default: () => [] },
  baseCapital:  { type: Number, default: null },
  // Deposits/withdrawals [{ date, amount }] to mark on the line — passed in
  // Balance mode, where they move the line without being trading results.
  fundTransactions: { type: Array, default: () => [] },
})

const canvas  = ref(null)
const { handler: tooltipHandler, cleanup: tooltipCleanup } = createExternalTooltip()
const hasData = computed(() => props.curve.length > 1)

// For each day in `isoDates` (ascending), the last value at or before that
// day in a date-sorted [{date, value}] curve, or `fallback` before its first
// point. One pass over both lists — the chart has a point per day now, so a
// per-day scan of the whole curve got slow on long ranges.
function valuesAt(curveArr, isoDates, fallback) {
  const pts = curveArr.filter(p => p.date)
  let i = 0, current = fallback
  return isoDates.map(iso => {
    while (i < pts.length && pts[i].date.slice(0, 10) <= iso) current = pts[i++].value
    return current
  })
}

// The chart's Chart.js config (drawn by useChart), or null for nothing to draw.
function makeConfig() {
  if (!props.curve.length) return null

  const today = tzStore.localDateObj()
  // One point per day on every tab, so hovering always shows a single day.
  // Saturdays/Sundays are skipped unless something is dated that day —
  // their value would just repeat Friday's.
  const firstDate = props.curve[0]?.date ? parseISO(props.curve[0].date) : null
  const start = rangeStart(props.range, today, firstDate)
  const dataDays = new Set(props.curve.map(p => p.date?.slice(0, 10)))
  const days = eachDayOfInterval({ start, end: today })
    .filter(d => !isWeekend(d) || dataDays.has(format(d, 'yyyy-MM-dd')))
  const multiYear = differenceInCalendarDays(today, start) > 365
  const labels      = days.map(d => format(d, multiYear ? 'MMM d, yy' : 'MMM d'))
  const hoverTitles = days.map(d => format(d, multiYear ? 'EEE, MMM d, yyyy' : 'EEE, MMM d'))
  const isoDates    = days.map(d => format(d, 'yyyy-MM-dd'))

  // Axis: label the first day of each week (normally its Monday), thinned
  // to at most ~10 labels on long ranges. Hover still shows every day.
  const weekFirsts = []
  days.forEach((d, i) => {
    if (i === 0 || !isSameWeek(d, days[i - 1], { weekStartsOn: 1 })) weekFirsts.push(i)
  })
  const weekStep = Math.max(1, Math.ceil(weekFirsts.length / 10))
  const axisLabelAt = new Set(weekFirsts.filter((_, k) => k % weekStep === 0))

  const data = valuesAt(props.curve, isoDates, 0)

  // Up/down (and thus the line color) is judged Robinhood-style — relative
  // to the start of the selected range — on TRADING P&L only (pnlCurve), so
  // a withdrawal can't turn the Balance line red, nor a deposit green.
  const pnlVals = valuesAt(props.pnlCurve, isoDates, 0)
  const isPos = ((pnlVals[pnlVals.length - 1] ?? 0) - (pnlVals[0] ?? 0)) >= 0
  const color = isPos ? '#00c896' : '#ef4444'

  // Deposits/withdrawals per day → a marker on the line plus a hover note,
  // so a withdrawal doesn't read as a losing day. Deposits and withdrawals
  // are kept apart (not netted), so a day with both shows both.
  // Account fees/credits (e.g. a "Dormant Fee") are listed on their own,
  // with the broker's name for them, and get a grey dot when they're the
  // only thing that day.
  const inByDay = {}, outByDay = {}, otherByDay = {}
  for (const f of props.fundTransactions) {
    if (!f.date) continue
    const day = f.date.slice(0, 10)
    if (f.type === 'fee' || f.type === 'credit') {
      (otherByDay[day] ||= []).push(f)
      continue
    }
    const byDay = f.amount >= 0 ? inByDay : outByDay
    byDay[day] = (byDay[day] || 0) + f.amount
  }
  const fundIn  = isoDates.map(iso => inByDay[iso] ?? null)
  const fundOut = isoDates.map(iso => outByDay[iso] ?? null)
  const other   = isoDates.map(iso => otherByDay[iso] ?? null)
  const FUND_IN = '#00c896', FUND_OUT = '#f59e0b', FEE = '#7a92b0'
  const markerColors = isoDates.map((_, i) => (fundIn[i] !== null ? FUND_IN : fundOut[i] !== null ? FUND_OUT : other[i] ? FEE : color))
  const splitDays = isoDates.flatMap((_, i) => (fundIn[i] !== null && fundOut[i] !== null ? [i] : []))

  // % in the tooltip: trading P&L ÷ money put in at that point. A withdrawal
  // lowers the money put in (so the same loss is a bigger %), a deposit
  // raises it — but neither is ever counted as P&L.
  let pctData = null
  if (props.baseCapital !== null) {
    const capital = valuesAt(props.capitalCurve, isoDates, props.baseCapital)
    pctData = pnlVals.map((pnl, i) => (capital[i] > 0 ? (pnl / capital[i]) * 100 : null))
  }

  return {
    type: 'line',
    plugins: [zeroLinePlugin, splitDotPlugin],
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: isoDates.map((_, i) => (fundIn[i] === null && fundOut[i] === null && !other[i] ? 0 : 4)),
        pointHoverRadius: 4,
        pointBackgroundColor: markerColors,
        pointBorderColor: markerColors,
        pointHoverBackgroundColor: markerColors,
        fill: true,
        backgroundColor: ctx => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height)
          g.addColorStop(0, color + '30')
          g.addColorStop(1, color + '00')
          return g
        },
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        splitFundDot: { indices: splitDays, color: FUND_OUT },
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: {
            title: items => hoverTitles[items[0].dataIndex],
            label: ctx => {
              const dollar = ' $' + ctx.parsed.y.toFixed(2)
              const pct = pctData ? pctData[ctx.dataIndex] : null
              const main = pct === null || pct === undefined
                ? dollar
                : dollar + '  (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)'
              const lines = [main]
              const dIn = fundIn[ctx.dataIndex], dOut = fundOut[ctx.dataIndex]
              if (dIn !== null)  lines.push('Deposit +' + fmt(dIn))
              if (dOut !== null) lines.push('Withdrawal -' + fmt(Math.abs(dOut)))
              for (const f of other[ctx.dataIndex] || []) {
                lines.push((f.label || (f.type === 'fee' ? 'Account fee' : 'Account credit')) + ' ' + (f.amount < 0 ? '-' : '+') + fmt(Math.abs(f.amount)))
              }
              return lines.length > 1 ? lines : main
            }
          }
        }
      },
      scales: {
        // Only the week-start days picked above (axisLabelAt) get a label.
        x: { grid: { display: false }, border: { display: false }, ticks: {
          color: '#5a7a9a', font: { size: 10 }, maxRotation: 0, autoSkip: false,
          callback: (_, i) => axisLabelAt.has(i) ? labels[i] : '',
        } },
        y: {
          suggestedMin: 0,
          border: { display: false },
          grid: { color: '#1e2d4225' },
          ticks: { color: '#5a7a9a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) }
        }
      }
    }
  }
}

useChart(canvas, () => [props.curve, props.range, props.pnlCurve, props.capitalCurve, props.baseCapital, props.fundTransactions], makeConfig)
onBeforeUnmount(tooltipCleanup)
</script>
