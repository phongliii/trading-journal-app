<template>
  <canvas ref="canvas"></canvas>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, ScatterController, PointElement, LinearScale, Tooltip } from 'chart.js'
import { createExternalTooltip } from '@/lib/chartTooltip'

Chart.register(ScatterController, PointElement, LinearScale, Tooltip)

const props = defineProps({
  trades:      { type: Array, required: true },
  cutoffIndex: { type: Number, default: -1 },
})

const canvas = ref(null)
let chart = null
const { handler: tooltipHandler, cleanup: tooltipCleanup } = createExternalTooltip()

function buildChart() {
  if (chart) chart.destroy()
  if (!canvas.value || !props.trades.length) return

  const points = props.trades.map((t, i) => ({ x: i, y: t.pnl }))
  const colors = props.trades.map(t => t.pnl >= 0 ? '#4ade80' : '#f87171')

  chart = new Chart(canvas.value, {
    type: 'scatter',
    data: {
      datasets: [{
        data: points,
        backgroundColor: colors,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: {
            title: ctx => `Trade #${ctx[0].parsed.x + 1}`,
            label: ctx => ' $' + ctx.parsed.y.toFixed(2),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
        y: { border: { display: false }, grid: { color: '#1e2d4225' }, ticks: { color: '#5a7a9a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) } },
      },
    },
  })
}

onMounted(buildChart)
watch(() => [props.trades, props.cutoffIndex], buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
