import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

const KEY = 'edgelog:withdrawReminder'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}

// Settings + fire-state for the "remind me to withdraw" toast.
// - enabled/amount: the user's settings.
// - lastShownDate: last date the toast actually fired, so a reload/revisit
//   the same day doesn't show it again.
// - weekKey/weekResolved: which week (its Monday, 'yyyy-MM-dd') is
//   currently being nagged about, and whether a withdrawal was already
//   seen for it — once resolved, no more toasts until the next week's
//   cycle starts fresh. See App.vue for the actual trigger check.
export const useWithdrawReminderStore = defineStore('withdrawReminder', () => {
  const saved = load() || { enabled: false, amount: null, lastShownDate: null, weekKey: null, weekResolved: false }

  const enabled       = ref(saved.enabled)
  const amount        = ref(saved.amount)
  const lastShownDate = ref(saved.lastShownDate)
  const weekKey        = ref(saved.weekKey ?? null)
  const weekResolved   = ref(saved.weekResolved ?? false)

  function save() {
    localStorage.setItem(KEY, JSON.stringify({
      enabled: enabled.value,
      amount: amount.value,
      lastShownDate: lastShownDate.value,
      weekKey: weekKey.value,
      weekResolved: weekResolved.value,
    }))
  }

  // Only enabled/amount are an actual "setting" worth syncing across
  // devices — lastShownDate/weekKey/weekResolved are per-device fire-state
  // for when the toast has already nagged this device this week, and
  // syncing those would mean dismissing the reminder on one device could
  // silently suppress it on another.
  function pushCloud() { pushSettingsPatch({ withdrawReminder: { enabled: enabled.value, amount: amount.value } }) }

  function setEnabled(v) { enabled.value = v; save(); pushCloud() }
  function setAmount(v)  { amount.value = v; save(); pushCloud() }
  function markShown(dateStr) { lastShownDate.value = dateStr; save() }

  // lib/cloudSettings.js's sync-on-load calls these by name.
  function applyFromCloud(val) {
    enabled.value = !!val?.enabled
    amount.value = val?.amount ?? null
    save()
  }
  function toCloudValue() { return { enabled: enabled.value, amount: amount.value } }

  // Called on every check with this week's Monday key. If it's a new week
  // compared to what's stored, resets the resolved flag so the cycle
  // starts over.
  function ensureWeek(key) {
    if (weekKey.value !== key) {
      weekKey.value = key
      weekResolved.value = false
      save()
    }
  }
  function markWeekResolved() { weekResolved.value = true; save() }

  return {
    enabled, amount, lastShownDate, weekKey, weekResolved,
    setEnabled, setAmount, markShown, ensureWeek, markWeekResolved,
    applyFromCloud, toCloudValue,
  }
})
