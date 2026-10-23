import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { packRows, unpackRows } from '../csvRowsCodec.js'
import { parseRows } from '../csvParser.js'

describe('csvRowsCodec', () => {
  it('round-trips rows exactly, including rows with different columns', async () => {
    const rows = [
      { Account: '1481748', Date: '2026-10-23', Delta: '-50.00', 'Cash Change Type': ' Liquidation Fee' },
      { Account: '1481748', Date: '2026-10-23', Delta: '', Contract: 'MNQZ6' },
      { Note: 'emoji ✓ and "quotes", commas' },
      { id: null, timestamp: '2026-03-17T02:06:56', type: 'Fund Transaction', delta: 1000 },
    ]
    const packed = await packRows(rows)
    expect(packed.v).toBe(2)
    expect(typeof packed.gz).toBe('string')
    expect(await unpackRows(JSON.parse(JSON.stringify(packed)))).toEqual(rows)
  })

  it('still reads an old, unpacked archive', async () => {
    const rows = [{ a: '1' }, { a: '2' }]
    expect(await unpackRows(rows)).toEqual(rows)
    expect(await unpackRows(null)).toEqual([])
  })

  it('packs a large archive far smaller than plain JSON', async () => {
    const rows = Array.from({ length: 20000 }, (_, i) => ({
      Account: '1481748', 'Transaction ID': String(20751699000 + i), Timestamp: '10/22/2026 20:36:42',
      Date: '2026-10-23', Delta: '-0.35', Amount: String(490 - i / 100), 'Cash Change Type': ' Exchange Fee', Currency: 'USD', Contract: 'MNQZ6',
    }))
    const packed = await packRows(rows)
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(rows).length / 8)
    expect(await unpackRows(packed)).toEqual(rows)
  })
})
