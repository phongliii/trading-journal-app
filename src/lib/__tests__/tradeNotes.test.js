import { describe, it, expect } from 'vitest'
import { noteText, hasNote, notePreview } from '../tradeNotes.js'

describe('trade notes', () => {
  it('an empty or emptied editor is not a note', () => {
    for (const notes of [undefined, null, '', '<p><br></p>', '<p> </p><p>&nbsp;</p>', '<ul><li><br></li></ul>']) {
      expect(hasNote({ notes })).toBe(false)
    }
  })

  it('any real text is a note', () => {
    expect(hasNote({ notes: '<p>Chased it</p>' })).toBe(true)
    expect(hasNote({ notes: 'plain text' })).toBe(true)
  })

  it('turns the editor HTML into plain lines', () => {
    expect(noteText('<p>Waited for <strong>VWAP</strong> &amp; held</p><p><br></p><ul><li>Rule #2</li></ul>'))
      .toBe('Waited for VWAP & held\nRule #2')
  })

  it('previews the first line, shortened', () => {
    expect(notePreview('<p>First line</p><p>Second</p>')).toBe('First line')
    expect(notePreview('<p>' + 'x'.repeat(100) + '</p>', 20)).toBe('x'.repeat(19) + '…')
  })
})
