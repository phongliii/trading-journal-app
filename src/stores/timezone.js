import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

const TZ_KEY = 'edgelog:timezone'

export const useTimezoneStore = defineStore('timezone', () => {
  const autoDetect  = ref(JSON.parse(localStorage.getItem(TZ_KEY + ':auto') ?? 'true'))
  const manualTz    = ref(localStorage.getItem(TZ_KEY + ':manual') || '')

  const browserTz   = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timezone    = computed(() => autoDetect.value ? browserTz : (manualTz.value || browserTz))

  // Human-readable name for current timezone
  const timezoneName = computed(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZoneName: 'long', timeZone: timezone.value })
        .formatToParts(new Date())
        .find(p => p.type === 'timeZoneName')?.value || timezone.value
    } catch { return timezone.value }
  })

  function setAuto(val) {
    autoDetect.value = val
    localStorage.setItem(TZ_KEY + ':auto', JSON.stringify(val))
    pushSettingsPatch({ timezone: { autoDetect: autoDetect.value, manualTz: manualTz.value } })
  }

  function setManual(tz) {
    manualTz.value = tz
    localStorage.setItem(TZ_KEY + ':manual', tz)
    pushSettingsPatch({ timezone: { autoDetect: autoDetect.value, manualTz: manualTz.value } })
  }

  // lib/cloudSettings.js's sync-on-load calls these by name.
  function applyFromCloud(val) {
    autoDetect.value = !!val?.autoDetect
    manualTz.value = val?.manualTz || ''
    localStorage.setItem(TZ_KEY + ':auto', JSON.stringify(autoDetect.value))
    localStorage.setItem(TZ_KEY + ':manual', manualTz.value)
  }
  function toCloudValue() { return { autoDetect: autoDetect.value, manualTz: manualTz.value } }

  // Get today's date in the user's timezone as yyyy-MM-dd
  function localDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone.value }).format(date)
  }

  // Get today's date in the user's timezone as a JS Date object at local midnight.
  // Safe to use with getDay(), startOfWeek(), etc. — unlike new Date(localDate()),
  // this never round-trips through UTC, so it can't shift to the wrong weekday
  // for users in timezones behind UTC.
  function localDateObj(date = new Date()) {
    const [y, m, d] = localDate(date).split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  return {
    autoDetect, manualTz, timezone, timezoneName, browserTz, setAuto, setManual, localDate, localDateObj,
    applyFromCloud, toCloudValue,
  }
})
