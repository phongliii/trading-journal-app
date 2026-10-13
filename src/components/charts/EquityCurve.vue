<template>
  <div class="relative h-full min-h-[160px]">
    <canvas ref="canvas"></canvas>
    <div v-if="!hasData" class="absolute inset-0 flex items-center justify-center text-ink-faint text-xs">
      No data yet — import trades to see your equity curve
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { format, parseISO, eachDayOfInterval, isWeekend, differenceInCalendarDays } from 'date-fns'
import { rangeStart } from '@/lib/realizedPnl'
import { createExternalTooltip } from '@/lib/chartTooltip'
import { useTimezoneStore } from '@/stores/timezone'

const tzStore = useTimezoneStore()

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

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
  // Trading P&L alone (never moved by deposits/withdrawals) and the
  // capital base (starting balance adjusted only by deposits/withdrawals,
  // never by trading P&L) — together these give a % that's pure trading
  // performance against whatever capital was actually at risk, regardless
  // of which curve above is being plotted.
  pnlCurve:     { type: Array,  default: () => [] },
  fundBaseCurve: { type: Array, default: () => [] },
  baseBalance:  { type: Number, default: 0 },
  hasBalance:   { type: Boolean, default: false },
})

const canvas  = ref(null)
let chart = null
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

function buildChart() {
  if (!canvas.value) return
  if (chart) { chart.destroy(); chart = null }
  if (!props.curve.length) return

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

  const labelStep = Math.max(1, Math.ceil(labels.length / 10))

  const data = valuesAt(props.curve, isoDates, 0)

  // Up/down (and thus the line color) is judged the same way Robinhood-style
  // charts do it: relative to the start of the selected range, not just
  // whether the raw number is above zero.
  const firstValue = data[0] ?? 0
  const lastValue  = data[data.length - 1] ?? 0
  const isPos = (lastValue - firstValue) >= 0
  const color = isPos ? '#00c896' : '#ef4444'

  // % shown alongside the $ amount in the tooltip: pure trading P&L against
  // the capital base at that point in time. Deposits/withdrawals shift the
  // base (fundBaseCurve) but never appear as a gain or loss in the P&L
  // (pnlCurve) itself — so a withdrawal alone never moves the %, only future
  // gains/losses measured against the smaller (or larger) base do.
  const canShowPct = props.hasBalance
  let pctData = null
  if (canShowPct) {
    const pnlBucket  = valuesAt(props.pnlCurve, isoDates, 0)
    const baseBucket = valuesAt(props.fundBaseCurve, isoDates, props.baseBalance)
    pctData = pnlBucket.map((pnl, i) => baseBucket[i] ? (pnl / baseBucket[i]) * 100 : null)
  }

  chart = new Chart(canvas.value, {
    type: 'line',
    plugins: [zeroLinePlugin],
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
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
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: {
            title: items => hoverTitles[items[0].dataIndex],
            label: ctx => {
              const dollar = ' $' + ctx.parsed.y.toFixed(2)
              const pct = pctData ? pctData[ctx.dataIndex] : null
              if (pct === null || pct === undefined) return dollar
              return dollar + '  (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)'
            }
          }
        }
      },
      scales: {
        // Show at most ~10 labels, counted back from the LAST point so the
        // newest date is always labelled (Chart.js's autoSkip counts from the
        // first point and often hid it).
        x: { grid: { display: false }, border: { display: false }, ticks: {
          color: '#5a7a9a', font: { size: 10 }, maxRotation: 0, autoSkip: false,
          callback: (_, i) => (labels.length - 1 - i) % labelStep === 0 ? labels[i] : '',
        } },
        y: {
          suggestedMin: 0,
          border: { display: false },
          grid: { color: '#1e2d4225' },
          ticks: { color: '#5a7a9a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) }
        }
      }
    }
  })
}

onMounted(buildChart)
watch(() => [props.curve, props.range, props.pnlCurve, props.fundBaseCurve, props.baseBalance, props.hasBalance], buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
