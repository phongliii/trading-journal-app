/**
 * App-wide settings.
 *
 * Currently holds only UI prefs (dark mode, etc.).
 * When Supabase is added, extend this store with connection state —
 * no other file needs to change because the adapter swap in lib/storage.js
 * is the only wiring required.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

export const useSettingsStore = defineStore('settings', () => {
  // Reserved for future Supabase connection state:
  //   connected, connecting, connectionError, supabaseUrl, supabaseKey

  // UI settings (persisted)
  const compactMode = ref(localStorage.getItem('tj_compact') === 'true')

  function toggleCompact() {
    compactMode.value = !compactMode.value
    localStorage.setItem('tj_compact', String(compactMode.value))
    pushSettingsPatch({ compactMode: compactMode.value })
  }

  // lib/cloudSettings.js's sync-on-load calls these by name.
  function applyFromCloud(val) {
    compactMode.value = !!val
    localStorage.setItem('tj_compact', String(compactMode.value))
  }
  function toCloudValue() { return compactMode.value }

  return { compactMode, toggleCompact, applyFromCloud, toCloudValue }
})
