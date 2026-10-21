import { ref } from 'vue'

// App-wide "please wait" cover for long actions (imports, restores, resets,
// bulk deletes, switching portfolio) — shown by BusyOverlay.vue in App.vue.
// It blocks the page so nothing can be clicked half-way through a run of
// cloud saves, and always closes when the action ends, even if it throws.
//
//   const busy = useBusy()
//   await busy.run('Importing…', async step => {
//     step('Saving trades')   // advances "Step n of total"
//     ...
//   }, { total: 3 })
//
// The cover only appears once an action has run for SHOW_AFTER ms, so a
// quick one finishes without a flash. A run started inside another just
// runs (its steps are ignored) under the outer one's cover.
const SHOW_AFTER = 250

const state = ref({ visible: false, title: '', step: '', index: 0, total: 0 })
let active = false

// True for the whole of an action, cover shown or not. Charts (lib/useChart.js)
// hold their drawing while it's set, so the several saves an action makes
// don't each redraw them — they draw once, with the end result.
export const busyRunning = ref(false)

export function useBusy() {
  async function run(title, fn, { total = 0 } = {}) {
    if (active) return fn(() => {})
    active = true
    busyRunning.value = true
    state.value = { visible: false, title, step: '', index: 0, total }
    const timer = setTimeout(() => { state.value = { ...state.value, visible: true } }, SHOW_AFTER)
    const step = label => { state.value = { ...state.value, step: label, index: state.value.index + 1 } }
    try {
      return await fn(step)
    } finally {
      clearTimeout(timer)
      active = false
      busyRunning.value = false
      state.value = { ...state.value, visible: false }
    }
  }

  return { state, run }
}
