import type { NextFunction, Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixedWindowRateLimit } from './rateLimit'

const responseStub = () => {
  const response = {
    set: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

describe('fixedWindowRateLimit', () => {
  afterEach(() => vi.useRealTimers())

  it('limits each key independently and includes the remaining window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const middleware = fixedWindowRateLimit(2, 5_000, (request) => request.ip ?? 'unknown')
    const next = vi.fn() as NextFunction
    const firstResponse = responseStub()

    middleware({ ip: 'one' } as Request, firstResponse, next)
    middleware({ ip: 'one' } as Request, firstResponse, next)
    middleware({ ip: 'one' } as Request, firstResponse, next)
    middleware({ ip: 'two' } as Request, responseStub(), next)

    expect(next).toHaveBeenCalledTimes(3)
    expect(firstResponse.set).toHaveBeenCalledWith('Retry-After', '5')
    expect(firstResponse.status).toHaveBeenCalledWith(429)
    expect(firstResponse.json).toHaveBeenCalledWith({
      error: { code: 'rate-limited', message: 'Too many requests. Try again later.' },
    })
  })

  it('opens a new fixed window at the reset boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const middleware = fixedWindowRateLimit(1, 5_000, () => 'user')
    const next = vi.fn() as NextFunction

    middleware({} as Request, responseStub(), next)
    middleware({} as Request, responseStub(), next)
    vi.setSystemTime(6_000)
    middleware({} as Request, responseStub(), next)

    expect(next).toHaveBeenCalledTimes(2)
  })
})
