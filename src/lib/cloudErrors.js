// Every cloud-only store (balance.js, cashEvents.js, rawCsvArchive.js,
// journal.js, trades.js) follows the same shape in its catch blocks: log
// the real error for debugging, then toast a human-readable version for
// the person, since none of these stores keep a local fallback copy to
// quietly recover from a failed load/save — the toast IS how a failure
// here gets noticed at all. The two message strings differ store to
// store (and sometimes call to call, e.g. rawCsvArchive's per-kind
// messages), so this doesn't templatize the wording itself — it just
// collapses the repeated "log it, then show it" structure around
// whatever wording each call site already wants.
export function reportCloudError(toast, e, consoleMessage, toastMessage) {
  console.error(consoleMessage, e)
  toast.error(toastMessage)
}

// A cloud load, tried once more after a short pause if it fails — a
// background refresh right as the tab wakes up (connection not back yet,
// sign-in token being renewed) often fails once and works a moment later.
export async function loadWithRetry(fn, delayMs = 1500) {
  try {
    return await fn()
  } catch {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    return fn()
  }
}

// For a failed load. `refreshing` = it was a background refresh of data
// that's already on screen for this same portfolio: that's logged only —
// the data shown is still right and the next refresh tries again. A first
// load, or a load for a newly selected portfolio, still gets the toast,
// since otherwise the wrong (or no) data would be on screen silently.
export function reportLoadError(toast, e, refreshing, consoleMessage, toastMessage) {
  if (refreshing) { console.warn(consoleMessage, e); return }
  reportCloudError(toast, e, consoleMessage, toastMessage)
}
