// Works out what a CSV import does from whichever files were dropped —
// Position History, Cash History, or both — using the rows saved by earlier
// imports (stores/rawCsvArchive) to fill in what's missing:
//
//   Position only → adds/updates trades, fees from the Cash History already
//                   saved (so re-importing never wipes fees to $0).
//   Cash only     → deposits/withdrawals + cash events, and fees refreshed
//                   on trades you already have, matched through the saved
//                   Position History rows (trades don't keep fill IDs).
//                   Never adds trades.
//   Both          → the two above together.
//
// Pure: no stores, so it can be tested on its own.

import { parseRows, parseDualCSV, parseFundTransactions, parseCashEvents, toCsv } from './csvParser.js'

const isHeaderless = text => !isNaN(Number((text.trim().split(/\r?\n/)[0] || '').split(',')[0].replace(/"/g, '').trim()))

// The new Cash file's rows on top of the saved ones, as one CSV text — so
// fees can be found for fills from any import, not just this file's dates.
function combinedCash(cashText, saved) {
  const savedRows = saved?.rows || []
  if (cashText && isHeaderless(cashText)) return cashText // can't merge by column name
  if (!savedRows.length) return cashText || ''
  const newRows = cashText ? parseRows(cashText) : []
  const headers = [...new Set([...(saved.headers || []), ...newRows.flatMap(r => Object.keys(r))])]
  return toCsv(headers, [...savedRows, ...newRows])
}

// Fee rows the parser recognises — without any, fees can't be worked out.
function hasFeeRows(text) {
  return !!text && /Exchange Fee|Clearing Fee|Nfa Fee|Commission/.test(text)
}

/**
 * @param {object} p
 * @param {string|null} p.positionText  new Position History file, if any
 * @param {string|null} p.cashText      new Cash History file, if any
 * @param {{headers,rows}} p.savedPosition  rows saved by earlier imports
 * @param {{headers,rows}} p.savedCash
 * @param {Array} p.existingTrades      trades already in the journal
 * @returns {{ trades, newTradeCount, refreshCount, fundTransactions, cashEvents, errors, warnings }}
 *   trades — what to pass to insertTrades: the new file's trades plus, when
 *   a Cash file came in, existing trades re-derived with the new fees.
 */
export function buildTradeImport({ positionText = null, cashText = null, savedPosition, savedCash, existingTrades = [] }) {
  const errors = [], warnings = []
  const feeCash = combinedCash(cashText, savedCash)
  const feeText = hasFeeRows(feeCash) ? feeCash : ''

  // Deposits/withdrawals and cash events come from the new Cash file only —
  // the saved rows were already recorded when they were imported.
  const fundTransactions = cashText ? parseFundTransactions(cashText) : []
  const cashEvents = cashText ? parseCashEvents(cashText) : []

  let fileTrades = []
  if (positionText) {
    const r = parseDualCSV(positionText, feeText)
    errors.push(...r.errors)
    warnings.push(...r.warnings)
    fileTrades = r.trades
  }

  // Existing trades whose fees the new Cash file can now fill in.
  let refreshed = []
  const byBrokerId = new Map(existingTrades.filter(t => t.broker_id).map(t => [String(t.broker_id), t]))
  if (cashText && feeText && savedPosition?.rows?.length) {
    const inFile = new Set(fileTrades.map(t => String(t.broker_id)))
    const savedText = toCsv(savedPosition.headers, savedPosition.rows)
    refreshed = parseDualCSV(savedText, feeText).trades
      .filter(t => t.broker_id && byBrokerId.has(String(t.broker_id)) && !inFile.has(String(t.broker_id)))
  }

  // Never replace fees a trade already has with $0 — that only means no
  // fee rows were available this time, not that the trade had none.
  const trades = [...fileTrades, ...refreshed].map(t => {
    const old = byBrokerId.get(String(t.broker_id))
    if (!old || t.fees > 0 || !(old.fees > 0)) return t
    const net = Math.round((t.gross_pnl - old.fees) * 100) / 100
    return { ...t, fees: old.fees, net_pnl: net, pnl: net }
  })

  return {
    trades,
    newTradeCount: fileTrades.length,
    refreshCount: refreshed.length,
    fundTransactions, cashEvents, errors, warnings,
  }
}

