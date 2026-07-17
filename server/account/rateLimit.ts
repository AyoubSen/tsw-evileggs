import type { NextFunction, Request, Response } from 'express'

type RateLimitEntry = { count: number; resetsAt: number }

export function fixedWindowRateLimit(
  limit: number,
  windowMs: number,
  keyFor: (request: Request, response: Response) => string,
) {
  const entries = new Map<string, RateLimitEntry>()

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now()
    const key = keyFor(request, response)
    let entry = entries.get(key)
    if (!entry || entry.resetsAt <= now) {
      entry = { count: 0, resetsAt: now + windowMs }
      entries.set(key, entry)
    }
    entry.count += 1
    if (entry.count > limit) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetsAt - now) / 1000))))
      response.status(429).json({
        error: { code: 'rate-limited', message: 'Too many requests. Try again later.' },
      })
      return
    }

    // Keep attacker-controlled key cardinality bounded without a background timer.
    if (entries.size > 10_000) {
      for (const [storedKey, storedEntry] of entries) {
        if (storedEntry.resetsAt <= now || entries.size > 10_000) entries.delete(storedKey)
        if (entries.size <= 10_000) break
      }
    }
    next()
  }
}
