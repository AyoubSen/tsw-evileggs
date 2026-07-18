import { defineRoom, defineServer, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { isRoomCode, normalizeRoomCode } from '../src/network/protocol'
import { createCorsPolicy } from './corsPolicy'
import { allowedWebOrigins, isAllowedOrigin } from './environment'
import { PrivateMatchRoom } from './rooms/PrivateMatchRoom'
import { roomCodeRegistry } from './roomCodeRegistry'
import { HEALTH_RESPONSE } from '../src/network/healthProtocol'
import { accountEnvironment } from './environment'
import { createDatabase } from './db/client'
import { DrizzleAccountRepository } from './account/repository'
import { installAccountRoutes } from './account/routes'
import { configureProgressionRepository, DrizzleProgressionRepository } from './account/progressionRepository'

const origins = allowedWebOrigins()
const corsPolicy = createCorsPolicy(origins)
const account = accountEnvironment()
const database = account.enabled ? createDatabase(account.databaseUrl!) : null
const accountRepository = database ? new DrizzleAccountRepository(database) : undefined
const progressionRepository = database ? new DrizzleProgressionRepository(database) : undefined
configureProgressionRepository(progressionRepository ?? null)
corsPolicy.installForColyseus()
export { HEALTH_RESPONSE }

export const server = defineServer({
  rooms: {
    private_match: defineRoom(PrivateMatchRoom),
  },
  transport: new WebSocketTransport({
    maxPayload: 4096,
    verifyClient: ({ origin }, done) =>
      done(isAllowedOrigin(origin, origins), 403, 'Origin not allowed'),
  }),
  express: (app) => {
    app.use(corsPolicy.expressMiddleware)
    app.get('/health', (_request, response) => response.json(HEALTH_RESPONSE))
    installAccountRoutes(
      app,
      account,
      accountRepository,
      progressionRepository,
    )
    app.get('/api/private-rooms/:code', (request, response) => {
      const code = normalizeRoomCode(request.params.code)
      if (!isRoomCode(code)) {
        response
          .status(400)
          .json({ code: 'malformed-code', message: 'Enter a valid 6-character room code.' })
        return
      }
      const entry = roomCodeRegistry.resolve(code)
      if (!entry) {
        response
          .status(404)
          .json({ code: 'room-not-found', message: 'That room code is no longer active.' })
        return
      }
      if (entry.phase !== 'waiting') {
        response
          .status(409)
          .json({ code: 'match-started', message: 'That room match has already started.' })
        return
      }
      if (entry.occupiedPlayers >= entry.capacity) {
        response
          .status(409)
          .json({ code: 'room-full', message: 'That private room is already full.' })
        return
      }
      response.json({ roomId: entry.roomId, code: entry.code })
    })
    if (process.env.NODE_ENV !== 'production')
      app.get('/diagnostics/rooms', (_request, response) =>
        response.json({ roomCount: roomCodeRegistry.size, rooms: roomCodeRegistry.diagnostics() }),
      )
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_TEST_ROUTES === 'true'
    )
      app.post('/__test/private-rooms/:code/result', (request, response) => {
        const entry = roomCodeRegistry.resolve(request.params.code)
        const room = entry ? matchMaker.getLocalRoomById(entry.roomId) : undefined
        if (!(room instanceof PrivateMatchRoom)) {
          response.status(404).json({ ok: false })
          return
        }
        room.finishForBrowserTest()
        response.json({ ok: true })
      })
  },
  greet:
    process.env.NODE_ENV !== 'production' &&
    process.env.DEVELOPMENT_LOGGING !== 'false',
})

export type GameServer = typeof server
