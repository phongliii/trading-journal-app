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

// Editor HTML with anything in it: text, or a pasted image.
export function hasContent(html) {
  return noteText(html) !== '' || /<img\b/i.test(html || '')
}

// A trade "has a note" when its note has content or it has a chart image.
export function hasNote(trade) {
  return hasContent(trade?.notes) || !!trade?.chartImage
}

// First line of the note, shortened to `max` characters — for hover previews.
export function notePreview(html, max = 80) {
  const first = noteText(html).split('\n')[0] || ''
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}

// Hover text for a trade's note icon: the note's first line, and/or that
// there's a chart image.
export function noteTooltip(trade) {
  const text = notePreview(trade?.notes)
  if (!trade?.chartImage) return text
  return text ? `${text} (+ chart image)` : 'Chart image'
}
