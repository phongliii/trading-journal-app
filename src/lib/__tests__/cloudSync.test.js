import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registerStore, requestCloudRefresh, primeCloudStamps, setCloudSyncReady } = await import('../cloudSync.js')
// After the import (Vue checks for a real DOM when it loads): the refresh only
// reads document.activeElement, to skip while something is being edited.
globalThis.document = { activeElement: null }

let now = 1_000_000
vi.spyOn(Date, 'now').mockImplementation(() => now)
const later = () => { now += 5000 }

let n = 0
function store(stampValue) {
  const name = `s${++n}`
  const s = { name, stamp: stampValue, load: vi.fn(async () => {}) }
  registerStore(name, s.load, () => {
    if (s.stamp instanceof Error) throw s.stamp
    return Promise.resolve(s.stamp)
  })
  return s
}

beforeEach(() => setCloudSyncReady(true))

describe('cloudSync refresh on page change', () => {
  it('reloads only when the cloud fingerprint changed', async () => {
    const s = store('A|10|t1')
    await primeCloudStamps([s.name])          // as a sign-in load starts
    later(); await requestCloudRefresh([s.name])
    expect(s.load).not.toHaveBeenCalled()     // nothing changed: one tiny check, no download

    s.stamp = 'A|11|t2'                         // another device added a trade
    later(); await requestCloudRefresh([s.name])
    expect(s.load).toHaveBeenCalledTimes(1)

    later(); await requestCloudRefresh([s.name])
    expect(s.load).toHaveBeenCalledTimes(1)   // already up to date
  })

  it('checks again on every page change — no 15-second blind spot', async () => {
    const s = store('A|1|t1')
    await primeCloudStamps([s.name])
    s.stamp = 'A|2|t2'
    now += 2500                                 // just a moment later
    await requestCloudRefresh([s.name])
    expect(s.load).toHaveBeenCalledTimes(1)
  })

  it('loads anyway when the fingerprint can’t be fetched', async () => {
    const s = store(new Error('offline'))
    later(); await requestCloudRefresh([s.name])
    expect(s.load).toHaveBeenCalledTimes(1)
  })

  it('force always loads', async () => {
    const s = store('A|1|t1')
    await primeCloudStamps([s.name])
    later(); await requestCloudRefresh([s.name], { force: true })
    expect(s.load).toHaveBeenCalledTimes(1)
  })

  it('a different portfolio’s fingerprint never counts as unchanged', async () => {
    const s = store('A|5|t1')
    await primeCloudStamps([s.name])
    s.stamp = 'B|5|t1'
    later(); await requestCloudRefresh([s.name])
    expect(s.load).toHaveBeenCalledTimes(1)
  })
})
