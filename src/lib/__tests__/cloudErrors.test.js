import { describe, it, expect, vi } from 'vitest'
import { loadWithRetry, reportLoadError } from '../cloudErrors.js'

describe('loadWithRetry', () => {
  it('tries once more after a failure', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce('ok')
    await expect(loadWithRetry(fn, 1)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('gives up after the second failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'))
    await expect(loadWithRetry(fn, 1)).rejects.toThrow('down')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('reportLoadError', () => {
  const quiet = () => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) }

  it('toasts a failed first load / new portfolio', () => {
    quiet(); const toast = { error: vi.fn() }
    reportLoadError(toast, new Error('x'), false, 'log', 'Could not load')
    expect(toast.error).toHaveBeenCalledWith('Could not load')
  })

  it('stays quiet for a failed background refresh of data already shown', () => {
    quiet(); const toast = { error: vi.fn() }
    reportLoadError(toast, new Error('x'), true, 'log', 'Could not load')
    expect(toast.error).not.toHaveBeenCalled()
  })
})
