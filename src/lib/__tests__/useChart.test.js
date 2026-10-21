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
const { holdDraws } = await import('../drawHold.js')

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

  it('draws once after a background refresh of several stores', async () => {
    const trades = ref([1]); const balance = ref([1])
    useChart(ref({}), () => [trades.value, balance.value], () => ({ type: 'line', data: {}, options: {} }))
    await holdDraws(async () => {
      trades.value = [1, 2]; await flush()
      balance.value = [1, 2]; await flush()
    })
    await flush()
    expect(draws.updated).toBe(1)
  })

  it('waits for the last of overlapping holds', async () => {
    const data = ref([1])
    useChart(ref({}), () => [data.value], () => ({ type: 'line', data: {}, options: {} }))
    let endRefresh
    const refresh = holdDraws(() => new Promise(r => { endRefresh = r }))
    await useBusy().run('Importing…', async () => { data.value = [2] })
    await flush()
    expect(draws.updated).toBe(0)
    endRefresh(); await refresh; await flush()
    expect(draws.updated).toBe(1)
  })

  it('a chart opened during a fetch waits for it, then draws once', async () => {
    let endRefresh
    const data = ref([1])
    const refresh = holdDraws(() => new Promise(r => { endRefresh = r }))
    useChart(ref({}), () => [data.value], () => ({ type: 'line', data: {}, options: {} }))
    expect(draws.created).toBe(0)
    data.value = [1, 2]; await flush()
    expect(draws.created).toBe(0)
    endRefresh(); await refresh; await flush()
    expect(draws.created).toBe(1)
    expect(draws.updated).toBe(0)
  })
})
