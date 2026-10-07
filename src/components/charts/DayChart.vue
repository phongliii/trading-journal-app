<template>
  <div class="relative h-full">
    <canvas ref="canvas"></canvas>
    <div v-if="!trades.length" class="absolute inset-0 flex items-center justify-center text-ink-faint text-xs">
      No trades this day
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { format, parseISO } from 'date-fns'
import { createExternalTooltip } from '@/lib/chartTooltip'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const props = defineProps({
  trades: { type: Array, default: () => [] },
  mode:   { type: String, default: 'daily' } // 'daily' | 'weekly' | 'monthly'
})
const canvas = ref(null)
let chart = null
const { handler: tooltipHandler, cleanup: tooltipCleanup } = createExternalTooltip()

// Zero line plugin
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
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
}

function buildChart() {
  if (!canvas.value) return
  if (chart) { chart.destroy(); chart = null }
  if (!props.trades.length) return

  // Sort by close time
  const sorted = [...props.trades].sort((a, b) =>
    new Date(a.sold_at) - new Date(b.sold_at)
  )

  // Build cumulative net P&L starting from 0. Each point carries both a
  // short axis `label` and a `full` string for the tooltip title — for
  // monthly those deliberately differ (see below), everywhere else
  // they're the same text.
  let cumulative = 0
  const points = [{ label: 'Open', full: 'Open', value: 0 }]

  if (props.mode === 'weekly') {
    // Weekly: group by day, show end-of-day cumulative with date label
    const byDay = {}
    for (const t of sorted) {
      const day = format(parseISO(t.sold_at), 'MMM d')
      if (!byDay[day]) byDay[day] = 0
      byDay[day] += t.pnl
    }
    for (const [day, pnl] of Object.entries(byDay)) {
      cumulative += pnl
      points.push({ label: day, full: day, value: Math.round(cumulative * 100) / 100 })
    }
  } else if (props.mode === 'monthly') {
    // Monthly: one point per trade (not aggregated by day, like weekly
    // is) — but labeling each one by TIME alone made no sense once
    // trades span a whole month: the clock time jumps all over the
    // place from one trade to the next (8am, then 10am, then back to
    // 9am) with nothing on the axis showing which day it even was. The
    // axis label is the date instead; the tooltip title keeps both the
    // date and the time.
    for (const t of sorted) {
      cumulative += t.pnl
      const d = parseISO(t.sold_at)
      points.push({
        label: format(d, 'MMM d'),
        full: format(d, 'MMM d, HH:mm'),
        value: Math.round(cumulative * 100) / 100
      })
    }
  } else {
    // Daily: one point per trade with time label
    for (const t of sorted) {
      cumulative += t.pnl
      const time = format(parseISO(t.sold_at), 'HH:mm')
      points.push({ label: time, full: time, value: Math.round(cumulative * 100) / 100 })
    }
  }

  const labels = points.map(p => p.label)
  const fulls  = points.map(p => p.full)
  const data   = points.map(p => p.value)
  const isPos  = data[data.length - 1] >= 0
  const color  = isPos ? '#00c896' : '#ef4444'

  chart = new Chart(canvas.value, {
    type: 'line',
    plugins: [zeroLinePlugin],
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        pointRadius: pts => pts.dataIndex === 0 || pts.dataIndex === data.length - 1 ? 3 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
        fill: true,
        backgroundColor: ctx => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height)
          g.addColorStop(0, color + '30')
          g.addColorStop(1, color + '00')
          return g
        },
        tension: 0.3,
        stepped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: {
            // Title defaults to the x-axis tick label (date-only in
            // monthly mode) — override it with the full date+time string
            // instead, so the tooltip itself always spells out exactly
            // when a trade closed, even though the axis stays uncluttered.
            title: items => fulls[items[0].dataIndex],
            label: ctx => ' $' + ctx.parsed.y.toFixed(2),
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#5a7a9a',
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            callback: function(val, index) {
              return labels[index]
            }
          }
        },
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
watch(() => props.trades, buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
