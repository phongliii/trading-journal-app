import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

const HOLIDAY_KEY = 'edgelog:holidays'

export const useHolidayStore = defineStore('holidays', () => {
  // Store as array for reactivity, convert to Set for lookups
  const holidayList = ref(JSON.parse(localStorage.getItem(HOLIDAY_KEY) || '[]'))

  function save() {
    localStorage.setItem(HOLIDAY_KEY, JSON.stringify(holidayList.value))
    pushSettingsPatch({ holidays: holidayList.value })
  }

  // lib/cloudSettings.js's sync-on-load calls these by name (see
  // syncSettingsOnLoad) — not used by anything in this file itself.
  function applyFromCloud(list) {
    holidayList.value = list
    localStorage.setItem(HOLIDAY_KEY, JSON.stringify(holidayList.value))
  }
  function toCloudValue() { return holidayList.value }

  function isHoliday(dateStr) {
    return holidayList.value.includes(dateStr)
  }

  function toggleHoliday(dateStr) {
    const idx = holidayList.value.indexOf(dateStr)
    if (idx >= 0) holidayList.value.splice(idx, 1)
    else holidayList.value.push(dateStr)
    save()
  }

  function markHoliday(dateStr) {
    if (!holidayList.value.includes(dateStr)) { holidayList.value.push(dateStr); save() }
  }

  function removeHoliday(dateStr) {
    const idx = holidayList.value.indexOf(dateStr)
    if (idx >= 0) { holidayList.value.splice(idx, 1); save() }
  }

  function clearAll() {
    holidayList.value = []
    save()
  }

  return { holidayList, isHoliday, toggleHoliday, markHoliday, removeHoliday, clearAll, applyFromCloud, toCloudValue }
})
