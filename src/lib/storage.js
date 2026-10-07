/**
 * Storage Adapter — the ONLY place the app reads/writes trade data.
 *
 * Wired to Supabase (lib/supabaseAdapter.js). This file used to also hold
 * a localStorage-backed `localAdapter` (the original implementation,
 * before trades moved to the cloud) — removed since nothing imported it
 * any more; supabaseAdapter.js's own comments still reference its shape
 * (writeRaw/insertTrades/deleteTrades) for why certain things are done the
 * way they are, if you need the history.
 *
 * Interface every adapter must satisfy:
 *   loadTrades()                        → Promise<Trade[]>
 *   saveTrades(trades)                  → Promise<void>
 *   insertTrades(newTrades, existing)   → Promise<{ all: Trade[], records: Trade[], inserted: number, updated: number, skipped: number }>
 *   deleteTrade(id, existing)           → Promise<Trade[]>  (returns the remaining trades)
 *   deleteTrades(ids, existing)         → Promise<Trade[]>  (batch form — use for more than one id)
 *   updateTrade(id, patch, existing)    → Promise<Trade[]>  (returns the updated trades)
 *   clearAll()                          → Promise<void>
 */

export { supabaseAdapter as adapter } from './supabaseAdapter'
