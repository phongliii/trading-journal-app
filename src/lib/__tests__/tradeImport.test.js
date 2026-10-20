import { describe, it, expect } from 'vitest'
import { buildTradeImport } from '../tradeImport.js'
import { parseRows } from '../csvParser.js'

const csv = (...lines) => lines.join('\n')
const saved = text => {
  const rows = text ? parseRows(text) : []
  return { headers: rows.length ? Object.keys(rows[0]) : [], rows }
}

const POSITION = csv(
  'Pair ID,Buy Fill ID,Sell Fill ID,Paired Qty,Contract,Buy Price,Sell Price,P/L,Bought Timestamp,Sold Timestamp',
  '1,100,200,1,MNQZ6,20000.00,20005.00,$10.00,10/05/2026 09:30:00,10/05/2026 09:35:00',
)
const feeRows = fillId => [['Exchange Fee', 0.35], ['Clearing Fee', 0.19], ['Nfa Fee', 0.02], ['Commission', 0.24]]
  .map(([type, amt], i) => `${fillId + i + 1},ACC1,10/05/2026 09:30:00,2026-10-05,-${amt},0,${type}`)
const HEAD = 'Transaction ID,Account,Timestamp,Date,Delta,Amount,Cash Change Type'
const CASH_FEES = csv(HEAD, ...feeRows(100), ...feeRows(200))
const CASH_WITHDRAWAL = csv(HEAD, '900,ACC1,10/14/2026 08:00:00,2026-10-14,"$(500.00)",0,Fund Transaction')

const empty = { headers: [], rows: [] }

describe('buildTradeImport', () => {
  it('Position + Cash: trades with fees, plus fund transactions', () => {
    const r = buildTradeImport({ positionText: POSITION, cashText: csv(CASH_FEES, '900,ACC1,10/14/2026 08:00:00,2026-10-14,-500,0,Fund Transaction'), savedPosition: empty, savedCash: empty })
    expect(r.errors).toEqual([])
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0].fees).toBe(1.6)
    expect(r.fundTransactions).toHaveLength(1)
  })

  it('Position only: takes fees from the saved Cash History', () => {
    const r = buildTradeImport({ positionText: POSITION, savedPosition: empty, savedCash: saved(CASH_FEES) })
    expect(r.trades[0]).toMatchObject({ broker_id: '1', fees: 1.6, pnl: 8.4 })
    expect(r.fundTransactions).toEqual([])
  })

  it('Position only with no Cash History anywhere: $0 fees, no error', () => {
    const r = buildTradeImport({ positionText: POSITION, savedPosition: empty, savedCash: empty })
    expect(r.errors).toEqual([])
    expect(r.trades[0].fees).toBe(0)
  })

  it('never replaces fees a trade already has with $0', () => {
    const existing = [{ broker_id: '1', fees: 1.6, pnl: 8.4 }]
    const r = buildTradeImport({ positionText: POSITION, savedPosition: empty, savedCash: empty, existingTrades: existing })
    expect(r.trades[0]).toMatchObject({ fees: 1.6, net_pnl: 8.4, pnl: 8.4 })
  })

  it('Cash only (a withdrawal): records it, adds no trades', () => {
    const r = buildTradeImport({ cashText: CASH_WITHDRAWAL, savedPosition: saved(POSITION), savedCash: saved(CASH_FEES), existingTrades: [{ broker_id: '1', fees: 1.6 }] })
    expect(r.errors).toEqual([])
    expect(r.fundTransactions).toEqual([{ id: '900', date: '2026-10-14', amount: -500, type: 'withdrawal' }])
    expect(r.newTradeCount).toBe(0)
    // The existing trade is re-derived with the same fees (insertTrades skips it as unchanged).
    expect(r.trades.map(t => t.fees)).toEqual([1.6])
  })

  it('Cash only: fills in fees on trades you already have, via the saved Position rows', () => {
    const existing = [{ broker_id: '1', fees: 0, pnl: 10 }, { broker_id: '99', fees: 0 }]
    const r = buildTradeImport({ cashText: CASH_FEES, savedPosition: saved(POSITION), savedCash: empty, existingTrades: existing })
    expect(r.refreshCount).toBe(1)
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({ broker_id: '1', fees: 1.6, pnl: 8.4 })
  })

  it('Cash only: never adds a trade that is not already in the journal', () => {
    const r = buildTradeImport({ cashText: CASH_FEES, savedPosition: saved(POSITION), savedCash: empty, existingTrades: [] })
    expect(r.trades).toEqual([])
  })
})
