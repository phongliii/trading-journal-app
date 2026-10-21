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

// Rows (objects keyed by header) back into CSV text that parseRows reads.
export function toCsv(headers, rows) {
  const cell = v => (v === null || v === undefined ? '' : JSON.stringify(String(v)))
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map(h => cell(row[h])).join(','))
  return lines.join('\n')
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
 * type is the 1-contract case). The rate is a fallback in feesByFill() below,
 * for fills whose own fee rows are entirely missing from this export.
 */
function parseCashHistory(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return { feeByTxnId: new Map(), feeRowsByTime: new Map(), perContractRate: 0 }

  const FEE_TYPES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission'])
  const firstCols = splitLine(lines[0], ',').map(c => c.trim().replace(/^"|"$/g, ''))
  const hasHeader = isNaN(Number(firstCols[0]))

  let idxTxnId, idxDelta, idxType, idxTs, idxContract
  if (hasHeader) {
    idxTxnId    = firstCols.findIndex(h => h === 'Transaction ID')
    idxDelta    = firstCols.findIndex(h => h === 'Delta')
    idxType     = firstCols.findIndex(h => h === 'Cash Change Type' || h === 'Type')
    idxTs       = firstCols.findIndex(h => h === 'Timestamp')
    idxContract = firstCols.findIndex(h => h === 'Contract')
  } else {
    idxTxnId = 1; idxDelta = 4; idxType = 6; idxTs = 2; idxContract = 8
  }

  const feeByTxnId = new Map()
  // Fee rows by "timestamp|contract" — for fills whose rows are split by a
  // jump in the Transaction ID counter (see feesByFill).
  const feeRowsByTime = new Map()
  const minByType = new Map()
  const dataLines = hasHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = splitLine(line, ',').map(c => c.trim().replace(/^"|"$/g, ''))
    const type = (cols[idxType] || '').trim()
    if (!FEE_TYPES.has(type)) continue
    const txnId = parseInt(cols[idxTxnId])
    const amount = Math.abs(parseNum(cols[idxDelta]) || 0)
    if (!isNaN(txnId) && amount > 0) {
      feeByTxnId.set(txnId, amount)
      const key = `${(cols[idxTs] || '').trim()}|${(cols[idxContract] || '').trim()}`
      if (!feeRowsByTime.has(key)) feeRowsByTime.set(key, [])
      feeRowsByTime.get(key).push({ id: txnId, type, amount })
    }
    if (amount > 0 && (!minByType.has(type) || amount < minByType.get(type))) minByType.set(type, amount)
  }

  let perContractRate = 0
  for (const v of minByType.values()) perContractRate += v

  return { feeByTxnId, feeRowsByTime, perContractRate }
}

/**
 * Total fees per fill ID: { fillId → $ }. A fill has 4 fee rows (exchange,
 * clearing, NFA, commission) whose amounts already scale with its qty.
 *
 * 1. By ID: the first 4 fee rows within +10 of the fill ID (the broker can
 *    skip a few IDs).
 * 2. By time: the Transaction ID counter is exchange-wide and sometimes
 *    jumps by millions in the middle of a fill's rows (seen: two rows at
 *    …97999/…98000, the other two at 169403080xx). A fill still missing
 *    some fee types takes them from unclaimed fee rows with the same
 *    timestamp and contract.
 * 3. Estimate: a fill with no rows found at all gets qty × the per-contract
 *    rate derived from the rest of the file, rather than $0 (which would
 *    understate fees and overstate net P&L).
 *
 * fills: Map fillId → { qty, ts, contract }.
 */
function feesByFill(fills, { feeByTxnId, feeRowsByTime, perContractRate }) {
  const used = new Set()
  const found = new Map() // fillId → { total, types: Set }
  for (const [fillId] of fills) {
    const id = parseInt(fillId)
    const f = { total: 0, types: new Set() }
    found.set(fillId, f)
    if (isNaN(id)) continue
    for (let i = 1; i <= 10 && f.types.size < 4; i++) {
      const amt = feeByTxnId.get(id + i)
      if (amt === undefined || used.has(id + i)) continue
      used.add(id + i); f.total += amt; f.types.add(id + i)
    }
  }
  // Which fee type each matched row was — for "missing types" below.
  const typeOf = new Map()
  for (const rows of feeRowsByTime.values()) for (const r of rows) typeOf.set(r.id, r.type)
  const have = new Map([...found].map(([fillId, f]) => [fillId, new Set([...f.types].map(id => typeOf.get(id)))]))
  // Fills that already matched some rows by ID go first, so a fill at the
  // same second that matched none can't take the rows they're missing.
  const incomplete = [...fills.keys()].filter(fillId => have.get(fillId).size < 4)
    .sort((a, b) => have.get(b).size - have.get(a).size)
  for (const fillId of incomplete) {
    const { ts, contract } = fills.get(fillId), f = found.get(fillId), types = have.get(fillId)
    for (const r of feeRowsByTime.get(`${ts}|${contract}`) || []) {
      if (used.has(r.id) || types.has(r.type)) continue
      used.add(r.id); types.add(r.type); f.total += r.amount
    }
  }
  const result = new Map()
  for (const [fillId, { qty }] of fills) {
    result.set(fillId, have.get(fillId).size === 0 && qty > 0 ? perContractRate * qty : found.get(fillId).total)
  }
  return result
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
  // Fill IDs are how fees get matched to a trade at all (feesByFill below) —
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
  // bogus 0-qty fill to `fills`).
  const cleanPosRows = posRows.filter(row => {
    const blank = !(row['Contract'] || row['symbol']) &&
      !(row['Buy Fill ID'] || row['Sell Fill ID']) &&
      !(row['P/L'] || row['pnl'])
    return !blank
  })
  const blankRows = posRows.length - cleanPosRows.length
  if (blankRows > 0) warnings.push(`Skipped ${blankRows} blank/unreadable row${blankRows !== 1 ? 's' : ''}`)

  // No Cash History at all (a Position-only import with nothing saved to
  // take fees from) → trades with $0 fees. A Cash file WITH no fee rows is
  // still rejected — that's the wrong file, not a missing one.
  const cashFees = cashText ? parseCashHistory(cashText) : { feeByTxnId: new Map(), feeRowsByTime: new Map(), perContractRate: 0 }
  if (cashText && !cashFees.feeByTxnId.size) {
    errors.push('Cash_History.csv is empty or no fee rows found')
    return { trades: [], fundTransactions: [], cashEvents: [], errors, warnings }
  }

  // Extract fund transactions automatically
  const fundTransactions = cashText ? parseFundTransactions(cashText) : []

  // Extract raw chronological cash events for drawdown/peak equity
  const cashEvents = cashText ? parseCashEvents(cashText) : []

  // Every fill with its total Paired Qty (fees are split by qty), time and
  // contract, then each fill's total fees.
  const fills = new Map()
  for (const row of cleanPosRows) {
    const qty = parseInt(row['Paired Qty'] || row['qty'] || '1') || 1
    const contract = (row['Contract'] || '').trim()
    for (const [fillId, ts] of [[row['Buy Fill ID'], row['Bought Timestamp']], [row['Sell Fill ID'], row['Sold Timestamp']]]) {
      const f = fills.get(fillId) || { qty: 0, ts: (ts || '').trim(), contract }
      f.qty += qty
      fills.set(fillId, f)
    }
  }
  const fillFeeTotal = feesByFill(fills, cashFees)

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

    const buyTotalQty  = fills.get(buyFillId)?.qty  || qty
    const sellTotalQty = fills.get(sellFillId)?.qty || qty

    const bf = (fillFeeTotal.get(buyFillId)  || 0) * qty / buyTotalQty
    const sf = (fillFeeTotal.get(sellFillId) || 0) * qty / sellTotalQty

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

// Cash History rows that belong to trades (fees, P&L) — everything else
// that moves money is a deposit/withdrawal or an account charge.
const TRADING_CASH_TYPES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission', 'Trade Paired'])

/**
 * Extract Fund Transaction rows from Cash_History, plus account charges or
 * credits that aren't trading (type 'fee' / 'credit', with the broker's
 * `label`, e.g. "Dormant Fee")
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

  let idxDate, idxDelta, idxType, idxTxnId
  if (hasHeader) {
    idxTxnId = firstCols.findIndex(h => h === 'Transaction ID')
    idxDate  = firstCols.findIndex(h => h === 'Date' || h === 'Timestamp')
    idxDelta = firstCols.findIndex(h => h === 'Delta')
    idxType  = firstCols.findIndex(h => h === 'Cash Change Type' || h === 'Type')
    // Prefer Date column (yyyy-MM-dd) over Timestamp
    const dateIdx = firstCols.findIndex(h => h === 'Date')
    if (dateIdx !== -1) idxDate = dateIdx
  } else {
    idxTxnId = 1; idxDate = 3; idxDelta = 4; idxType = 6
  }

  const txns = []
  const dataLines = hasHeader ? lines.slice(1) : lines

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = splitLine(line, ',').map(c => c.trim().replace(/^"|"$/g, ''))
    const type = (cols[idxType] || '').trim()
    if (TRADING_CASH_TYPES.has(type)) continue
    const amount = parseNum(cols[idxDelta]) || 0
    const date   = cols[idxDate] || ''
    if (!date) continue
    const isFund = type === 'Fund Transaction'
    // Any other row is an account charge or credit that isn't trading,
    // e.g. a $35 "Dormant Fee" for an inactive month — it changes the
    // balance, so it's kept (labelled with the broker's own name for it).
    if (!isFund && !amount) continue
    txns.push({
      // The broker's Transaction ID — what tells two same-day, same-amount
      // deposits/withdrawals apart (see mergeFundTransactions).
      id: (idxTxnId >= 0 && cols[idxTxnId]) || null,
      date,
      amount,
      type: isFund ? (amount >= 0 ? 'deposit' : 'withdrawal') : (amount < 0 ? 'fee' : 'credit'),
      ...(isFund ? {} : { label: type }),
    })
  }
  return txns
}
