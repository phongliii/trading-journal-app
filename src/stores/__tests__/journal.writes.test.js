import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { reactive } from 'vue'

const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
}

const accounts = reactive({ activeAccountId: 'A' })
const trades = reactive({ trades: [], settledFor: 'A' })
let cloud = { data: {}, readList: [] }
let gate = null
vi.mock('../accounts', () => ({ useAccountsStore: () => accounts }))
vi.mock('../trades', () => ({ useTradesStore: () => trades }))
vi.mock('@/lib/cloudSettings', () => ({ pushSettingsPatch: vi.fn() }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), warn: vi.fn() }) }))
vi.mock('@/lib/journalAdapter', () => ({
  journalAdapter: {
    load: vi.fn(async () => { const snapshot = JSON.parse(JSON.stringify(cloud)); if (gate) await gate; return snapshot }),
    saveEntry: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {}),
    setReadMany: vi.fn(async () => {}),
  },
}))

const { useJournalStore } = await import('../journal')

describe('journal writes vs. a refresh already in flight', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mem.clear(); gate = null
    cloud = { data: { '2026-10-20': { sections: [] } }, readList: [] }
  })

  it('keeps a chart image attached while a refresh was loading', async () => {
    const j = useJournalStore()
    await j.load()

    let release; gate = new Promise(r => { release = r })
    const refresh = j.load()                       // tab regains focus as the file picker closes
    await j.setEntryImage('2026-10-20', 'chart.png') // the image is attached and saved
    release(); await refresh                       // the refresh returns the copy from before the save

    expect(j.getEntryImage('2026-10-20')).toBe('chart.png')
  })

  it('still applies changes from other devices, and later loads take the cloud copy', async () => {
    const j = useJournalStore()
    await j.load()
    await j.setEntryImage('2026-10-20', 'chart.png')
    cloud.data['2026-10-20'] = { sections: [], image: 'chart.png' }
    cloud.data['2026-10-21'] = { sections: [], image: 'other-device.png' } // added elsewhere
    await j.load()
    expect(j.getEntryImage('2026-10-21')).toBe('other-device.png')
    expect(j.getEntryImage('2026-10-20')).toBe('chart.png')
  })

  it('does not bring back an entry deleted while a refresh was loading', async () => {
    const j = useJournalStore()
    await j.load()
    let release; gate = new Promise(r => { release = r })
    const refresh = j.load()
    await j.deleteEntry('2026-10-20')
    release(); await refresh
    expect(j.data['2026-10-20']).toBeUndefined()
  })
})
