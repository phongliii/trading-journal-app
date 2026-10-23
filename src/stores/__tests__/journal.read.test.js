import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { reactive, nextTick } from 'vue'

// No DOM here — a minimal localStorage.
const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
}

const accounts = reactive({ activeAccountId: 'A' })
const trades = reactive({ trades: [], settledFor: null })
const cloud = {}  // accountId -> { data, readList }
let gate = null   // when set, cloud loads wait for it
vi.mock('../accounts', () => ({ useAccountsStore: () => accounts }))
vi.mock('../trades', () => ({ useTradesStore: () => trades }))
vi.mock('@/lib/cloudSettings', () => ({ pushSettingsPatch: vi.fn() }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), warn: vi.fn() }) }))
vi.mock('@/lib/journalAdapter', () => ({
  journalAdapter: {
    load: vi.fn(async id => { if (gate) await gate; return cloud[id] }),
    setReadMany: vi.fn(async () => {}),
  },
}))

const { useJournalStore } = await import('../journal')
const { journalAdapter } = await import('@/lib/journalAdapter')
const day = key => ({ id: key, pnl: 1, sold_at: `${key}T10:00:00` })

describe('journal unread dots across a portfolio switch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mem.clear(); gate = null
    cloud.A = { data: {}, readList: ['2026-10-01'] }
    cloud.B = { data: {}, readList: ['2026-10-20', '2026-10-21'] }
    accounts.activeAccountId = 'A'
    trades.trades = [day('2026-10-01')]; trades.settledFor = 'A'
  })

  it('never shows the new portfolio’s read days as unread while it loads', async () => {
    const j = useJournalStore()
    await j.load()
    expect(j.hasUnread).toBe(false)

    // Switch to B: its trades land first, its read list is still loading.
    let release; gate = new Promise(r => { release = r })
    accounts.activeAccountId = 'B'
    const loading = j.load()
    trades.trades = [day('2026-10-20'), day('2026-10-21')]; trades.settledFor = 'B'
    await nextTick()
    expect(j.hasUnread).toBe(false) // was true: B's days checked against A's list

    release(); await loading
    expect(j.hasUnread).toBe(false)
    expect(j.dailyEntries.every(e => e.isRead)).toBe(true)
  })

  it('uses the cached read list straight away and still shows real unread days', async () => {
    const j = useJournalStore()
    await j.load()
    localStorage.setItem('edgelog:journal:read:B', JSON.stringify(['2026-10-20']))

    let release; gate = new Promise(r => { release = r })
    accounts.activeAccountId = 'B'
    const loading = j.load()
    trades.trades = [day('2026-10-20'), day('2026-10-22')]; trades.settledFor = 'B'
    await nextTick()
    expect(j.dailyEntries.find(e => e.key === '2026-10-20').isRead).toBe(true)
    expect(j.dailyEntries.find(e => e.key === '2026-10-22').isRead).toBe(false)
    release(); await loading
  })

  it('keeps the new portfolio’s read marks (locally and in the cloud) when its trades land last', async () => {
    const j = useJournalStore()
    await j.load()
    journalAdapter.setReadMany.mockClear()

    accounts.activeAccountId = 'B'
    await j.load() // B's journal + read list arrive first…
    trades.trades = [day('2026-10-20'), day('2026-10-21')] // …then its trades,
    trades.settledFor = 'B'                                 // as the trades store sets them
    await nextTick()

    expect(j.readList).toEqual(expect.arrayContaining(['2026-10-20', '2026-10-21']))
    expect(j.hasUnread).toBe(false)
    expect(journalAdapter.setReadMany).not.toHaveBeenCalledWith('B', expect.anything(), false)
  })
})
