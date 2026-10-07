import { ref } from 'vue'

const toasts = ref([])
let nextId = 0

export function useToast() {
  // duration = 0 means "stays up until something calls dismiss(id) itself"
  // — used for loading(), which has no fixed end time since it's tracking
  // an in-flight cloud call rather than announcing something that already
  // happened.
  function push(msg, type = 'success', duration = 4000) {
    const id = ++nextId
    toasts.value.push({ id, msg, type })
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return {
    toasts,
    success: (msg) => push(msg, 'success'),
    error:   (msg) => push(msg, 'error'),
    info:    (msg) => push(msg, 'info'),
    warn:    (msg) => push(msg, 'warn'),
    // Returns the toast's id — callers hang onto it and call dismiss(id)
    // once the work it was tracking finishes (CSV imports now write
    // several things to Supabase in sequence, which can take a few
    // seconds; this is the "something is happening" indicator for that
    // window, where before everything was local and instant enough not
    // to need one).
    loading: (msg) => push(msg, 'loading', 0),
    dismiss,
  }
}
