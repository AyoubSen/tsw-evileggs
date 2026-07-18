import { createClerkClient } from '@clerk/backend'
import { verifyWebhook } from '@clerk/backend/webhooks'
import express, { type Application, type NextFunction, type Request, type Response } from 'express'
import { sanitizeAccountData } from '../../src/shared/account'
import type { AccountEnvironment } from '../environment'
import type { AccountRepository } from './repository'
import { clerkBearerMiddleware } from './auth'
import { gameTicketStore } from './gameTickets'
import { fixedWindowRateLimit } from './rateLimit'
import type { ProgressionRepository } from './progressionRepository'

const accountUnavailable = (response: Response) => response.status(503).json({
  error: { code: 'account-service-unavailable', message: 'Account data is temporarily unavailable.' },
})

export const isAccountSyncBody = (value: unknown): value is { baseRevision: number; data: object } => {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number) < 0) return false
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return false
  const data = body.data as Record<string, unknown>
  if (!data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences) || !Array.isArray(data.outfitPresets)) return false
  return JSON.stringify(sanitizeAccountData(data)) === JSON.stringify(data)
}

export function installAccountRoutes(app: Application, environment: AccountEnvironment, repository?: AccountRepository, progression?: ProgressionRepository): void {
  app.get('/api/account/capabilities', (_request, response) => {
    response.set('Cache-Control', 'no-store')
    response.json({ account: { enabled: environment.enabled } })
  })
  if (!environment.enabled) return
  if (!repository) throw new Error('Account repository is required when accounts are enabled')
  const secretKey = environment.clerkSecretKey!
  const clerk = createClerkClient({ secretKey })
  const authenticatedUserKey = (_request: Request, response: Response) => response.locals.accountUserId
  const ticketLimit = fixedWindowRateLimit(20, 60_000, authenticatedUserKey)
  const readLimit = fixedWindowRateLimit(120, 60_000, authenticatedUserKey)
  const syncLimit = fixedWindowRateLimit(60, 60_000, authenticatedUserKey)
  const purchaseLimit = fixedWindowRateLimit(30, 60_000, authenticatedUserKey)
  const deletionLimit = fixedWindowRateLimit(3, 60 * 60_000, authenticatedUserKey)

  if (environment.webhookSigningSecret) {
    const signingSecret = environment.webhookSigningSecret
    app.post('/api/clerk/webhooks', express.raw({ type: 'application/json', limit: '256kb' }), async (request, response) => {
      try {
        if (!Buffer.isBuffer(request.body)) throw new Error('Raw webhook body required')
        const headers = new Headers()
        for (const [name, value] of Object.entries(request.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
          else if (value !== undefined) headers.set(name, value)
        }
        const event = await verifyWebhook(new Request('http://localhost/api/clerk/webhooks', {
          method: 'POST', headers, body: request.body,
        }), { signingSecret })
        if (event.type === 'user.deleted' && event.data.id) {
          const eventId = request.get('svix-id') ?? request.get('webhook-id')
          if (!eventId) throw new Error('Webhook event ID missing')
          await repository.processDeletedUser(eventId, event.data.id)
        }
        response.status(200).json({ received: true })
      } catch {
        response.status(400).json({ error: { code: 'invalid-webhook', message: 'Webhook verification failed.' } })
      }
    })
  }

  app.post(
    '/api/game-tickets',
    clerkBearerMiddleware(secretKey, environment.authorizedParties),
    ticketLimit,
    (_request, response) => {
      response.set('Cache-Control', 'no-store')
      response.json({
        ticket: gameTicketStore.issue(response.locals.accountUserId),
        expiresInSeconds: 60,
      })
    },
  )

  const router = express.Router()
  router.use(express.json({ limit: '64kb', strict: true }))
  router.use(clerkBearerMiddleware(secretKey, environment.authorizedParties))
  router.get('/', readLimit, async (_request, response) => {
    try { response.json(await repository.get(response.locals.accountUserId)) }
    catch { accountUnavailable(response) }
  })
  router.get('/progression', readLimit, async (_request, response) => {
    if (!progression) { accountUnavailable(response); return }
    try {
      response.set('Cache-Control', 'no-store')
      response.json(await progression.getOverview(response.locals.accountUserId, 5))
    } catch { accountUnavailable(response) }
  })
  router.post('/cosmetics/purchase', purchaseLimit, async (request, response) => {
    if (!progression) { accountUnavailable(response); return }
    const cosmeticId = request.body?.cosmeticId
    if (typeof cosmeticId !== 'string') {
      response.status(400).json({ error: { code: 'invalid-request', message: 'A cosmeticId is required.' } })
      return
    }
    try {
      const result = await progression.purchaseCosmetic(response.locals.accountUserId, cosmeticId)
      if (result === 'not-found') { response.status(404).json({ error: { code: 'cosmetic-not-found', message: 'That cosmetic is unavailable.' } }); return }
      if (result === 'insufficient-funds') { response.status(409).json({ error: { code: 'insufficient-funds', message: 'Not enough Scrap.' } }); return }
      response.set('Cache-Control', 'no-store')
      response.json({ result, progression: await progression.getOverview(response.locals.accountUserId, 5) })
    } catch { accountUnavailable(response) }
  })
  router.post('/sync', syncLimit, async (request, response) => {
    if (!isAccountSyncBody(request.body)) {
      response.status(400).json({ error: { code: 'invalid-request', message: 'A non-negative baseRevision and structured account data are required.' } })
      return
    }
    try {
      const result = await repository.sync(response.locals.accountUserId, request.body.baseRevision, sanitizeAccountData(request.body.data))
      response.status(result.ok ? 200 : 409).json(result.envelope)
    } catch { accountUnavailable(response) }
  })
  router.post('/delete', deletionLimit, async (_request, response) => {
    try {
      const userId = response.locals.accountUserId
      await clerk.users.deleteUser(userId)
      await repository.deleteProfile(userId)
      response.status(204).end()
    } catch { accountUnavailable(response) }
  })
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) response.status(400).json({ error: { code: 'invalid-json', message: 'Request body must be valid JSON.' } })
    else accountUnavailable(response)
  })
  app.use('/api/me', router)
}
