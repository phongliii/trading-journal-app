import { ref } from 'vue'

// Holds chart drawing (lib/useChart.js) while something changes several
// stores one after another — an import, delete, restore or reset under the
// loading cover (useBusy), or a background refresh reloading trades, balance
// and cash events side by side (cloudSync). Without it a chart would redraw
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
