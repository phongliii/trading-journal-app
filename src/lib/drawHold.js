import { ref } from 'vue'

// Holds chart drawing (lib/useChart.js) while fetches or saves that change
// several stores are still running — the sign-in load and a portfolio switch
// (App.vue), a background refresh (cloudSync), and an import, delete, restore
// or reset under the loading cover (useBusy). Without it a chart would redraw
// as each part landed; with it, it draws once, with the end result, when the
// last hold ends — whether the work succeeded or failed.
//
// A count, not a flag, so overlapping holds (a refresh during an import)
// release only when the last one ends.
const holds = ref(0)

export const drawsHeld = () => holds.value > 0

export async function holdDraws(fn) {
  holds.value++
  try {
    return await fn()
  } finally {
    holds.value--
  }
}
