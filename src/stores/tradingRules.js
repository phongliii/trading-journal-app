import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'
import { tradingDayStart, DEFAULT_TRADING_DAY_START } from '@/lib/tradeDay'

const KEY = 'edgelog:tradingRules'
const DEFAULT_CUTOFF = '09:30'

// Strict 'HH:mm', 24h — matches the <input type="time"> this feeds (its
// native picker already only ever produces this shape), but `cutoffTime`
// also gets set from applyFromCloud() below, which trusts whatever another
// device last wrote. A malformed value there (or a hand-edited localStorage
// key) would silently break every cutoff comparison that assumes two
// zero-padded numbers separated by a colon.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
function isValidCutoff(v) { return typeof v === 'string' && TIME_RE.test(v) }

export const useTradingRulesStore = defineStore('tradingRules', () => {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}')

  const cutoffTime = ref(isValidCutoff(saved.cutoffTime) ? saved.cutoffTime : DEFAULT_CUTOFF)

  watch(cutoffTime, (v) => {
    if (!isValidCutoff(v)) {
      cutoffTime.value = DEFAULT_CUTOFF
      return
    }
    saveLocal()
    pushSettingsPatch({ cutoffTime: cutoffTime.value })
  })

  // lib/cloudSettings.js's sync-on-load calls these by name.
  function applyFromCloud(val) {
    cutoffTime.value = isValidCutoff(val) ? val : DEFAULT_CUTOFF
    saveLocal()
  }
  function toCloudValue() { return cutoffTime.value }

  // When a new trading day starts (lib/tradeDay.js): trades closed at or
  // after it count toward the next day. Lives in tradeDay.js's own ref so the
  // pure stats/balance code can read it; this store loads, saves and syncs it.
  if (isValidCutoff(saved.dayStart)) tradingDayStart.value = saved.dayStart
  function saveLocal() {
    localStorage.setItem(KEY, JSON.stringify({ cutoffTime: cutoffTime.value, dayStart: tradingDayStart.value }))
  }
  function setDayStart(v) {
    tradingDayStart.value = isValidCutoff(v) ? v : DEFAULT_TRADING_DAY_START
    saveLocal()
    pushSettingsPatch({ tradingDayStart: tradingDayStart.value })
  }
  // lib/cloudSettings.js's sync-on-load, under its own key.
  const dayStartSync = {
    applyFromCloud(val) {
      tradingDayStart.value = isValidCutoff(val) ? val : DEFAULT_TRADING_DAY_START
      saveLocal()
    },
    toCloudValue: () => tradingDayStart.value,
  }

  return { cutoffTime, applyFromCloud, toCloudValue, dayStart: tradingDayStart, setDayStart, dayStartSync }
})
