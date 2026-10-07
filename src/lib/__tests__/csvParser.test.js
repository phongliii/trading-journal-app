import { describe, it, expect } from 'vitest'
import {
  parseRows, parseCSV, parseDualCSV, detectCSVFormat,
  parseBalanceHistory, parseCashEvents, parseFundTransactions,
} from '../csvParser.js'

const csv = (...lines) => lines.join('\n')

// ─── Fixtures: a small Position_History + Cash_History pair ───────────────────
//
// Per-contract fees: exchange 0.35 + clearing 0.19 + nfa 0.02 + commission 0.24 = 0.80
//
//   Pair 1: long 2 MNQ, buy fill 100 (qty 2), sell fill 200 (shared with pair 2, total qty 3)
//   Pair 2: long 1 MNQ, buy fill 300, sell fill 200
//   Pair 3: short 1 MES (sold before bought), sell fill 400, buy fill 500 — fill 500's
//           fee rows are missing from the export, so the per-contract fallback applies
const POSITION = csv(
  'Pair ID,Buy Fill ID,Sell Fill ID,Paired Qty,Contract,Buy Price,Sell Price,P/L,Bought Timestamp,Sold Timestamp',
  '1,100,200,2,MNQZ6,20000.00,20005.00,$20.00,10/05/2026 09:30:00,10/05/2026 09:35:10',
  '2,300,200,1,MNQZ6,20002.00,20005.00,$(5.00),10/05/2026 09:31:00,10/05/2026 09:35:10',
  '3,500,400,1,MESZ6,6000.00,6002.00,$10.00,10/05/2026 10:05:00,10/05/2026 10:00:00',
  ',,,,,,,,,',
)

const feeRows = (fillId, qty, ts, ids = [1, 2, 3, 4]) => {
  const rates = [['Exchange Fee', 0.35], ['Clearing Fee', 0.19], ['Nfa Fee', 0.02], ['Commission', 0.24]]
  return rates.map(([type, rate], i) =>
    `${fillId + ids[i]},ACC1,${ts},2026-10-05,-${(rate * qty).toFixed(2)},0,${type}`)
}

const CASH = csv(
  'Transaction ID,Account,Timestamp,Date,Delta,Amount,Cash Change Type',
  '50,ACC1,10/01/2026 08:00:00,2026-10-01,5000.00,5000.00,Fund Transaction',
  ...feeRows(100, 2, '10/05/2026 09:30:00'),
  ...feeRows(200, 3, '10/05/2026 09:35:10', [2, 3, 5, 6]), // broker skipped some IDs
  ...feeRows(300, 1, '10/05/2026 09:31:00'),
  ...feeRows(400, 1, '10/05/2026 10:00:00'),
  '600,ACC1,10/05/2026 09:35:10,2026-10-05,15.00,0,Trade Paired',
  '601,ACC1,10/05/2026 10:05:00,2026-10-05,10.00,0,Trade Paired',
  '700,ACC1,10/05/2026 11:00:00,2026-10-05,0.00,0,Some Other Type',
  '900,ACC1,10/06/2026 08:00:00,2026-10-06,"$(1,000.00)",0,Fund Transaction',
)

describe('parseRows', () => {
  it('splits headers/rows, honours quoted commas and skips blank lines', () => {
    expect(parseRows(csv('a,"b c",d', '1,"2,000",3', '', '4,5,6'))).toEqual([
      { a: '1', 'b c': '2,000', d: '3' },
      { a: '4', 'b c': '5', d: '6' },
    ])
  })

  it('detects tab-delimited files and CRLF line endings', () => {
    expect(parseRows('a\tb\r\n1\t2\r\n')).toEqual([{ a: '1', b: '2' }])
  })

  it('returns [] for header-only input', () => {
    expect(parseRows('a,b')).toEqual([])
  })
})

describe('detectCSVFormat', () => {
  it.each([
    [POSITION, 'position'],
    [CASH, 'cash'],
    ['Account ID,Account Name,Trade Date,Total Amount,Total Realized PNL', 'balance'],
    ['symbol,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp', 'performance'],
    ['12345678,ACC1,10/05/2026 09:30:00,2026-10-05,-0.35,0,Exchange Fee', 'cash'], // headerless cash
    ['foo,bar', 'unknown'],
  ])('%#', (text, expected) => expect(detectCSVFormat(text)).toBe(expected))
})

describe('parseCSV (Performance.csv / generic)', () => {
  const PERF = csv(
    'symbol,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
    'MNQZ6,2,20000.25,20010.25,$40.00,10/05/2026 09:30:00,10/05/2026 09:40:00,10min',
    'MNQZ6,1,20010.00,20005.00,$(10.00),10/05/2026 09:50:00,10/05/2026 09:45:00,5min',
    ',,,,,,,',
  )

  it('maps columns to trades and parses money formats', () => {
    const { trades, errors, warnings } = parseCSV(PERF)
    expect(errors).toEqual([])
    expect(warnings).toEqual(['Skipped 1 blank/unreadable row'])
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({
      symbol: 'MNQZ6', qty: 2, side: 'long', buy_price: 20000.25, sell_price: 20010.25,
      gross_pnl: 40, fees: 0, net_pnl: 40, pnl: 40,
      bought_at: '2026-10-05T09:30:00', sold_at: '2026-10-05T09:40:00', duration: '10min',
    })
    expect(trades[1].pnl).toBe(-10)
  })

  it('keeps broker timestamps as naive local time and orders open/close', () => {
    const t = parseCSV(PERF).trades[1]
    expect(t.bought_at).toBe('2026-10-05T09:45:00') // earlier of the two
    expect(t.sold_at).toBe('2026-10-05T09:50:00')
  })

  it('accepts alternate header names', () => {
    const { trades } = parseCSV(csv('Instrument,Quantity,P&L,ExitTime,Direction', 'ES,3,-1250.50,10/05/2026 15:00:00,short'))
    expect(trades[0]).toMatchObject({ symbol: 'ES', qty: 3, pnl: -1250.5, side: 'short', sold_at: '2026-10-05T15:00:00' })
  })

  it('warns when symbol/qty columns are missing', () => {
    const { trades, warnings } = parseCSV(csv('pnl', '5', '-3'))
    expect(trades.map(t => [t.symbol, t.qty, t.pnl])).toEqual([['UNKNOWN', 1, 5], ['UNKNOWN', 1, -3]])
    expect(warnings).toHaveLength(2)
  })

  it('rejects files with neither symbol nor P&L', () => {
    expect(parseCSV(csv('foo,bar', '1,2')).errors).toHaveLength(1)
  })

  it('rejects empty files', () => {
    expect(parseCSV('symbol,pnl').errors).toEqual(['File is empty or has only headers'])
  })
})

describe('parseDualCSV (Position_History + Cash_History)', () => {
  const result = parseDualCSV(POSITION, CASH)
  const [t1, t2, t3] = result.trades

  it('parses all real rows and skips the blank one', () => {
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual(['Skipped 1 blank/unreadable row'])
    expect(result.trades).toHaveLength(3)
  })

  it('matches each fill to its fee rows, even across skipped transaction IDs', () => {
    // buy 100: 1.60 for 2 contracts; sell 200: 2.40 split 2/3 → 1.60
    expect(t1).toMatchObject({ broker_id: '1', symbol: 'MNQZ6', qty: 2, side: 'long', gross_pnl: 20, fees: 3.2, net_pnl: 16.8, pnl: 16.8 })
  })

  it('splits a shared fill’s fees proportionally by paired qty', () => {
    // buy 300: 0.80; sell 200: 2.40 × 1/3 = 0.80
    expect(t2).toMatchObject({ gross_pnl: -5, fees: 1.6, net_pnl: -6.6 })
  })

  it('falls back to the per-contract rate when a fill’s fee rows are missing', () => {
    // sell 400: 0.80 found; buy 500: none found → 1 × 0.80
    expect(t3).toMatchObject({ fees: 1.6, net_pnl: 8.4 })
  })

  it('detects shorts and orders open/close times', () => {
    expect(t3).toMatchObject({
      side: 'short', bought_at: '2026-10-05T10:00:00', sold_at: '2026-10-05T10:05:00', duration: '5m 0s',
    })
    expect(t1.duration).toBe('5m 10s')
    expect(t1.buy_price).toBe(20000)
  })

  it('extracts deposits and withdrawals', () => {
    expect(result.fundTransactions).toEqual([
      { date: '2026-10-01', amount: 5000, type: 'deposit' },
      { date: '2026-10-06', amount: -1000, type: 'withdrawal' },
    ])
  })

  it('extracts chronological cash events, ignoring unrelated types', () => {
    const ev = result.cashEvents
    expect(ev).toHaveLength(2 + 16 + 2)
    expect(ev[0]).toEqual({ id: '50', timestamp: '2026-10-01T08:00:00', type: 'Fund Transaction', delta: 5000 })
    expect(ev.at(-1)).toMatchObject({ id: '900', delta: -1000 })
    expect(ev.some(e => e.type === 'Some Other Type')).toBe(false)
    const ts = ev.map(e => e.timestamp)
    expect([...ts].sort()).toEqual(ts)
  })

  it('errors on an empty position file', () => {
    expect(parseDualCSV('', CASH).errors).toEqual(['Position_History.csv is empty or invalid'])
  })

  it('errors when the position file is not a Position_History export', () => {
    expect(parseDualCSV(csv('foo,bar', '1,2'), CASH).errors).toHaveLength(1)
  })

  it('errors when the cash file has no fee rows', () => {
    const cashNoFees = csv('Transaction ID,Timestamp,Delta,Cash Change Type', '1,10/05/2026 09:00:00,5,Trade Paired')
    expect(parseDualCSV(POSITION, cashNoFees).errors).toEqual(['Cash_History.csv is empty or no fee rows found'])
  })

  it('reads headerless Cash_History exports by column position', () => {
    // Headerless layout: account, txn id, timestamp, date, delta, amount, type
    const headerless = CASH.split('\n').slice(1).map(l => l.replace(/^(\d+),ACC1,/, '12345,$1,')).join('\n')
    const r = parseDualCSV(POSITION, headerless)
    expect(r.trades.map(t => t.fees)).toEqual([3.2, 1.6, 1.6])
    expect(r.fundTransactions).toHaveLength(2)
  })
})

describe('parseFundTransactions / parseCashEvents', () => {
  it('returns nothing when there are no matching rows', () => {
    const text = csv('Transaction ID,Timestamp,Date,Delta,Cash Change Type', '1,10/05/2026 09:00:00,2026-10-05,5,Trade Paired')
    expect(parseFundTransactions(text)).toEqual([])
    expect(parseCashEvents(text)).toHaveLength(1)
  })
})

describe('parseBalanceHistory', () => {
  it('derives the starting balance from the earliest day', () => {
    const text = csv(
      'Account ID,Account Name,Trade Date,Total Amount,Total Realized PNL',
      '1,ACC1,2026-10-06,"$51,200.00",$300.00',
      '1,ACC1,2026-10-05,"$50,900.00",$(100.00)',
    )
    expect(parseBalanceHistory(text)).toEqual({ rawStarting: 51000, earliestBalanceDate: '2026-10-05', errors: [] })
  })

  it('errors on empty or unparseable files', () => {
    expect(parseBalanceHistory('a,b').errors).toEqual(['Empty file'])
    expect(parseBalanceHistory(csv('Trade Date,Total Amount', '2026-10-05,abc')).errors).toEqual(['Could not parse Total Amount'])
  })
})
