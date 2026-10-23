// Settings → Reset: deletes the chosen kinds of data from one portfolio or
// all of them, and optionally the settings every portfolio shares. Cloud
// first, stopping at the first failure — so a half-failed reset never wipes
// this browser's copy and can simply be run again — then this browser's
// cached copy of whatever was deleted (resetLocal).
import { adapter as tradesAdapter } from './storage'
import { balanceAdapter } from './balanceAdapter'
import { cashEventsAdapter } from './cashEventsAdapter'
import { journalAdapter } from './journalAdapter'
import { rawCsvArchiveAdapter } from './rawCsvArchiveAdapter'
import { clearCloudSettings } from './cloudSettings'

// What can be deleted per portfolio, in the order it's done.
export const RESET_PARTS = [
  { id: 'trades',  label: 'Trades' },
  { id: 'balance', label: 'Balance, deposits & account fees' },
  { id: 'cash',    label: 'Cash history', hint: 'used for drawdown' },
  { id: 'journal', label: 'Journal notes, check-ins & read marks' },
  { id: 'csv',     label: 'Backed-up CSV files', hint: 'later imports read fees from these' },
]

const CLEAR = {
  trades:  id => tradesAdapter.clearAll(id),
  balance: id => balanceAdapter.save(id, { rawStarting: null, earliestBalanceDate: null, fundTransactions: [] }),
  cash:    id => cashEventsAdapter.save(id, []),
  journal: id => journalAdapter.clearAll(id),
  csv:     id => rawCsvArchiveAdapter.clearAll(id),
}

// accounts: [{ id, name }] to reset; parts: RESET_PARTS ids; settings: also
// delete the shared settings. step(label) reports progress (useBusy).
export async function resetCloud({ accounts, parts, settings }, step = () => {}) {
  for (const account of accounts) {
    for (const p of RESET_PARTS.filter(p => parts.includes(p.id))) {
      step(accounts.length > 1 ? `${p.label} — ${account.name}` : p.label)
      await CLEAR[p.id](account.id)
    }
  }
  if (settings) {
    step('Settings')
    await clearCloudSettings()
  }
}

export const resetStepCount = ({ accounts, parts, settings }) =>
  accounts.length * RESET_PARTS.filter(p => parts.includes(p.id)).length + (settings ? 1 : 0)

// This browser's cached copies: a deleted portfolio's journal read marks, the
// pre-cloud journal copy (it would otherwise be "recovered" back into the
// cloud on the next load), and — with settings — every cached preference.
// Never the sign-in (sb-…), which portfolio is open, or other portfolios'
// read marks.
export function resetLocal({ accounts, parts, settings }, storage = localStorage) {
  const resetIds = new Set(accounts.map(a => a.id))
  const readKey = /^edgelog:journal:read:(.+)$/
  for (const key of Object.keys(storage)) {
    const read = key.match(readKey)
    if (read) {
      if (parts.includes('journal') && resetIds.has(read[1])) storage.removeItem(key)
    } else if (key === 'edgelog:journal') {
      if (parts.includes('journal')) storage.removeItem(key)
    } else if (settings && key.startsWith('edgelog:') && key !== 'edgelog:activeAccountId') {
      storage.removeItem(key)
    }
  }
}
