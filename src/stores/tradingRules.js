import { defineStore } from 'pinia'
import { pushSettingsPatch } from '@/lib/cloudSettings'
import { tradingDayStart, DEFAULT_TRADING_DAY_START } from '@/lib/tradeDay'

const KEY = 'edgelog:tradingRules'

// Strict 'HH:mm', 24h. The value can also come from the cloud
// (dayStartSync.applyFromCloud), which trusts whatever another device last
// wrote, or a hand-edited localStorage key — anything else falls back to the
// default rather than break the 'HH:mm' string comparisons in tradeDay.js.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const isValidTime = v => typeof v === 'string' && TIME_RE.test(v)

export const useTradingRulesStore = defineStore('tradingRules', () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { /* ignore */ }

  // When a new trading day starts (lib/tradeDay.js): trades closed at or
  // after it count toward the next day. Lives in tradeDay.js's own ref so the
  // pure stats/balance code can read it; this store loads, saves and syncs it.
  if (isValidTime(saved.dayStart)) tradingDayStart.value = saved.dayStart
  function saveLocal() {
    localStorage.setItem(KEY, JSON.stringify({ dayStart: tradingDayStart.value }))
  }
  function setDayStart(v) {
    tradingDayStart.value = isValidTime(v) ? v : DEFAULT_TRADING_DAY_START
    saveLocal()
    pushSettingsPatch({ tradingDayStart: tradingDayStart.value })
  }
  // lib/cloudSettings.js's sync-on-load, under the `tradingDayStart` key.
  const dayStartSync = {
    applyFromCloud(val) {
      tradingDayStart.value = isValidTime(val) ? val : DEFAULT_TRADING_DAY_START
      saveLocal()
    },
    toCloudValue: () => tradingDayStart.value,
  }

  return { dayStart: tradingDayStart, setDayStart, dayStartSync }
})
