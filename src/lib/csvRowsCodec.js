// Packs the raw CSV archive's rows (stores/rawCsvArchive.js) — and the cash
// events list (cashEventsAdapter.js), same shape — small enough to save in
// one request. As plain JSON every row repeats every column name, so
// a big Cash History (26k rows) came to ~6 MB and grew with each import —
// big enough for the cloud save to fail now and then. Packed, the same rows
// are ~0.3 MB: each row becomes a list of values in one shared column order,
// and the whole thing is gzipped and base64'd.
//
// Stored shape: { v: 2, keys: [...columns], gz: '<base64 gzip>' }. Anything
// else (the old plain array of row objects) is read as-is, so existing
// archives keep loading and are packed on their next save.

const ABSENT = {}
const isAbsent = v => v !== null && typeof v === 'object' && !Array.isArray(v)

async function gzipToBase64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function base64ToText(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

export async function packRows(rows) {
  // Every column any row has, in first-seen order — rows from different
  // files can differ, and none of their values may be lost.
  const keys = []
  const seen = new Set()
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k) }
  // A column a row doesn't have is written as {} (no value here is ever an
  // object), so a real null still comes back as null.
  const values = rows.map(r => keys.map(k => (k in r ? r[k] : ABSENT)))
  return { v: 2, keys, gz: await gzipToBase64(JSON.stringify(values)) }
}

export async function unpackRows(stored) {
  if (Array.isArray(stored)) return stored // old, unpacked
  if (!stored || stored.v !== 2) return []
  const values = JSON.parse(await base64ToText(stored.gz))
  return values.map(vals => {
    const row = {}
    stored.keys.forEach((k, i) => { if (!isAbsent(vals[i])) row[k] = vals[i] })
    return row
  })
}
