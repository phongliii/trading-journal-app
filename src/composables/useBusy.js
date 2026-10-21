import { ref } from 'vue'
import { holdDraws } from '@/lib/drawHold'

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

export function useBusy() {
  async function run(title, fn, { total = 0 } = {}) {
    if (active) return fn(() => {})
    active = true
    state.value = { visible: false, title, step: '', index: 0, total }
    const timer = setTimeout(() => { state.value = { ...state.value, visible: true } }, SHOW_AFTER)
    const step = label => { state.value = { ...state.value, step: label, index: state.value.index + 1 } }
    try {
      // Charts wait for the whole action (see lib/drawHold.js).
      return await holdDraws(() => fn(step))
    } finally {
      clearTimeout(timer)
      active = false
      state.value = { ...state.value, visible: false }
    }
  }

  return { state, run }
}
