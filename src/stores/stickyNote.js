import { defineStore } from 'pinia'
import { ref } from 'vue'
import { pushSettingsPatch } from '@/lib/cloudSettings'

// The sidebar sticky note (components/layout/StickyNote.vue) — a short
// trading plan kept in view, shared by every portfolio. Stored in the synced
// settings (lib/cloudSettings.js, key `stickyNote`) so it follows you to other
// devices without a table of its own; this browser keeps a copy for an
// instant first paint.
const KEY = 'edgelog:stickyNote'

export const useStickyNoteStore = defineStore('stickyNote', () => {
  let saved = ''
  try { saved = localStorage.getItem(KEY) || '' } catch { /* ignore */ }
  const text = ref(saved)

  function saveLocal() {
    try { localStorage.setItem(KEY, text.value) } catch { /* ignore */ }
  }

  function setText(value) {
    text.value = value.replace(/\s+$/, '')
    saveLocal()
    pushSettingsPatch({ stickyNote: text.value })
  }

  // lib/cloudSettings.js's sync-on-load calls these by name.
  function applyFromCloud(val) {
    text.value = typeof val === 'string' ? val : ''
    saveLocal()
  }
  function toCloudValue() { return text.value }

  return { text, setText, applyFromCloud, toCloudValue }
})
