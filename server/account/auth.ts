import { verifyToken } from '@clerk/backend'
import type { NextFunction, Request, Response } from 'express'

export function clerkBearerMiddleware(secretKey: string, authorizedParties: string[]) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const authorization = request.get('authorization')
    const match = authorization?.match(/^Bearer ([^\s]+)$/)
    if (!match) {
      response.status(401).json({ error: { code: 'unauthorized', message: 'A Clerk bearer token is required.' } })
      return
    }
    try {
      const payload = await verifyToken(match[1], { secretKey, authorizedParties })
      if (typeof payload.sub !== 'string' || !payload.sub.startsWith('user_')) throw new Error('Not a user session')
      response.locals.accountUserId = payload.sub
      next()
    } catch {
      response.status(401).json({ error: { code: 'unauthorized', message: 'The Clerk bearer token is invalid.' } })
    }
  }
}
