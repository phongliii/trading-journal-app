/**
 * Multi-format CSV parser for EdgeLog Trading Journal
 *
 * Fee calculation strategy (Position_History + Cash_History):
 * - Each fill's fees are the first 4 fee rows after fillId (within +10 offsets)
 * - Fee amounts scale with qty (e.g. 5 contracts = 5× per-contract fee in one row)
 * - When multiple position rows share a buy/sell fill ID (overlapping positions),
 *   fees are split proportionally by Paired Qty: fee × (this_qty / total_qty_for_fill)
 */

// ─── helpers ──────────────────────────────────────────────────────────────────

function parsePnl(raw) {
  if (raw === null || raw === undefined || raw === '') return 0
  const s = String(raw).trim()
  const isNeg = /^\(/.test(s) || /^\$\(/.test(s) || s.startsWith('-')
  const cleaned = s.replace(/[$(),\s,"]/g, '')
  const val = parseFloat(cleaned)
  if (isNaN(val)) return 0
  return isNeg ? -Math.abs(val) : val
}

function parseNum(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const s = String(raw).trim()
  const isNeg = /^\(/.test(s) || /^\$\(/.test(s) || s.startsWith('-')
  const cleaned = s.replace(/[$(),\s,"]/g, '')
  const val = parseFloat(cleaned)
  if (isNaN(val)) return null
  return isNeg ? -Math.abs(val) : val
}

function parseDate(raw) {
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (m) {
    const [, mm, dd, yyyy, hh, min, ss] = m
    const str = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T${hh.padStart(2,'0')}:${min}:${ss}`
    // Validate it's a real date/time without converting to the viewer's
    // timezone — the CSV's timestamp is the broker's local time, and it
    // must stay exactly as given regardless of what machine opens this app.
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : str
  }
  // Fallback: unrecognized format, best-effort parse (may still be
  // timezone-dependent, but this path is rarely hit for broker exports)
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function calcDuration(boughtRaw, soldRaw) {
  const b = parseDate(boughtRaw)
  const s = parseDate(soldRaw)
  if (!b || !s) return ''
  const diffMs = Math.abs(new Date(s) - new Date(b))
  const totalSecs = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const sec = totalSecs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function closedAt(boughtRaw, soldRaw) {
  const b = parseDate(boughtRaw), s = parseDate(soldRaw)
  if (!b && !s) return null
  if (!b) return s
  if (!s) return b
  return new Date(b) > new Date(s) ? b : s
}

function openedAt(boughtRaw, soldRaw) {
  const b = parseDate(boughtRaw), s = parseDate(soldRaw)
  if (!b && !s) return null
  if (!b) return s
  if (!s) return b
  return new Date(b) < new Date(s) ? b : s
}

function splitLine(line, delim) {
  const result = []
  let current = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === delim && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

export function parseRows(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = splitLine(lines[0], delim).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = splitLine(lines[i], delim)
    const row = {}
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim().replace(/^"|"$/g, '') })
    rows.push(row)
  }
  return rows
}

// ─── MODE 1: Performance.csv ──────────────────────────────────────────────────

const FIELD_MAPS = {
  symbol:    ['symbol', 'Symbol', 'Instrument', 'Contract', 'ticker', 'Market'],
  qty:       ['qty', 'Qty', 'Quantity', 'size', 'Contracts'],
  buyPrice:  ['buyPrice', 'buy_price', 'BuyPrice', 'EntryPrice', 'Entry', 'Buy Price'],
  sellPrice: ['sellPrice', 'sell_price', 'SellPrice', 'ExitPrice', 'Exit', 'Sell Price'],
  pnl:       ['pnl', 'PNL', 'Pnl', 'profit', 'P&L', 'P/L', 'NetProfit', 'GainLoss'],
  boughtAt:  ['boughtTimestamp', 'bought_at', 'EntryTime', 'OpenTime', 'Bought Timestamp'],
  soldAt:    ['soldTimestamp', 'sold_at', 'ExitTime', 'CloseTime', 'Sold Timestamp'],
  duration:  ['duration', 'Duration', 'HoldTime'],
  side:      ['side', 'Side', 'Direction', 'Type'],
}

function pick(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k]
  return null
}

// True if any of a field's recognized header aliases is actually present in
// this file's header row — distinct from a single row's value being blank.
// Used to tell "this column doesn't exist in the file at all, so every row
// is about to get the same fallback/default" (worth a warning) apart from
// "this one row just happens to have nothing in an otherwise-real column"
// (not worth flagging — plenty of real trades have a blank duration, etc).
function headerHasAny(headers, aliases) {
  return aliases.some(a => headers.includes(a))
}

export function parseCSV(text) {
  const rows = parseRows(text)
  if (!rows.length) return { trades: [], errors: ['File is empty or has only headers'], warnings: [] }

  const headers = Object.keys(rows[0])
  const warnings = []
  const hasSymbolCol = headerHasAny(headers, FIELD_MAPS.symbol)
  const hasPnlCol    = headerHasAny(headers, FIELD_MAPS.pnl)
  const hasQtyCol    = headerHasAny(headers, FIELD_MAPS.qty)

  // If NEITHER a symbol nor a P&L column can be found, this almost
  // certainly isn't a trade export at all (wrong file, or a format
  // detectCSVFormat's header-sniff didn't actually recognize) — reject it
  // outright instead of silently producing a pile of "UNKNOWN, $0" rows.
  if (!hasSymbolCol && !hasPnlCol) {
    return {
      trades: [], warnings: [],
      errors: ["Couldn't find a symbol or P&L column in this file — it doesn't look like a trade export"],
    }
  }
  if (!hasSymbolCol) warnings.push('No symbol column found — every trade will show as "UNKNOWN"')
  if (!hasQtyCol)    warnings.push('No quantity column found — every trade defaulted to qty 1')

  const trades = []
  let blankRows = 0
  for (const row of rows) {
    const gross_pnl = parsePnl(pick(row, FIELD_MAPS.pnl))
    const symbolRaw = pick(row, FIELD_MAPS.symbol)
    const symbol    = symbolRaw || 'UNKNOWN'
    const qty       = parseInt(pick(row, FIELD_MAPS.qty) || '1') || 1
    const boughtRaw = pick(row, FIELD_MAPS.boughtAt)
    const soldRaw   = pick(row, FIELD_MAPS.soldAt) || boughtRaw

    // A row with no symbol, zero P&L, and no timestamp either is very
    // likely a stray blank/malformed line (e.g. a trailing comma-only row)
    // rather than a real trade — skip it instead of importing a
    // placeholder "UNKNOWN, $0" entry that just clutters the journal.
    if (!symbolRaw && gross_pnl === 0 && !boughtRaw && !soldRaw) { blankRows++; continue }

    trades.push({
      symbol, qty,
      side:       pick(row, FIELD_MAPS.side) || 'long',
      buy_price:  parseNum(pick(row, FIELD_MAPS.buyPrice)),
      sell_price: parseNum(pick(row, FIELD_MAPS.sellPrice)),
      gross_pnl, fees: 0, net_pnl: gross_pnl, pnl: gross_pnl,
      bought_at: openedAt(boughtRaw, soldRaw),
      sold_at:   closedAt(boughtRaw, soldRaw),
      duration: pick(row, FIELD_MAPS.duration) || '',
      notes: '', tags: [],
    })
  }
  if (blankRows > 0) warnings.push(`Skipped ${blankRows} blank/unreadable row${blankRows !== 1 ? 's' : ''}`)

  return { trades, errors: [], warnings }
}

// ─── MODE 2: Position_History + Cash_History ──────────────────────────────────

/**
 * Parse Cash_History fee rows into Map<txnId, amount>, plus the per-contract
 * fee rate (sum of each fee type's smallest observed row — fee rows scale
 * linearly with the fill's contract count, so the smallest row for a given
 * type is the 1-contract case). The rate is a fallback for fillFees() below,
 * for fills whose own fee rows are entirely missing from this export.
 */
function parseCashHistory(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return { feeByTxnId: new Map(), perContractRate: 0 }

  const FEE_TYPES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission'])
  const firstCols = splitLine(lines[0], ',').map(c => c.trim().replace(/^"|"$/g, ''))
  const hasHeader = isNaN(Number(firstCols[0]))

  let idxTxnId, idxDelta, idxType
  if (hasHeader) {
    idxTxnId = firstCols.findIndex(h => h === 'Transaction ID')
    idxDelta = firstCols.findIndex(h => h === 'Delta')
    idxType  = firstCols.findIndex(h => h === 'Cash Change Type' || h === 'Type')
  } else {
    idxTxnId = 1; idxDelta = 4; idxType = 6
  }

  const feeByTxnId = new Map()
  const minByType = new Map()
  const dataLines = hasHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = splitLine(line, ',').map(c => c.trim().replace(/^"|"$/g, ''))
    const type = (cols[idxType] || '').trim()
    if (!FEE_TYPES.has(type)) continue
    const txnId = parseInt(cols[idxTxnId])
    const amount = Math.abs(parseNum(cols[idxDelta]) || 0)
    if (!isNaN(txnId) && amount > 0) feeByTxnId.set(txnId, amount)
    if (amount > 0 && (!minByType.has(type) || amount < minByType.get(type))) minByType.set(type, amount)
  }

  let perContractRate = 0
  for (const v of minByType.values()) perContractRate += v

  return { feeByTxnId, perContractRate }
}

/**
 * Get total fees for a fill by finding first 4 fee rows within +10 offsets.
 * Fee amounts already scale with qty (broker charges qty×rate per row).
 * Search up to +10 to handle cases where broker skips transaction IDs.
 *
 * Some fills' fee rows are missing from the export entirely rather than
 * merely offset — seen when the exchange-wide Transaction ID counter jumps
 * by millions between two fills seconds apart (fill IDs are a shared,
 * exchange-wide sequence, not per-account), so the broker's export window
 * for this account skips right over that fill's own fee rows. Offset search
 * alone can never bridge a gap that size, so when NOTHING is found for a
 * fill, fall back to its expected qty × the per-contract rate derived from
 * the rest of the file, instead of silently treating that side as fee-free
 * (which understates fees — and overstates net P&L — for that fill).
 */
function fillFees(fillId, feeByTxnId, expectedQty, perContractRate) {
  const id = parseInt(fillId)
  if (isNaN(id)) return 0
  let total = 0, found = 0
  for (let i = 1; i <= 10; i++) {
    const amt = feeByTxnId.get(id + i)
    if (amt !== undefined) { total += amt; found++ }
    if (found === 4) break
  }
  if (found === 0 && expectedQty > 0) return perContractRate * expectedQty
  return total
}

export function parseDualCSV(positionText, cashText) {
  const errors = []
  const warnings = []

  const posRows = parseRows(positionText)
  if (!posRows.length) {
    errors.push('Position_History.csv is empty or invalid')
    return { trades: [], fundTransactions: [], cashEvents: [], errors, warnings }
  }

  const posHeaders = Object.keys(posRows[0])
  const hasFillIdCols = posHeaders.includes('Buy Fill ID') || posHeaders.includes('Sell Fill ID')
  const hasSymbolCol  = posHeaders.includes('Contract') || posHeaders.includes('symbol')
  // Fill IDs are how fees get matched to a trade at all (fillFees below) —
  // without either them or a symbol column, this isn't recognizable as a
  // Position_History export, so reject it instead of producing trades with
  // no fees and "UNKNOWN" symbols across the board.
  if (!hasFillIdCols && !hasSymbolCol) {
    errors.push("Couldn't find Contract or Fill ID columns — this doesn't look like a Position_History export")
    return { trades: [], fundTransactions: [], cashEvents: [], errors, warnings }
  }
  if (!hasSymbolCol) warnings.push('No Contract column found — every trade will show as "UNKNOWN"')

  // A row with no symbol, no fill IDs, and no P/L is very likely a stray
  // blank/trailer line rather than a real fill — drop it before it reaches
  // the fee pre-computation below (where it would otherwise contribute a
  // bogus 0-qty entry to fillTotalQty).
  const cleanPosRows = posRows.filter(row => {
    const blank = !(row['Contract'] || row['symbol']) &&
      !(row['Buy Fill ID'] || row['Sell Fill ID']) &&
      !(row['P/L'] || row['pnl'])
    return !blank
  })
  const blankRows = posRows.length - cleanPosRows.length
  if (blankRows > 0) warnings.push(`Skipped ${blankRows} blank/unreadable row${blankRows !== 1 ? 's' : ''}`)

  const { feeByTxnId, perContractRate } = parseCashHistory(cashText)
  if (!feeByTxnId.size) {
    errors.push('Cash_History.csv is empty or no fee rows found')
    return { trades: [], fundTransactions: [], cashEvents: [], errors, warnings }
  }

  // Extract fund transactions automatically
  const fundTransactions = parseFundTransactions(cashText)

  // Extract raw chronological cash events for drawdown/peak equity
  const cashEvents = parseCashEvents(cashText)

  // Pre-compute total Paired Qty per fill ID (for proportional splitting)
  const fillTotalQty = new Map()
  for (const row of cleanPosRows) {
    const qty = parseInt(row['Paired Qty'] || row['qty'] || '1') || 1
    fillTotalQty.set(row['Buy Fill ID'],  (fillTotalQty.get(row['Buy Fill ID'])  || 0) + qty)
    fillTotalQty.set(row['Sell Fill ID'], (fillTotalQty.get(row['Sell Fill ID']) || 0) + qty)
  }

  const trades = cleanPosRows.map(row => {
    const symbol    = (row['Contract'] || row['symbol'] || 'UNKNOWN').trim()
    const qty       = parseInt(row['Paired Qty'] || row['qty'] || '1') || 1
    const buyPrice  = parseNum(row['Buy Price']  || row['buyPrice'])
    const sellPrice = parseNum(row['Sell Price'] || row['sellPrice'])
    const gross_pnl = parsePnl(row['P/L'] || row['pnl'] || '0')
    const boughtRaw = (row['Bought Timestamp'] || row['boughtTimestamp'] || '').trim()
    const soldRaw   = (row['Sold Timestamp']   || row['soldTimestamp']   || '').trim()

    const boughtDate = parseDate(boughtRaw)
    const soldDate   = parseDate(soldRaw)
    const side = (boughtDate && soldDate && new Date(boughtDate) > new Date(soldDate)) ? 'short' : 'long'

    const buyFillId  = row['Buy Fill ID']  || ''
    const sellFillId = row['Sell Fill ID'] || ''

    const buyTotalQty  = fillTotalQty.get(buyFillId)  || qty
    const sellTotalQty = fillTotalQty.get(sellFillId) || qty

    const bf = fillFees(buyFillId,  feeByTxnId, buyTotalQty,  perContractRate) * qty / buyTotalQty
    const sf = fillFees(sellFillId, feeByTxnId, sellTotalQty, perContractRate) * qty / sellTotalQty

    const fees    = Math.round((bf + sf) * 100) / 100
    const net_pnl = Math.round((gross_pnl - fees) * 100) / 100

    return {
      // The broker's own Pair ID for this round trip — a stable identity
      // that doesn't change even if how we compute fees/P&L later does, so
      // re-importing the same fill can correct it in place instead of
      // either duplicating it or (since the old dedupe key included pnl)
      // silently failing to update it. See storage.js's insertTrades.
      broker_id: row['Pair ID'] || null,
      symbol, qty, side,
      buy_price: buyPrice, sell_price: sellPrice,
      gross_pnl, fees, net_pnl, pnl: net_pnl,
      bought_at: openedAt(boughtRaw, soldRaw),
      sold_at:   closedAt(boughtRaw, soldRaw),
      duration: calcDuration(boughtRaw, soldRaw),
      notes: '', tags: [],
    }
  })

  return { trades, fundTransactions, cashEvents, errors, warnings }
}

/**
 * Detect CSV format: 'performance' | 'position' | 'cash' | 'unknown'
 */
export function detectCSVFormat(text) {
  const firstLine = text.trim().split(/\r?\n/)[0] || ''
  if (firstLine.includes('Buy Fill ID') || firstLine.includes('Sold Timestamp') || firstLine.includes('Bought Timestamp')) return 'position'
  if (firstLine.includes('Cash Change Type') || firstLine.includes('Trade Paired') || firstLine.includes('Exchange Fee')) return 'cash'
  if (firstLine.includes('Transaction ID') && firstLine.includes('Delta')) return 'cash'
  if (firstLine.includes('Total Realized PNL') || (firstLine.includes('Trade Date') && firstLine.includes('Total Amount'))) return 'balance'
  if (firstLine.includes('boughtTimestamp') || firstLine.includes('buyPrice')) return 'performance'
  const firstField = firstLine.split(',')[0].replace(/"/g, '').trim()
  if (/^\d{6,}$/.test(firstField)) return 'cash'
  return 'unknown'
}

// ─── Account_Balance_History.csv ─────────────────────────────────────────────

/**
 * Parse Account_Balance_History.csv to extract starting balance.
 * Columns: Account ID, Account Name, Trade Date, Total Amount, Total Realized PNL
 * Starting balance = first row's Total Amount - first row's Total Realized PNL
 */
export function parseBalanceHistory(text) {
  const rows = parseRows(text)
  if (!rows.length) return { rawStarting: null, earliestBalanceDate: null, errors: ['Empty file'] }

  const sorted = [...rows].sort((a, b) =>
    (a['Trade Date'] || '').localeCompare(b['Trade Date'] || '')
  )

  const first = sorted[0]
  const totalAmount = parseNum(first['Total Amount'])
  const totalPnl    = parseNum(first['Total Realized PNL'])
  const earliestBalanceDate = first['Trade Date']?.trim() || null

  if (totalAmount === null) return { rawStarting: null, earliestBalanceDate: null, errors: ['Could not parse Total Amount'] }

  // rawStarting = day1 amount - day1 PNL (fund transactions on day1 subtracted in balance store)
  const rawStarting = Math.round(((totalAmount || 0) - (totalPnl || 0)) * 100) / 100

  return { rawStarting, earliestBalanceDate, errors: [] }
}

/**
 * Extract Fund Transaction rows from Cash_History
 * Returns [{ date: 'yyyy-MM-dd', amount: number, type: 'deposit'|'withdrawal' }]
 */
const RELEVANT_EVENT_TYPES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission', 'Trade Paired', 'Fund Transaction'])

// Extract raw chronological cash events for drawdown/peak equity calculation
export function parseCashEvents(cashText) {
  const rows = parseRows(cashText)
  const events = []

  for (const row of rows) {
    const type = (row['Cash Change Type'] || '').trim()
    if (!RELEVANT_EVENT_TYPES.has(type)) continue

    const txnId = row['Transaction ID']
    const delta = parseNum(row['Delta'])
    if (delta === null) continue

    // Prefer Timestamp (full datetime) over Date (day only) for intraday ordering
    const rawTs = (row['Timestamp'] || row['Date'] || '').trim()
    const ts = parseDate(rawTs)
    if (!ts) continue

    events.push({
      id: txnId || `${type}-${ts}-${delta}`,
      timestamp: ts,
      type,
      delta,
    })
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export function parseFundTransactions(cashText) {
  const lines = cashText.trim().split(/\r?\n/)
  if (!lines.length) return []

  const firstCols = splitLine(lines[0], ',').map(c => c.trim().replace(/^"|"$/g, ''))
  const hasHeader = isNaN(Number(firstCols[0]))

  let idxDate, idxDelta, idxType
  if (hasHeader) {
    idxDate  = firstCols.findIndex(h => h === 'Date' || h === 'Timestamp')
    idxDelta = firstCols.findIndex(h => h === 'Delta')
    idxType  = firstCols.findIndex(h => h === 'Cash Change Type' || h === 'Type')
    // Prefer Date column (yyyy-MM-dd) over Timestamp
    const dateIdx = firstCols.findIndex(h => h === 'Date')
    if (dateIdx !== -1) idxDate = dateIdx
  } else {
    idxDate = 3; idxDelta = 4; idxType = 6
  }

  const txns = []
  const dataLines = hasHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = splitLine(line, ',').map(c => c.trim().replace(/^"|"$/g, ''))
    const type = (cols[idxType] || '').trim()
    if (type !== 'Fund Transaction') continue
    const amount = parseNum(cols[idxDelta]) || 0
    const date   = cols[idxDate] || ''
    if (!date) continue
    txns.push({
      date,
      amount,
      type: amount >= 0 ? 'deposit' : 'withdrawal',
    })
  }
  return txns
}
