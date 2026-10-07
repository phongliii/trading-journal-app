<template>
  <div class="relative h-full min-h-[120px]">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, BarController, BarElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'
import { createExternalTooltip } from '@/lib/chartTooltip'

Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip)

// Plugin to always draw a highlighted line at y=0
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
  labels: { type: Array, default: () => [] },  // x-axis labels, one per bar
  values: { type: Array, default: () => [] },  // P&L per bar
  titles: { type: Array, default: () => [] },  // tooltip headings (falls back to labels)
})

const canvas = ref(null)
let chart = null
const { handler: tooltipHandler, cleanup: tooltipCleanup } = createExternalTooltip()

function buildChart() {
  if (!canvas.value) return
  if (chart) { chart.destroy(); chart = null }

  const labels = props.labels
  const data = props.values

  const colors  = data.map(v => v > 0 ? '#00c896bb' : v < 0 ? '#ef4444bb' : '#3d547040')
  const borders = data.map(v => v > 0 ? '#00c896'   : v < 0 ? '#ef4444'   : '#3d5470')

  chart = new Chart(canvas.value, {
    type: 'bar',
    plugins: [zeroLinePlugin],
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: borders, borderWidth: 1, borderRadius: 3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: {
            title: items => [props.titles[items[0].dataIndex] ?? items[0].label],
            label: ctx => ' $' + ctx.parsed.y.toFixed(2),
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5a7a9a', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 14 } },
        y: {
          suggestedMin: 0,
          border: { display: false },
          grid: { color: '#1e2d4225' },
          ticks: { color: '#5a7a9a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) },
        }
      }
    }
  })
}

onMounted(buildChart)
watch(() => [props.labels, props.values, props.titles], buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
