import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

// No DOM here: run onMounted straight away, and count what reaches Chart.js.
vi.mock('vue', async orig => ({ ...(await orig()), onMounted: fn => fn(), onBeforeUnmount: () => {} }))
const draws = vi.hoisted(() => ({ created: 0, updated: 0 }))
vi.mock('chart.js', () => ({
  Chart: class {
    constructor(_canvas, config) { this.config = config; draws.created++ }
    update() { draws.updated++ }
    destroy() {}
  },
}))

const { useChart } = await import('../useChart.js')
const { useBusy } = await import('@/composables/useBusy.js')

let frames = []
globalThis.requestAnimationFrame = fn => frames.push(fn)
globalThis.cancelAnimationFrame = () => {}
const flush = async () => { await nextTick(); const f = frames; frames = []; f.forEach(fn => fn()) }

beforeEach(() => { draws.created = 0; draws.updated = 0; frames = [] })

describe('useChart', () => {
  it('draws once after a multi-step action, not after each step', async () => {
    const data = ref([1])
    useChart(ref({}), () => [data.value], () => ({ type: 'line', data: { values: data.value }, options: {} }))
    expect(draws.created).toBe(1)

    await useBusy().run('Importing…', async () => {
      data.value = [1, 2]; await flush()
      data.value = [1, 2, 3]; await flush()
      data.value = [1, 2, 3, 4]; await flush()
    })
    expect(draws.updated).toBe(0)
    await flush()
    expect(draws.updated).toBe(1)
  })

  it('still draws once when the action fails part-way', async () => {
    const data = ref([1])
    useChart(ref({}), () => [data.value], () => ({ type: 'line', data: {}, options: {} }))
    await expect(useBusy().run('Deleting…', async () => {
      data.value = [2]; await flush()
      throw new Error('boom')
    })).rejects.toThrow('boom')
    await flush()
    expect(draws.updated).toBe(1)
  })

  it('does not redraw after an action that changed nothing', async () => {
    const data = ref([1])
    useChart(ref({}), () => [data.value], () => ({ type: 'line', data: {}, options: {} }))
    await useBusy().run('Importing…', async () => { data.value = [1] })
    await flush()
    expect(draws.updated).toBe(0)
  })
})
