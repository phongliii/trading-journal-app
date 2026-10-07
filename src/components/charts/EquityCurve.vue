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
import { format, parseISO, eachWeekOfInterval, eachMonthOfInterval,
         startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, getWeek } from 'date-fns'
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
  period: { type: Number, default: 30 },
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

// Last known value at or before `iso` in a [{date, value}] curve, or `fallback`.
function lastAtOrBefore(curveArr, iso, fallback) {
  const pts = curveArr.filter(p => p.date && p.date.slice(0, 10) <= iso)
  return pts.length ? pts[pts.length - 1].value : fallback
}

function buildChart() {
  if (!canvas.value) return
  if (chart) { chart.destroy(); chart = null }
  if (!props.curve.length) return

  const today = tzStore.localDateObj()
  let labels, isoDates

  if (props.period === 30) {
    // Daily — one point per day
    const start = subDays(today, 29)
    const days = []
    let d = new Date(start)
    while (d <= today) { days.push(new Date(d)); d.setDate(d.getDate() + 1) }

    labels   = days.map(d => format(d, 'MMM d'))
    isoDates = days.map(d => format(d, 'yyyy-MM-dd'))

  } else if (props.period === 0) {
    // All → monthly
    const firstDate = props.curve[0]?.date ? parseISO(props.curve[0].date) : subDays(today, 364)
    const months = eachMonthOfInterval({ start: startOfMonth(firstDate), end: today })
    labels   = months.map(m => format(m, 'MMM yy'))
    isoDates = months.map(m => format(endOfMonth(m) > today ? today : endOfMonth(m), 'yyyy-MM-dd'))

  } else {
    // 60d / 90d / 1Y → weekly
    const start = subDays(today, props.period - 1)
    const weekStarts = eachWeekOfInterval(
      { start: startOfWeek(start, { weekStartsOn: 0 }), end: today },
      { weekStartsOn: 0 }
    )
    labels   = weekStarts.map(ws => `W${getWeek(ws, { weekStartsOn: 0 })}`)
    isoDates = weekStarts.map(ws => {
      const we = endOfWeek(ws, { weekStartsOn: 0 })
      return format(we > today ? today : we, 'yyyy-MM-dd')
    })
  }

  let data = isoDates.map(iso => lastAtOrBefore(props.curve, iso, null))
  // Fill nulls forward
  let last = null
  data = data.map(v => { if (v !== null) last = v; return last ?? 0 })

  // Up/down (and thus the line color) is judged the same way Robinhood-style
  // charts do it: relative to the start of the selected range, not just
  // whether the raw number is above zero.
  const rangeStart = data[0] ?? 0
  const rangeEnd   = data[data.length - 1] ?? 0
  const isPos = (rangeEnd - rangeStart) >= 0
  const color = isPos ? '#00c896' : '#ef4444'

  // % shown alongside the $ amount in the tooltip: pure trading P&L against
  // the capital base at that point in time. Deposits/withdrawals shift the
  // base (fundBaseCurve) but never appear as a gain or loss in the P&L
  // (pnlCurve) itself — so a withdrawal alone never moves the %, only future
  // gains/losses measured against the smaller (or larger) base do.
  const canShowPct = props.hasBalance
  let pctData = null
  if (canShowPct) {
    let lastPnl = 0
    const pnlBucket = isoDates.map(iso => { const v = lastAtOrBefore(props.pnlCurve, iso, null); if (v !== null) lastPnl = v; return lastPnl })
    let lastBase = props.baseBalance
    const baseBucket = isoDates.map(iso => { const v = lastAtOrBefore(props.fundBaseCurve, iso, null); if (v !== null) lastBase = v; return lastBase })
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
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5a7a9a', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
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
watch(() => [props.curve, props.period, props.pnlCurve, props.fundBaseCurve, props.baseBalance, props.hasBalance], buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
