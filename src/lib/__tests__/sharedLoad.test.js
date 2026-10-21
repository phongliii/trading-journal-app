import { describe, it, expect } from 'vitest'
import { sharedLoad } from '../sharedLoad.js'

// A doLoad that records which portfolio it loaded and waits until released.
function setup() {
  let active = 'A'
  const loaded = [], releases = []
  const load = sharedLoad(() => active, () => new Promise(resolve => {
    const id = active
    releases.push(() => { loaded.push(id); resolve(id) })
  }))
  return { load, loaded, releases, setActive: id => { active = id } }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('sharedLoad', () => {
  it('callers asking for the same portfolio share one load', async () => {
    const { load, releases } = setup()
    const p1 = load(), p2 = load()
    expect(p1).toBe(p2)
    await tick(); releases[0]()
    await expect(p1).resolves.toBe('A')
    expect(releases).toHaveLength(1)
  })

  it('a switch while the old portfolio is loading still loads the new one, last', async () => {
    const { load, loaded, releases, setActive } = setup()
    const old = load()          // background refresh of A
    setActive('B')
    const next = load()         // the switch
    expect(next).not.toBe(old)
    await tick(); releases[0]() // A finishes
    await old; await tick()
    releases[1]()               // then B loads
    await expect(next).resolves.toBe('B')
    expect(loaded).toEqual(['A', 'B'])
  })

  it('a failed load for the old portfolio does not stop the new one', async () => {
    let active = 'A', calls = 0
    const load = sharedLoad(() => active, async () => { calls++; if (active === 'A' && calls === 1) throw new Error('x'); return active })
    const old = load().catch(() => 'failed')
    active = 'B'
    await expect(load()).resolves.toBe('B')
    await expect(old).resolves.toBe('failed')
  })
})
