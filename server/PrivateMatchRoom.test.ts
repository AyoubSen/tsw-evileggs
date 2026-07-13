import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { boot, type ColyseusTestServer } from '@colyseus/testing'
import type { Room as ClientRoom } from '@colyseus/sdk'
import { CURRENT_COMPATIBILITY, NETWORK_MESSAGE_TYPE } from '../src/network/protocol'
import type { ServerRoomMessage } from '../src/network/protocol'
import { matchStateChecksum } from '../src/simulation/serialization/matchSerialization'
import type { MatchSimulation } from '../src/simulation/match/MatchSimulation'
import { windForTurn } from '../src/simulation/wind/wind'
import { HEALTH_RESPONSE, server } from './app.config'
import { PrivateMatchRoom } from './rooms/PrivateMatchRoom'
import { roomCodeRegistry } from './roomCodeRegistry'

const createOptions = {
  playerName: 'Host',
  mapId: 'rolling-hills' as const,
  turnDurationSeconds: 30 as const,
  compatibility: CURRENT_COMPATIBILITY,
}
const joinOptions = { playerName: 'Guest', compatibility: CURRENT_COMPATIBILITY }
const DEPLOYED_WEB_ORIGIN = 'https://evileggs.vercel.app'
const HTTP_ENDPOINT = 'http://127.0.0.1:2568'

const waitFor = async (condition: () => boolean, timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for room state')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const internals = (room: PrivateMatchRoom) =>
  room as unknown as {
    updateRoom(deltaMs: number): void
    finishByForfeit(winnerSeat: 0 | 1): void
    reconnectGraceSeconds: number
    simulation: MatchSimulation | null
  }

const playersBySeat = (room: PrivateMatchRoom) =>
  [...room.state.players.values()].sort((left, right) => left.seat - right.seat)

describe.sequential('PrivateMatchRoom transport authority', () => {
  let testServer: ColyseusTestServer

  beforeAll(async () => {
    testServer = await boot(server, 2767)
  })

  afterEach(async () => {
    await testServer.cleanup()
    roomCodeRegistry.clear()
  })

  afterAll(async () => {
    await testServer.shutdown()
  })

  const connectPair = async () => {
    const room = await testServer.createRoom<PrivateMatchRoom>('private_match', createOptions)
    const host = await testServer.connectTo(room, createOptions)
    const guest = await testServer.connectTo(room, joinOptions)
    host.onMessage(NETWORK_MESSAGE_TYPE, () => undefined)
    guest.onMessage(NETWORK_MESSAGE_TYPE, () => undefined)
    return { room, host, guest }
  }

  const startMatch = async (room: PrivateMatchRoom, host: ClientRoom, guest: ClientRoom) => {
    host.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    guest.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    await waitFor(() => room.state.phase === 'starting')
    internals(room).updateRoom(START_COUNTDOWN_FOR_TEST)
    expect(room.state.phase).toBe('playing')
  }

  const START_COUNTDOWN_FOR_TEST = 3100

  it('defines a safe public health response without room data', () => {
    expect(HEALTH_RESPONSE).toEqual({
      status: 'ok',
      service: 'mossfire-server',
      protocolVersion: 1,
    })
    expect(JSON.stringify(HEALTH_RESPONSE)).not.toMatch(/room|player|snapshot|secret/i)
  })

  it('serves health with the shared allowlisted CORS policy', async () => {
    const response = await fetch(`${HTTP_ENDPOINT}/health`, {
      headers: { Origin: DEPLOYED_WEB_ORIGIN },
    })
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toMatch(/^application\/json\b/)
    expect(response.headers.get('access-control-allow-origin')).toBe(DEPLOYED_WEB_ORIGIN)
    expect(response.headers.get('vary')).toMatch(/(?:^|,\s*)Origin(?:,|$)/i)
    const body = await response.json()
    expect(body).toEqual(HEALTH_RESPONSE)
    expect(JSON.stringify(body)).not.toMatch(/room|player|snapshot|secret/i)

    const disallowed = await fetch(`${HTTP_ENDPOINT}/health`, {
      headers: { Origin: 'https://attacker.example' },
    })
    expect(disallowed.ok).toBe(true)
    expect(disallowed.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('applies the shared CORS policy to preflight and matchmaking HTTP routes', async () => {
    const preflight = await fetch(`${HTTP_ENDPOINT}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: DEPLOYED_WEB_ORIGIN,
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(DEPLOYED_WEB_ORIGIN)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET')

    const disallowedPreflight = await fetch(`${HTTP_ENDPOINT}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(disallowedPreflight.status).toBe(204)
    expect(disallowedPreflight.headers.has('access-control-allow-origin')).toBe(false)

    const matchmaking = await fetch(`${HTTP_ENDPOINT}/matchmake/create/private_match`, {
      method: 'POST',
      headers: { Origin: DEPLOYED_WEB_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(createOptions),
    })
    expect(matchmaking.ok).toBe(true)
    expect(matchmaking.headers.get('access-control-allow-origin')).toBe(DEPLOYED_WEB_ORIGIN)
    expect(matchmaking.headers.get('vary')).toMatch(/(?:^|,\s*)Origin(?:,|$)/i)
  })

  it('applies the shared CORS policy to room-code resolution', async () => {
    const room = await testServer.createRoom<PrivateMatchRoom>('private_match', createOptions)
    const response = await fetch(`${HTTP_ENDPOINT}/api/private-rooms/${room.state.roomCode}`, {
      headers: { Origin: DEPLOYED_WEB_ORIGIN },
    })
    expect(response.ok).toBe(true)
    expect(response.headers.get('access-control-allow-origin')).toBe(DEPLOYED_WEB_ORIGIN)
    expect(response.headers.get('vary')).toMatch(/(?:^|,\s*)Origin(?:,|$)/i)
    expect(await response.json()).toEqual({ roomId: room.roomId, code: room.state.roomCode })
  })

  it('assigns creator seat 0, joiner seat 1, and rejects a third player', async () => {
    const { room } = await connectPair()
    expect(playersBySeat(room).map((player) => [player.seat, player.name])).toEqual([
      [0, 'Host'],
      [1, 'Guest'],
    ])
    await expect(testServer.connectTo(room, joinOptions)).rejects.toThrow(/full|locked/i)
  })

  it('validates room configuration and removes disposed room codes', async () => {
    await expect(
      testServer.createRoom('private_match', { ...createOptions, mapId: 'unknown-map' }),
    ).rejects.toThrow(/configuration|payload/i)
    const room = await testServer.createRoom<PrivateMatchRoom>('private_match', createOptions)
    const code = room.state.roomCode
    expect(roomCodeRegistry.resolve(code)?.roomId).toBe(room.roomId)
    await room.disconnect()
    await waitFor(() => roomCodeRegistry.resolve(code) === undefined)
  })

  it('starts exactly once only after both players ready and sends a checksummed snapshot', async () => {
    const { room, host, guest } = await connectPair()
    let snapshot: Extract<ServerRoomMessage, { type: 'full-snapshot' }> | null = null
    host.onMessage(NETWORK_MESSAGE_TYPE, (message: ServerRoomMessage) => {
      if (message.type === 'full-snapshot') snapshot = message
    })
    host.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(room.state.phase).toBe('waiting')
    guest.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    await waitFor(() => room.state.phase === 'starting' && snapshot !== null)
    expect(room.state.matchGeneration).toBe(1)
    expect(matchStateChecksum(snapshot!.snapshot.state)).toBe(snapshot!.checksum)
    expect(room.state.wind).toBe(snapshot!.snapshot.state.wind)
    internals(room).updateRoom(START_COUNTDOWN_FOR_TEST)
    expect(room.state.phase).toBe('playing')
    expect(room.state.simulationTick).toBe(0)
  })

  it('cancels the pending start if a player leaves during countdown', async () => {
    const { room, host, guest } = await connectPair()
    host.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    guest.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready: true })
    await waitFor(() => room.state.phase === 'starting')
    await guest.leave(true)
    await waitFor(() => room.state.phase === 'waiting')
    expect(playersBySeat(room)).toHaveLength(1)
    expect(playersBySeat(room)[0].ready).toBe(false)
    expect(room.state.matchGeneration).toBe(1)
  })

  it('orders commands on the server and rejects wrong-seat, duplicate, and claimed outcomes', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    const hostResults: ServerRoomMessage[] = []
    const guestResults: ServerRoomMessage[] = []
    host.onMessage(NETWORK_MESSAGE_TYPE, (message: ServerRoomMessage) => hostResults.push(message))
    guest.onMessage(NETWORK_MESSAGE_TYPE, (message: ServerRoomMessage) =>
      guestResults.push(message),
    )

    host.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'move', direction: 1, pressed: true },
    })
    guest.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'jump' },
    })
    internals(room).updateRoom(20)
    await waitFor(
      () =>
        hostResults.some((message) => message.type === 'command-result') &&
        guestResults.some((message) => message.type === 'command-result'),
    )
    expect(
      hostResults.find((message) => message.type === 'command-result' && message.commandId === 1),
    ).toMatchObject({ accepted: true })
    expect(
      guestResults.find((message) => message.type === 'command-result' && message.commandId === 1),
    ).toMatchObject({ accepted: false, reason: 'not-active-player' })

    host.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'jump' },
    })
    host.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 2,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'fire', aimDirection: { x: 1, y: 0 }, power: 50, damage: 999 },
    })
    await waitFor(
      () =>
        hostResults.some(
          (message) => message.type === 'command-result' && message.reason === 'duplicate-command',
        ) && hostResults.some((message) => message.type === 'room-error'),
    )
  })

  it('creates projectiles only through the server-owned simulation', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    const results: ServerRoomMessage[] = []
    host.onMessage(NETWORK_MESSAGE_TYPE, (message: ServerRoomMessage) => results.push(message))
    host.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'fire', aimDirection: { x: 1, y: 0 }, power: 50 },
    })
    internals(room).updateRoom(20)
    await waitFor(() =>
      results.some(
        (message) =>
          message.type === 'command-result' && message.commandId === 1 && message.accepted,
      ),
    )
    expect(room.state.projectiles.size).toBeGreaterThan(0)
    expect(room.state.eventSequence).toBeGreaterThan(0)
    expect(playersBySeat(room)[0].basicRocketAmmo).toBe(-1)
  })

  it('clears held movement and restores the same seat after automatic reconnection', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    host.reconnection.minUptime = 0
    host.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'move', direction: 1, pressed: true },
    })
    internals(room).updateRoom(20)
    await waitFor(() => playersBySeat(room)[0].moveDirection === 1)
    const playerId = playersBySeat(room)[0].playerId
    void host.leave(false)
    await waitFor(() => playersBySeat(room)[0].moveDirection === 0)
    await waitFor(() => playersBySeat(room)[0].connected, 5000)
    expect(playersBySeat(room)[0]).toMatchObject({ playerId, seat: 0, connected: true })
    expect(room.state.phase).toBe('reconnecting')
    internals(room).updateRoom(2100)
    expect(room.state.phase).toBe('playing')
  })

  it('produces one forfeit result after reconnect timeout and no ghost player', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    internals(room).reconnectGraceSeconds = 0.05
    guest.reconnection.enabled = false
    void guest.leave(false)
    await waitFor(() => room.state.phase === 'results', 3000)
    expect(room.state.result).toMatchObject({ available: true, winnerSeat: 0, reason: 'forfeit' })
    expect(playersBySeat(room)).toHaveLength(1)
  })

  it('requires two rematch votes and resets the simulation while preserving code and seats', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    const code = room.state.roomCode
    const playerIds = playersBySeat(room).map((player) => player.playerId)
    const firstSeed = internals(room).simulation!.state.seed
    internals(room).finishByForfeit(0)
    expect(room.state.phase).toBe('results')
    host.send(NETWORK_MESSAGE_TYPE, { type: 'rematch-vote', wantsRematch: true })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(room.state.matchGeneration).toBe(1)
    guest.send(NETWORK_MESSAGE_TYPE, { type: 'rematch-vote', wantsRematch: true })
    await waitFor(() => room.state.matchGeneration === 2)
    expect(room.state.roomCode).toBe(code)
    expect(playersBySeat(room).map((player) => player.playerId)).toEqual(playerIds)
    expect(room.state).toMatchObject({ simulationTick: 0, terrainSequence: 0, eventSequence: 0 })
    expect(room.state.projectiles.size).toBe(0)
    const rematch = internals(room).simulation!
    expect(rematch.state.wind).toBe(windForTurn(rematch.state.seed, 1))
    expect(rematch.state.seed).not.toBe(firstSeed)
  })

  it('cancels a pending rematch when one player leaves results', async () => {
    const { room, host, guest } = await connectPair()
    await startMatch(room, host, guest)
    internals(room).finishByForfeit(0)
    host.send(NETWORK_MESSAGE_TYPE, { type: 'rematch-vote', wantsRematch: true })
    await waitFor(() => playersBySeat(room)[0].wantsRematch)
    await guest.leave(true)
    await waitFor(() => playersBySeat(room).length === 1)
    expect(playersBySeat(room)[0].wantsRematch).toBe(false)
    expect(room.state.matchGeneration).toBe(1)
  })
})
