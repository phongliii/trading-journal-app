<template>
  <canvas ref="canvas"></canvas>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { createExternalTooltip } from '@/lib/chartTooltip'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const props = defineProps({
  points:        { type: Array, required: true }, // [{ time: 'HH:mm', value }]
  cutoffIndex:   { type: Number, default: -1 },
  selectedIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['select'])

const canvas = ref(null)
let chart = null
const { handler: tooltipHandler, cleanup: tooltipCleanup } = createExternalTooltip()

function buildChart() {
  if (chart) chart.destroy()
  if (!canvas.value || !props.points.length) return

  const pointColors = props.points.map((_, i) => i <= props.cutoffIndex ? '#4ade80' : '#f87171')
  const pointRadii  = props.points.map((_, i) => i === props.selectedIndex ? 6 : 2)
  const pointBorder = props.points.map((_, i) => i === props.selectedIndex ? '#fff' : 'transparent')

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.points.map(p => p.time),
      datasets: [{
        data: props.points.map(p => p.value),
        borderColor: '#5a7a9a',
        borderWidth: 1.5,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointBorder,
        pointBorderWidth: 2,
        pointRadius: pointRadii,
        pointHoverRadius: 7,
        fill: false,
        tension: 0.15,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      onClick: (evt, elements) => {
        if (elements.length) emit('select', elements[0].index)
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: tooltipHandler,
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toFixed(2) },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5a7a9a', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { border: { display: false }, grid: { color: '#1e2d4225' }, ticks: { color: '#5a7a9a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) } },
      },
    },
  })
}

onMounted(buildChart)
watch(() => [props.points, props.cutoffIndex, props.selectedIndex], buildChart, { deep: true })
onBeforeUnmount(() => { chart?.destroy(); tooltipCleanup() })
</script>
