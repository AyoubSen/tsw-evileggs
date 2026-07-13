import cors from 'cors'
import { matchMaker } from '@colyseus/core'
import { isAllowedOrigin } from './environment'

const ALLOWED_METHODS = ['GET', 'POST']
const ALLOWED_HEADERS = ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
const SHARED_CORS_HEADERS = {
  'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
  'Access-Control-Allow-Methods': ALLOWED_METHODS.join(','),
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '3600',
  Vary: 'Origin',
} as const

export function createCorsPolicy(allowedOrigins: readonly string[]) {
  const allowsHttpOrigin = (origin: string | undefined) =>
    origin !== undefined && isAllowedOrigin(origin, allowedOrigins)

  return {
    expressMiddleware: cors({
      origin: (origin, callback) => callback(null, allowsHttpOrigin(origin)),
      methods: ALLOWED_METHODS,
      allowedHeaders: ALLOWED_HEADERS,
      credentials: true,
      maxAge: 3600,
    }),
    installForColyseus(): void {
      const defaultHeaders = matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>
      delete defaultHeaders['Access-Control-Allow-Origin']
      Object.assign(defaultHeaders, SHARED_CORS_HEADERS)
      matchMaker.controller.getCorsHeaders = (headers) => {
        const origin = headers.get('origin') ?? undefined
        const corsHeaders: Record<string, string> = {}
        if (origin !== undefined && allowsHttpOrigin(origin))
          corsHeaders['Access-Control-Allow-Origin'] = origin
        return corsHeaders
      }
    },
  }
}
