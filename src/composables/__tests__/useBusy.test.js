import { describe, it, expect, vi, afterEach } from 'vitest'
import { useBusy } from '../useBusy.js'

afterEach(() => vi.useRealTimers())

describe('useBusy', () => {
  it('shows only after 250ms, tracks steps, and closes when done', async () => {
    vi.useFakeTimers()
    const { state, run } = useBusy()
    let release
    const p = run('Importing…', async step => { step('One'); await new Promise(r => { release = r }); step('Two') }, { total: 2 })
    expect(state.value).toMatchObject({ visible: false, title: 'Importing…', step: 'One', index: 1, total: 2 })
    vi.advanceTimersByTime(250)
    expect(state.value.visible).toBe(true)
    release(); await p
    expect(state.value).toMatchObject({ visible: false, step: 'Two', index: 2 })
  })

  it('a quick action never shows the cover', async () => {
    vi.useFakeTimers()
    const { state, run } = useBusy()
    await run('Quick', async () => {})
    vi.advanceTimersByTime(1000)
    expect(state.value.visible).toBe(false)
  })

  it('closes and passes the error on when the action throws', async () => {
    const { state, run } = useBusy()
    await expect(run('Fails', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(state.value.visible).toBe(false)
    // …and is usable again afterwards
    expect(await run('Again', async () => 7)).toBe(7)
  })

  it('a run inside a run just runs under the outer cover', async () => {
    const { state, run } = useBusy()
    await run('Outer', async step => {
      step('A')
      expect(await run('Inner', async s => { s('ignored'); return 1 })).toBe(1)
      expect(state.value).toMatchObject({ title: 'Outer', step: 'A' })
    })
  })
})
