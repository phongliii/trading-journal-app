import { describe, it, expect, vi } from 'vitest'

// A fake Supabase client: records each delete request's ids and returns the
// rows it "deleted" (all of them, except ids listed in `missing`).
const calls = []
const missing = new Set()
vi.mock('../supabaseClient', () => ({
  getSupabase: () => ({
    from: () => ({
      delete: () => ({
        in: (_col, ids) => ({
          select: async () => { calls.push(ids); return { data: ids.filter(id => !missing.has(id)).map(id => ({ id })), error: null } },
        }),
      }),
    }),
  }),
  getUserId: async () => 'u1',
}))
const { supabaseAdapter } = await import('../supabaseAdapter.js')

describe('supabaseAdapter.deleteTrades', () => {
  it('sends a big range in chunks of 100 and reports what the cloud deleted', async () => {
    calls.length = 0; missing.clear()
    const existing = Array.from({ length: 250 }, (_, i) => ({ id: `t${i}` }))
    const { remaining, deleted } = await supabaseAdapter.deleteTrades(existing.map(t => t.id), existing)
    expect(calls.map(c => c.length)).toEqual([100, 100, 50])
    expect(deleted).toBe(250)
    expect(remaining).toEqual([])
  })

  it('keeps trades the cloud did not delete', async () => {
    calls.length = 0; missing.clear(); missing.add('t1')
    const existing = [{ id: 't0' }, { id: 't1' }]
    const { remaining, deleted } = await supabaseAdapter.deleteTrades(['t0', 't1'], existing)
    expect(deleted).toBe(1)
    expect(remaining).toEqual([{ id: 't1' }])
  })
})
