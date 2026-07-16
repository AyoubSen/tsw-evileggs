import { describe, expect, it } from 'vitest'
import type { Room } from '@colyseus/sdk'
import { MatchSimulation } from '../simulation/match/MatchSimulation'
import { OnlineMatchSource } from './OnlineMatchSource'
import { NETWORK_MESSAGE_TYPE, type ServerRoomMessage } from './protocol'
import { matchStateChecksum } from '../simulation/serialization/matchSerialization'

class FakeRoom {
  sessionId = 'session-host'
  state = {
    phase: 'playing',
    matchGeneration: 1,
    simulationTick: 0,
    turnNumber: 1,
    activePlayerSeat: 0,
    matchPhase: 'input',
    timerRemainingTicks: 1800,
    wind: 0,
    result: {
      available: false,
      winnerSeat: -1,
      winnerTeamId: -1,
      remainingHealth: 0,
      turnsTaken: 0,
      durationSeconds: 0,
    },
    players: new Map(),
    projectiles: new Map(),
  }
  sent: Array<{ type: string | number; payload: unknown }> = []
  messageDisposeCount = 0
  stateRemoveCount = 0
  private messageListener: ((message: unknown) => void) | null = null
  private staleMessageListener: ((message: unknown) => void) | null = null
  private stateListener: ((state: unknown) => void) | null = null
  private staleStateListener: ((state: unknown) => void) | null = null

  onMessage(type: string | number, listener: (message: unknown) => void): () => void {
    expect(type).toBe(NETWORK_MESSAGE_TYPE)
    this.messageListener = listener
    this.staleMessageListener = listener
    return () => {
      this.messageDisposeCount += 1
      this.messageListener = null
    }
  }

  onStateChange = Object.assign(
    (listener: (state: unknown) => void) => {
      this.stateListener = listener
      this.staleStateListener = listener
      return this
    },
    {
      remove: (listener: (state: unknown) => void) => {
        this.stateRemoveCount += 1
        if (this.stateListener === listener) this.stateListener = null
      },
    },
  )

  send(type: string | number, payload: unknown): void {
    this.sent.push({ type, payload })
  }

  message(message: ServerRoomMessage): void {
    this.messageListener?.(message)
  }

  patch(): void {
    this.stateListener?.(this.state)
  }

  lateMessage(message: ServerRoomMessage): void {
    this.staleMessageListener?.(message)
  }

  latePatch(): void {
    this.staleStateListener?.(this.state)
  }
}

const snapshotMessage = (
  simulation: MatchSimulation,
  matchGeneration = 1,
): Extract<ServerRoomMessage, { type: 'full-snapshot' }> => ({
  type: 'full-snapshot',
  snapshot: simulation.snapshot(),
  checksum: matchStateChecksum(simulation.state),
  lastEventSequence: simulation.state.nextEventSequence - 1,
  lastTerrainSequence: simulation.state.nextTerrainSequence - 1,
  matchGeneration,
})

describe('OnlineMatchSource synchronization', () => {
  it('restores a complete snapshot and applies terrain operations once', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const simulation = new MatchSimulation()
    expect(source.presentationRevision).toBe(0)
    room.message(snapshotMessage(simulation))
    expect(source.presentationRevision).toBe(1)
    expect(source.ready).toBe(true)
    expect(source.state.matchId).toBe(simulation.state.matchId)
    expect(source.getTerrain().isSolid(480, 470)).toBe(true)

    const operation = {
      sequence: 1,
      tick: 1,
      type: 'subtract-circle' as const,
      x: 480,
      y: 470,
      radius: 25,
      sourceActionId: 'action-1',
    }
    const event = { sequence: 1, tick: 1, type: 'terrain-destroyed' as const, operation }
    room.message({
      type: 'simulation-events',
      matchGeneration: 1,
      fromSequence: 1,
      events: [event],
    })
    room.message({
      type: 'simulation-events',
      matchGeneration: 1,
      fromSequence: 1,
      events: [event],
    })
    expect(source.getTerrain().isSolid(480, 470)).toBe(false)
    expect(source.state.terrainOperations).toHaveLength(1)
    expect(source.drainEvents()).toHaveLength(1)
  })

  it('detects event gaps and requests snapshot recovery', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    room.message(snapshotMessage(new MatchSimulation()))
    expect(source.ready).toBe(true)
    room.message({
      type: 'simulation-events',
      matchGeneration: 1,
      fromSequence: 2,
      events: [{ sequence: 2, tick: 1, type: 'player-died', playerId: 'player-2' }],
    })
    expect(room.sent.at(-1)).toMatchObject({
      type: NETWORK_MESSAGE_TYPE,
      payload: { type: 'request-snapshot', lastEventSequence: 0 },
    })
  })

  it('projects discrete state immediately and interpolates only positions', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const simulation = new MatchSimulation()
    room.message(snapshotMessage(simulation))
    const startX = source.state.players[0].position.x
    room.state.simulationTick = 12
    room.state.timerRemainingTicks = 1700
    room.state.players.set('host', {
      playerId: 'room-player-1',
      sessionId: room.sessionId,
      seat: 0,
      x: startX + 60,
      y: source.state.players[0].position.y,
      velocityX: 10,
      velocityY: 0,
      health: 83,
      alive: true,
      grounded: true,
      moveDirection: 1,
      selectedWeapon: 'basic-rocket',
      basicRocketAmmo: -1,
      timedGrenadeAmmo: 3,
      scatterShotAmmo: 3,
      clusterChargeAmmo: 2,
      teleporterAmmo: 2,
    })
    room.patch()
    expect(source.state.tick).toBe(12)
    expect(source.state.timerRemainingTicks).toBe(1700)
    expect(source.state.players[0].health).toBe(83)
    expect(source.state.players[0].position.x).toBe(startX)
    source.update(1 / 60)
    expect(source.state.players[0].position.x).toBe(startX)
    expect(source.localSeat).toBe(0)
  })

  it('replaces stale local state during explicit snapshot recovery', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const simulation = new MatchSimulation()
    room.message(snapshotMessage(simulation))
    const firstRevision = source.presentationRevision
    source.state.players[0].health = 1
    room.message(snapshotMessage(simulation))
    expect(source.state.players[0].health).toBe(100)
    expect(source.presentationRevision).toBe(firstRevision + 1)
  })

  it('holds projected entities at the latest authoritative sample while paused', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const simulation = new MatchSimulation()
    room.message(snapshotMessage(simulation))
    const player = simulation.state.players[0]
    room.state.phase = 'reconnecting'
    room.state.players.set('host', {
      playerId: 'room-player-1',
      sessionId: room.sessionId,
      seat: 0,
      x: player.position.x + 80,
      y: player.position.y,
      velocityX: 40,
      velocityY: 0,
      health: 100,
      alive: true,
      grounded: true,
      moveDirection: 1,
      selectedWeapon: 'basic-rocket',
      basicRocketAmmo: -1,
      timedGrenadeAmmo: 3,
      scatterShotAmmo: 3,
      clusterChargeAmmo: 2,
      teleporterAmmo: 2,
    })
    room.patch()
    source.update(1 / 60)
    expect(source.state.paused).toBe(true)
    expect(source.state.players[0].position.x).toBe(player.position.x + 80)
  })

  it('rejects corrupt and older-generation snapshots', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const current = new MatchSimulation(undefined, { seed: 2, matchId: 'generation-2' })
    room.message(snapshotMessage(current, 2))
    const revision = source.presentationRevision
    const corrupt = snapshotMessage(new MatchSimulation(undefined, { seed: 3 }), 3)
    room.message({ ...corrupt, checksum: '00000000' })
    room.message(snapshotMessage(new MatchSimulation(undefined, { seed: 1 }), 1))
    expect(source.state.matchId).toBe('generation-2')
    expect(source.presentationRevision).toBe(revision)
    expect(room.sent).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ type: 'request-snapshot' }) }),
    )
  })

  it('recovers authoritative results from Schema when a transient result is missed', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    room.message(snapshotMessage(new MatchSimulation()))
    room.state.matchPhase = 'victory'
    room.state.result = {
      available: true,
      winnerSeat: 0,
      winnerTeamId: 0,
      remainingHealth: 72,
      turnsTaken: 4,
      durationSeconds: 18,
    }
    room.patch()
    expect(source.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'match-ended',
        result: expect.objectContaining({ winnerIndex: 0, remainingHealth: 72 }),
      }),
    )
  })

  it('disposes listeners once and ignores late snapshots and state patches', () => {
    const room = new FakeRoom()
    const source = new OnlineMatchSource(room as unknown as Room)
    const simulation = new MatchSimulation()
    room.message(snapshotMessage(simulation))
    const initialTick = source.state.tick
    let stateNotifications = 0
    source.subscribeState(() => {
      stateNotifications += 1
    })
    source.dispose()
    source.dispose()

    room.state.simulationTick = 999
    room.latePatch()
    const laterSimulation = new MatchSimulation()
    laterSimulation.step(10)
    room.lateMessage(snapshotMessage(laterSimulation))

    expect(source.state.tick).toBe(initialTick)
    expect(stateNotifications).toBe(1)
    expect(source.drainEvents()).toEqual([])
    expect(room.messageDisposeCount).toBe(1)
    expect(room.stateRemoveCount).toBe(1)
  })
})
