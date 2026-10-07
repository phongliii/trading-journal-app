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
