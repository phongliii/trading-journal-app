// Cloud sync for the small "settings blob" stores — holidays, tradeMeta
// (tags/strategies), tradingRules (cutoffTime), timezone, withdrawReminder,
// and settings (compactMode). Each of those stays exactly what it was (a
// Pinia store reading/writing localStorage synchronously, so every view
// that reads them keeps working instantly and offline) — this module adds
// a SECOND, opportunistic write to Supabase's single user_settings row
// alongside the existing localStorage one, plus a one-time pull on sign-in
// to reconcile with whatever's already in the cloud.
//
// balance.js and cashEvents.js are deliberately NOT included here, even
// though they're also "settings-ish" — fundTransactions and events are
// unbounded lists built from CSV imports (same shape problem as trades),
// not a handful of small scalars/arrays a human edits by hand. They'll get
// their own sync pass alongside raw_csv_archive instead of being squeezed
// into this blob.
//
// This deliberately isn't the same adapter-swap pattern trades uses
// (lib/storage.js) — rewriting seven call-everywhere stores to the async
// load()/save() shape would touch every view that reads them synchronously
// (v-model, computed defaults, etc.), for settings that are tiny, rarely
// written, and fine to end up eventually-consistent. A fire-and-forget push
// plus a pull-on-load gets real cross-device sync without that rewrite.
//
// NOT LIVE-TESTED, same caveat as supabaseAdapter.js — reasoned through
// against the schema, not confirmed against a real project from here.
//
// Known gap: pushSettingsPatch does a read-merge-write of the whole blob,
// not an atomic server-side merge. Two stores saving within the same
// instant (or two tabs/devices) could race and one write could clobber the
// other's key. Low-risk for how these stores are actually used (a human
// changing one setting at a time, not a bulk operation), but a Postgres
// function doing `data = data || patch` server-side would close the gap for
// real if it ever matters.

import { getSupabase } from './supabaseClient'

async function currentUserId(sb) {
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

// Fire-and-forget from each store's save() — merges `patch`'s keys into the
// user's cloud settings blob. Silently gives up if signed out or offline;
// localStorage already has the authoritative local copy either way, so a
// failed cloud push just means this device's change hasn't reached the
// cloud yet, not that it's lost.
export async function pushSettingsPatch(patch) {
  try {
    const sb = getSupabase()
    const userId = await currentUserId(sb)
    if (!userId) return

    const { data: row, error: readErr } = await sb
      .from('user_settings').select('data').eq('user_id', userId).maybeSingle()
    if (readErr) throw readErr

    const next = { ...(row?.data || {}), ...patch }
    const { error } = await sb
      .from('user_settings')
      .upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error
  } catch (e) {
    console.error('Could not sync settings to the cloud:', e)
  }
}

// Deletes the user's whole settings row (tags, strategies, rules, timezone,
// check-in questions, holidays...). Used by Settings → Reset; throws so the
// caller can stop before wiping anything local if the cloud delete failed.
export async function clearCloudSettings() {
  const sb = getSupabase()
  const userId = await currentUserId(sb)
  if (!userId) return
  const { error } = await sb.from('user_settings').delete().eq('user_id', userId)
  if (error) throw error
}

// Called once on sign-in (App.vue). Cloud wins for any key it already has
// (so a second device picks up what the first one set); any key the cloud
// is missing gets seeded from this device's current local value, so the
// very first sign-in on the very first device populates the cloud row
// instead of leaving it empty until something changes.
export async function syncSettingsOnLoad(stores) {
  try {
    const sb = getSupabase()
    const userId = await currentUserId(sb)
    if (!userId) return

    const { data: row, error } = await sb
      .from('user_settings').select('data').eq('user_id', userId).maybeSingle()
    if (error) throw error
    const cloud = row?.data || {}

    const seed = {}
    for (const [key, store] of Object.entries(stores)) {
      if (key in cloud) store.applyFromCloud(cloud[key])
      else seed[key] = store.toCloudValue()
    }
    if (Object.keys(seed).length) await pushSettingsPatch(seed)
  } catch (e) {
    console.error('Could not load cloud settings:', e)
  }
}
