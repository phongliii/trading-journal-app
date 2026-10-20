// A trade's note is stored as the note editor's HTML (QuillEditor). An
// emptied editor still leaves markup behind ("<p><br></p>"), so "has a note"
// means the note has actual text in it.

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

// The note as plain text, one line per paragraph/list item.
export function noteText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/blockquote|\/pre)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, e => ENTITIES[e.toLowerCase()] ?? e)
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
}

export function hasNote(trade) {
  return noteText(trade?.notes) !== ''
}

// First line of the note, shortened to `max` characters — for hover previews.
export function notePreview(html, max = 80) {
  const first = noteText(html).split('\n')[0] || ''
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}
