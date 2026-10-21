// One in-flight cloud load shared between callers — the sign-in sequence,
// a tab-focus refresh and a page's own reload can all ask at once, and
// should get one request, not three.
//
// Shared only for the SAME portfolio, though. It used to be shared
// regardless, so switching portfolio while a background refresh of the old
// one was still running handed the switch that old load: the new
// portfolio's data never loaded. A load for a different portfolio now
// starts once the running one finishes, so the newest one is written last.
//
//   const load = sharedLoad(() => accountsStore.activeAccountId, doLoad)
export function sharedLoad(getAccountId, doLoad) {
  let current = null // { accountId, promise }
  return function load() {
    const accountId = getAccountId()
    if (current && current.accountId === accountId) return current.promise
    const entry = { accountId }
    // Nothing running: start right away (doLoad reads the active portfolio
    // as it starts, so it mustn't be deferred past a switch).
    const started = current ? current.promise.catch(() => {}).then(() => doLoad()) : doLoad()
    entry.promise = started.finally(() => {
      if (current === entry) current = null
    })
    current = entry
    return entry.promise
  }
}
