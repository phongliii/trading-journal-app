import { defineStore } from 'pinia'
import { ref } from 'vue'

const DB_NAME = 'edgelog-filesystem'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'chartImageFolder'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveHandleToDb(handle) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadHandleFromDb() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export const useImageStorageStore = defineStore('imageStorage', () => {
  const isSupported = typeof window.showDirectoryPicker === 'function'
  const dirHandle = ref(null)
  const folderName = ref('')
  const needsPermission = ref(false)
  const restoring = ref(true)
  const imageCount = ref(0)
  const imageTotalBytes = ref(0)

  // Cache of blob URLs we've created, so we don't re-read/re-create repeatedly
  const urlCache = new Map()

  async function restore() {
    restoring.value = true
    if (!isSupported) { restoring.value = false; return }
    try {
      const saved = await loadHandleFromDb()
      if (!saved) { restoring.value = false; return }
      dirHandle.value = saved
      folderName.value = saved.name
      const perm = await saved.queryPermission({ mode: 'readwrite' })
      needsPermission.value = perm !== 'granted'
    } catch (e) {
      console.error('Could not restore image folder:', e)
    } finally {
      restoring.value = false
    }
  }

  async function chooseFolder() {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      dirHandle.value = handle
      folderName.value = handle.name
      needsPermission.value = false
      await saveHandleToDb(handle)
      return true
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e)
      return false
    }
  }

  async function reconnect() {
    if (!dirHandle.value) return false
    try {
      const perm = await dirHandle.value.requestPermission({ mode: 'readwrite' })
      needsPermission.value = perm !== 'granted'
      return perm === 'granted'
    } catch (e) {
      console.error(e)
      return false
    }
  }

  // Fully disconnect the folder — clears in-memory state AND the persisted
  // handle, so it won't be restored on next load either.
  async function clearFolder() {
    dirHandle.value = null
    folderName.value = ''
    needsPermission.value = false
    urlCache.forEach(url => URL.revokeObjectURL(url))
    urlCache.clear()
    try {
      const db = await openDb()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (e) {
      console.error('Could not clear saved folder handle:', e)
    }
  }

  // Recomputes the file count and total size of the connected folder, for
  // the stat tiles in Settings. Safe to call whenever the folder changes.
  async function refreshStats() {
    if (!dirHandle.value || needsPermission.value) {
      imageCount.value = 0
      imageTotalBytes.value = 0
      return
    }
    let count = 0, bytes = 0
    try {
      for await (const [, handle] of dirHandle.value.entries()) {
        if (handle.kind !== 'file') continue
        count++
        try {
          const file = await handle.getFile()
          bytes += file.size
        } catch {
          // file vanished mid-scan — skip it
        }
      }
    } catch (e) {
      console.error('Could not read image folder stats:', e)
    }
    imageCount.value = count
    imageTotalBytes.value = bytes
  }

  // Deletes every file in the connected folder (but keeps the folder
  // connected). Callers are responsible for also clearing any references to
  // those files elsewhere (journal entries store the filename separately).
  async function clearAllImages() {
    if (!dirHandle.value || needsPermission.value) throw new Error('No folder connected')
    for await (const [name, handle] of dirHandle.value.entries()) {
      if (handle.kind !== 'file') continue
      try { await dirHandle.value.removeEntry(name) } catch (e) { console.error('Could not delete', name, e) }
    }
    urlCache.forEach(url => URL.revokeObjectURL(url))
    urlCache.clear()
    await refreshStats()
  }

  // Save a File into the connected folder, prefixed with the given date key,
  // returns the saved filename (to store as the reference on the journal entry).
  async function saveImage(dateKey, file) {
    if (!dirHandle.value || needsPermission.value) throw new Error('No folder connected')
    const safeName = `${dateKey}_${Date.now()}_${file.name}`.replace(/\s+/g, '_')
    const fileHandle = await dirHandle.value.getFileHandle(safeName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
    return safeName
  }

  // Delete a real file from the folder (used when removing an attached image)
  async function deleteImage(filename) {
    if (!dirHandle.value || !filename) return false
    try {
      await dirHandle.value.removeEntry(filename)
      urlCache.delete(filename)
      return true
    } catch (e) {
      console.error('Could not delete image file:', e)
      urlCache.delete(filename)
      return false
    }
  }

  // Returns a blob URL for the given filename, or null if the file can't be found.
  async function getImageUrl(filename) {
    if (!filename || !dirHandle.value || needsPermission.value) return null
    if (urlCache.has(filename)) return urlCache.get(filename)
    try {
      const fileHandle = await dirHandle.value.getFileHandle(filename)
      const file = await fileHandle.getFile()
      const url = URL.createObjectURL(file)
      urlCache.set(filename, url)
      return url
    } catch (e) {
      return null // file missing — caller shows the broken state
    }
  }

  return {
    isSupported, dirHandle, folderName, needsPermission, restoring, imageCount, imageTotalBytes,
    restore, chooseFolder, reconnect, clearFolder, saveImage, deleteImage, getImageUrl,
    refreshStats, clearAllImages,
  }
})
