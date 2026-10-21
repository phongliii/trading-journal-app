// Shared drawing for every Chart.js chart, so a chart redraws only when what
// it shows actually changes — however (and however often) its data arrives:
//
//   1. Same values → nothing happens. A store reload, a tab-focus refresh or
//      an import can hand a chart new-but-equal arrays; they're compared by
//      value (JSON), not by reference.
//   2. Several changes in quick succession → one draw, on the next frame.
//   3. A real change → the existing chart is updated in place instead of
//      destroyed and rebuilt, so it doesn't flash or replay its grow-in
//      animation.
//   4. While several stores change one after another (an import, delete,
//      restore, reset or portfolio switch under the loading cover, or a
//      background refresh) → no drawing at all; the chart draws once when
//      that ends, with the final data. See lib/drawHold.js.
//
// Usage (in a chart component's <script setup>):
//   useChart(canvas, () => [props.a, props.b], makeConfig)
// where makeConfig() returns a Chart.js config, or null when there's nothing
// to draw, and reads only what the inputs getter returns (plus constants).
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { Chart } from 'chart.js'
import { drawsHeld } from '@/lib/drawHold'

export function useChart(canvas, inputs, makeConfig) {
  let chart = null
  let drawnKey = null
  let frame = 0

  const keyOf = () => JSON.stringify(inputs())

  function draw() {
    frame = 0
    if (!canvas.value) return
    // Held: wait for the end result. A chart's first draw still goes ahead,
    // so a page opened mid-refresh shows what's already loaded, not a blank.
    if (drawnKey !== null && drawsHeld()) return
    const key = keyOf()
    if (key === drawnKey) return
    drawnKey = key

    const config = makeConfig()
    if (!config) { chart?.destroy(); chart = null; return }
    if (chart && chart.config.type === config.type) {
      chart.data = config.data
      chart.options = config.options
      chart.update()
    } else {
      chart?.destroy()
      chart = new Chart(canvas.value, config)
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw)
  }

  onMounted(draw)
  // Watching the key (a string) means the watcher only fires when the
  // values change, not whenever an equal array is swapped in.
  watch(keyOf, schedule)
  watch(drawsHeld, held => { if (!held) schedule() })
  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame)
    chart?.destroy()
    chart = null
  })
}
