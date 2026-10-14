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
// When it fires is decided by lib/withdrawReminder.js (see App.vue).
export const useWithdrawReminderStore = defineStore('withdrawReminder', () => {
  const saved = load() || { enabled: false, amount: null, lastShownDate: null }

  const enabled       = ref(saved.enabled)
  const amount        = ref(saved.amount)
  const lastShownDate = ref(saved.lastShownDate)

  function save() {
    localStorage.setItem(KEY, JSON.stringify({
      enabled: enabled.value,
      amount: amount.value,
      lastShownDate: lastShownDate.value,
    }))
  }

  // Only enabled/amount are an actual "setting" worth syncing across
  // devices — lastShownDate is per-device fire-state for when the toast
  // has already nagged this device today, and
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

  return {
    enabled, amount, lastShownDate,
    setEnabled, setAmount, markShown,
    applyFromCloud, toCloudValue,
  }
})
