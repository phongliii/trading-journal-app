import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const cloud = { rows: [], pending: null }
vi.mock('@/lib/storage', () => ({
  adapter: {
    // The next load can be held open (cloud.pending) to finish after a delete.
    loadTrades: vi.fn(() => {
      const snapshot = cloud.rows.map(r => ({ ...r }))
      if (!cloud.pending) return Promise.resolve(snapshot)
      return new Promise(resolve => { cloud.pending = () => resolve(snapshot) })
    }),
    deleteTrades: vi.fn(async (ids, existing) => {
      cloud.rows = cloud.rows.filter(r => !ids.includes(r.id))
      return { remaining: existing.filter(t => !ids.includes(t.id)), deleted: ids.length }
    }),
  },
}))
vi.mock('../accounts', () => ({ useAccountsStore: () => ({ activeAccountId: 'acc-1' }) }))

const { useTradesStore } = await import('../trades')
const trade = id => ({ id, symbol: 'MNQ', pnl: 1, duration: '1m', bought_at: '2026-10-05T09:30:00', sold_at: '2026-10-05T09:31:00' })

describe('trades store: delete vs a background refresh', () => {
  beforeEach(() => { setActivePinia(createPinia()); cloud.rows = [trade(1), trade(2), trade(3)]; cloud.pending = null })

  it("a refresh that started before a delete doesn't put the deleted trades back", async () => {
    const store = useTradesStore()
    await store.load()
    cloud.pending = true                 // the next load (a background refresh) is slow…
    const refresh = store.load()
    expect(await store.deleteTrades([1, 2])).toBe(2) // …and a delete happens meanwhile
    expect(store.trades.map(t => t.id)).toEqual([3])
    cloud.pending()                      // the refresh now returns the pre-delete rows
    await refresh
    expect(store.trades.map(t => t.id)).toEqual([3])
  })

  it('a refresh after the delete shows the cloud as it is', async () => {
    const store = useTradesStore()
    await store.load()
    await store.deleteTrades([1])
    await store.load()
    expect(store.trades.map(t => t.id)).toEqual([2, 3])
  })
})
