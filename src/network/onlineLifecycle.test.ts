import { describe, expect, it, vi } from 'vitest'
import { once } from '../shared/once'
import {
  OnlineLifecycleCancellation,
  OnlineSessionGenerationGuard,
  isOnlineLifecycleCancellation,
  throwIfOnlineStartupAborted,
} from './onlineLifecycle'

describe('online lifecycle cancellation', () => {
  it('invalidates stale session callbacks', () => {
    const guard = new OnlineSessionGenerationGuard()
    const first = guard.begin()
    expect(guard.isCurrent(first)).toBe(true)
    guard.invalidate()
    expect(guard.isCurrent(first)).toBe(false)
    const second = guard.begin()
    expect(guard.isCurrent(second)).toBe(true)
  })

  it('classifies aborted startup as a silent lifecycle cancellation', () => {
    const controller = new AbortController()
    controller.abort()
    try {
      throwIfOnlineStartupAborted(controller.signal)
      throw new Error('Expected cancellation')
    } catch (caught) {
      expect(isOnlineLifecycleCancellation(caught)).toBe(true)
      expect((caught as OnlineLifecycleCancellation).code).toBe('aborted-startup')
    }
  })

  it('uses the idempotent disposer used by GameHost exactly once', () => {
    const callback = vi.fn()
    const dispose = once(callback)
    dispose()
    dispose()
    expect(callback).toHaveBeenCalledOnce()
  })
})
