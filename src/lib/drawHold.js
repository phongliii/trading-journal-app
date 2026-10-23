import { ref } from 'vue'

// Holds chart drawing (lib/useChart.js) while fetches or saves that change
// several stores are still running. Without it a chart would redraw as each
// part landed; with it, it draws once, with the end result, when the last
// hold ends — whether the work succeeded or failed.
//
// Two strengths:
//  - holdDraws: nothing draws, not even a chart's first draw. For loads whose
//    data the charts don't have yet — sign-in and a portfolio switch (App.vue)
//    — and for imports, deletes, restores and resets (useBusy).
//  - holdRedraws: a chart already on screen waits, but a chart that has just
//    appeared draws straight away with the data already loaded. For the
//    background refresh (cloudSync) on opening a page or returning to the
//    tab: it almost always brings back the same data, so making a page's
//    charts wait for it only left them blank for a moment.
//
// Counts, not flags, so overlapping holds release only when the last ends.
const holds = ref(0)
const redrawHolds = ref(0)

export const drawsHeld = () => holds.value > 0
export const redrawsHeld = () => redrawHolds.value > 0

export async function holdDraws(fn) {
  holds.value++
  try {
    return await fn()
  } finally {
    holds.value--
  }
}

export async function holdRedraws(fn) {
  redrawHolds.value++
  try {
    return await fn()
  } finally {
    redrawHolds.value--
  }
}
