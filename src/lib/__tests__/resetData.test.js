import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = []
const rec = name => vi.fn(async (...a) => { calls.push([name, ...a]) })
vi.mock('../storage', () => ({ adapter: { clearAll: rec('trades') } }))
vi.mock('../balanceAdapter', () => ({ balanceAdapter: { save: rec('balance') } }))
vi.mock('../cashEventsAdapter', () => ({ cashEventsAdapter: { save: rec('cash') } }))
vi.mock('../journalAdapter', () => ({ journalAdapter: { clearAll: rec('journal') } }))
vi.mock('../rawCsvArchiveAdapter', () => ({ rawCsvArchiveAdapter: { clearAll: rec('csv') } }))
vi.mock('../cloudSettings', () => ({ clearCloudSettings: rec('settings') }))

const { resetCloud, resetLocal, resetStepCount } = await import('../resetData.js')
const A = { id: 'A', name: 'Portfolio 1' }, B = { id: 'B', name: 'Portfolio 2' }

function mockStorage(keys) {
  const m = new Map(keys.map(k => [k, '1']))
  return { m, s: Object.assign(Object.create({ removeItem: k => m.delete(k) }), Object.fromEntries(m)) }
}

beforeEach(() => { calls.length = 0 })

describe('resetCloud', () => {
  it('deletes only the chosen parts of only the chosen portfolio, keeping settings', async () => {
    await resetCloud({ accounts: [A], parts: ['trades', 'journal'], settings: false })
    expect(calls).toEqual([['trades', 'A'], ['journal', 'A']])
  })

  it('does every portfolio, then the shared settings, and reports each step', async () => {
    const steps = []
    const opts = { accounts: [A, B], parts: ['trades', 'balance', 'cash', 'journal', 'csv'], settings: true }
    await resetCloud(opts, s => steps.push(s))
    expect(calls.map(c => c.slice(0, 2))).toEqual([
      ['trades', 'A'], ['balance', 'A'], ['cash', 'A'], ['journal', 'A'], ['csv', 'A'],
      ['trades', 'B'], ['balance', 'B'], ['cash', 'B'], ['journal', 'B'], ['csv', 'B'],
      ['settings'],
    ])
    expect(calls[1][2]).toEqual({ rawStarting: null, earliestBalanceDate: null, fundTransactions: [] })
    expect(steps).toHaveLength(resetStepCount(opts))
    expect(steps[0]).toBe('Trades — Portfolio 1')
  })
})

describe('resetLocal', () => {
  const keys = [
    'sb-abc-auth-token', 'edgelog:activeAccountId', 'edgelog:journal',
    'edgelog:journal:read:A', 'edgelog:journal:read:B', 'edgelog:tradeMeta:tags', 'edgelog:timezone',
  ]

  it('clears one portfolio’s journal cache and keeps every setting', () => {
    const { m, s } = mockStorage(keys)
    resetLocal({ accounts: [A], parts: ['journal'], settings: false }, s)
    expect([...m.keys()]).toEqual(['sb-abc-auth-token', 'edgelog:activeAccountId', 'edgelog:journal:read:B', 'edgelog:tradeMeta:tags', 'edgelog:timezone'])
  })

  it('with settings, clears cached preferences but never the sign-in or open portfolio', () => {
    const { m, s } = mockStorage(keys)
    resetLocal({ accounts: [A], parts: ['trades'], settings: true }, s)
    expect([...m.keys()]).toEqual(['sb-abc-auth-token', 'edgelog:activeAccountId', 'edgelog:journal', 'edgelog:journal:read:A', 'edgelog:journal:read:B'])
  })
})
