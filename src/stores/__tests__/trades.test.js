import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// A trade with no stored duration (the app fills it in on load).
const rows = [{ id: 1, symbol: 'MNQ', pnl: 10, bought_at: '2026-10-05T09:30:00', sold_at: '2026-10-05T09:35:10' }]
vi.mock('@/lib/storage', () => ({ adapter: { loadTrades: vi.fn(async () => rows.map(r => ({ ...r }))) } }))
vi.mock('../accounts', () => ({ useAccountsStore: () => ({ activeAccountId: 'acc-1' }) }))

const { useTradesStore } = await import('../trades')

describe('trades store load()', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('fills in a missing duration and marks itself loaded', async () => {
    const store = useTradesStore()
    expect(store.loaded).toBe(false)
    await store.load()
    expect(store.trades[0].duration).toBe('5m 10s')
    expect(store.loaded).toBe(true)
  })

  // Regression: comparing the raw reload against already-filled rows made
  // every refresh look "changed", replacing the array and redrawing charts.
  it('leaves the trades array alone when a reload returns the same data', async () => {
    const store = useTradesStore()
    await store.load()
    const before = store.trades
    await store.load()
    expect(store.trades).toBe(before)
  })
})
