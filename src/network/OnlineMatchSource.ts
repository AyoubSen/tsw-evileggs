import type { Room } from '@colyseus/sdk'
import type { MatchSource, MatchSourceCommandResult } from '../game/matchSource'
import type { MatchCommandInput } from '../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../simulation/match/MatchEvent'
import type {
  MatchState,
  SimBeacon,
  SimProjectile,
} from '../simulation/match/MatchState'
import { reconstructTerrain } from '../simulation/match/MatchSimulation'
import { getMap } from '../maps/registry'
import { SIMULATION_HZ } from '../simulation/match/MatchState'
import { matchStateChecksum } from '../simulation/serialization/matchSerialization'
import type { TerrainMask } from '../terrain/TerrainMask'
import type { Vector } from '../shared/types'
import {
  NETWORK_MESSAGE_TYPE,
  SIMULATION_SNAPSHOT_VERSION,
  type FullSnapshotMessage,
  type ServerRoomMessage,
} from './protocol'
import { INTERPOLATION_SNAP_THRESHOLD, samplePosition, type PositionSample } from './interpolation'
import {
  isTeleportDestinationValid,
  resolveTeleportDestination,
} from '../simulation/weapons/teleport'
import { WEAPON_ORDER, WEAPONS, type WeaponInventory } from '../weapons/registry'
import { validatePlayerAppearance } from '../players/appearanceRegistry'

type StateListener = (state: MatchState) => void
type PendingCommand = {
  resolve: (result: MatchSourceCommandResult) => void
  timeout: ReturnType<typeof setTimeout>
}

type SchemaPlayer = {
  playerId: string
  sessionId: string
  seat: number
  teamId: 0 | 1
  teamSlot: number
  x: number
  y: number
  velocityX: number
  velocityY: number
  health: number
  alive: boolean
  grounded: boolean
  moveDirection: -1 | 0 | 1
  frozenTurnsRemaining: number
  frozenAppliedTurn: number
  facing: -1 | 1
  selectedWeapon: MatchState['players'][number]['selectedWeapon']
  ammunition: { get(key: string): number | undefined }
  version: number
  body: string
  primaryColor: string
  accentColor: string
  pattern: string
  face: string
  accessory: string
  victoryStyle: string
}

type SchemaProjectile = {
  id: string
  actionId: string
  ownerId: string
  weaponId: SimProjectile['weaponId']
  kind: SimProjectile['kind']
  x: number
  y: number
  velocityX: number
  velocityY: number
  radius: number
  fuseTicks: number
}

type SchemaBeacon = {
  id: string
  actionId: string
  ownerId: string
  weaponId: SimBeacon['weaponId']
  x: number
  y: number
  remainingTicks: number
}

type OnlineSchemaState = {
  phase: string
  matchGeneration: number
  simulationTick: number
  turnNumber: number
  activePlayerSeat: number
  teamZeroTurnCursor: number
  teamOneTurnCursor: number
  matchPhase: MatchState['phase']
  timerRemainingTicks: number
  wind: number
  result: {
    available: boolean
    winnerSeat: number
    winnerTeamId: number
    remainingHealth: number
    turnsTaken: number
    durationSeconds: number
  }
  players: { values(): IterableIterator<SchemaPlayer> }
  projectiles: { values(): IterableIterator<SchemaProjectile> }
  beacons: { values(): IterableIterator<SchemaBeacon> }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const ammo = (value: number) => (value < 0 ? ('unlimited' as const) : value)

export class OnlineMatchSource implements MatchSource {
  readonly online = true
  private snapshotState: MatchState | null = null
  private terrain: TerrainMask | null = null
  private readonly events: MatchEvent[] = []
  private readonly stateListeners = new Set<StateListener>()
  private readonly pendingCommands = new Map<number, PendingCommand>()
  private readonly playerSamples = new Map<number, PositionSample[]>()
  private readonly authoritativePlayerPositions = new Map<number, Vector>()
  private readonly projectileSamples = new Map<string, PositionSample[]>()
  private listenerDisposers: Array<() => void> = []
  private commandId = 0
  private lastEventSequence = 0
  private lastTerrainSequence = 0
  private matchGeneration = 0
  private inputPaused = false
  private disposed = false
  private resultQueuedForMatch = ''
  private presentationRevisionValue = 0
  playerId = ''

  constructor(private readonly room: Room) {
    const disposeMessage = room.onMessage(NETWORK_MESSAGE_TYPE, (message: unknown) =>
      this.receiveServerMessage(message),
    )
    const stateListener = (state: unknown) => this.applyProjection(state as OnlineSchemaState)
    room.onStateChange(stateListener)
    this.listenerDisposers.push(disposeMessage)
    this.listenerDisposers.push(() => room.onStateChange.remove(stateListener))
  }

  get ready(): boolean {
    return this.snapshotState !== null
  }

  get state(): MatchState {
    if (!this.snapshotState) throw new Error('The online match snapshot has not arrived yet.')
    return this.snapshotState
  }

  get activePlayer() {
    return this.state.players[this.state.activePlayerIndex]
  }

  get timerRemainingSeconds(): number {
    return this.state.timerRemainingTicks / SIMULATION_HZ
  }

  get presentationRevision(): number {
    return this.presentationRevisionValue
  }

  get localSeat(): number | null {
    const state = this.room.state as unknown as OnlineSchemaState
    if (!state?.players) return null
    const player = [...state.players.values()].find(
      (candidate) => candidate.sessionId === this.room.sessionId,
    )
    return player?.seat ?? null
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !this.snapshotState) return
    if (!Number.isFinite(deltaSeconds)) return
    if (this.snapshotState.paused) {
      this.snapshotState.players.forEach((player, seat) => {
        const samples = this.playerSamples.get(seat)
        const latest = samples?.[samples.length - 1]
        if (latest) player.position = { ...latest.position }
        this.keepLatestSample(this.playerSamples, seat)
      })
      for (const projectile of this.snapshotState.projectiles) {
        const samples = this.projectileSamples.get(projectile.id)
        const latest = samples?.[samples.length - 1]
        if (latest) projectile.position = { ...latest.position }
        this.keepLatestSample(this.projectileSamples, projectile.id)
      }
      return
    }
    const now = performance.now()
    this.snapshotState.players.forEach((player, seat) => {
      const sampled = samplePosition(this.playerSamples.get(seat) ?? [], now, player.position)
      player.position = sampled.position
      if (sampled.snap) this.keepLatestSample(this.playerSamples, seat)
    })
    for (const projectile of this.snapshotState.projectiles) {
      const sampled = samplePosition(
        this.projectileSamples.get(projectile.id) ?? [],
        now,
        projectile.position,
      )
      projectile.position = sampled.position
      if (sampled.snap) this.keepLatestSample(this.projectileSamples, projectile.id)
    }
  }

  sendCommand(command: MatchCommandInput): Promise<MatchSourceCommandResult> {
    if (!this.snapshotState || this.disposed || !this.canControlActivePlayer())
      return Promise.resolve({
        accepted: false,
        commandId: 0,
        authoritativeTick: this.snapshotState?.tick ?? 0,
        reason: 'not-active-player',
      })
    const commandId = ++this.commandId
    this.room.send(NETWORK_MESSAGE_TYPE, {
      type: 'command',
      commandId,
      expectedTurn: this.state.turnNumber,
      matchGeneration: this.matchGeneration,
      command,
    })
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId)
        resolve({
          accepted: false,
          commandId,
          authoritativeTick: this.state.tick,
          reason: 'match-not-accepting-input',
        })
      }, 5000)
      this.pendingCommands.set(commandId, { resolve, timeout })
    })
  }

  drainEvents(): MatchEvent[] {
    if (this.disposed) return []
    return this.events.splice(0)
  }

  getTerrain(): TerrainMask {
    if (!this.terrain) throw new Error('The online terrain snapshot has not arrived yet.')
    return this.terrain
  }

  resolveTeleportTarget(pointer: Vector): Vector | null {
    if (!this.snapshotState || !this.terrain) return null
    return resolveTeleportDestination(pointer, this.teleportContext())
  }

  isValidTeleport(target: Vector): boolean {
    if (!this.snapshotState || !this.terrain) return false
    return isTeleportDestinationValid(target, this.teleportContext())
  }

  private teleportContext() {
    const players = this.state.players.map((player, seat) => ({
      ...player,
      position: { ...(this.authoritativePlayerPositions.get(seat) ?? player.position) },
    }))
    return {
      terrain: this.terrain!,
      worldWidth: this.state.worldWidth,
      worldHeight: this.state.worldHeight,
      player: players[this.state.activePlayerIndex],
      players,
      weapon: WEAPONS.teleporter,
    }
  }

  canControlActivePlayer(): boolean {
    return !this.inputPaused && this.localSeat === this.state.activePlayerIndex
  }

  setPaused(paused: boolean): void {
    if (paused && !this.inputPaused && this.snapshotState && this.localSeat !== null)
      void this.sendCommand({ type: 'move', direction: 0, pressed: true })
    this.inputPaused = paused
  }

  restart(): void {}

  subscribeState(listener: StateListener): () => void {
    if (this.disposed) return () => undefined
    this.stateListeners.add(listener)
    if (this.snapshotState) listener(this.snapshotState)
    return () => this.stateListeners.delete(listener)
  }

  requestSnapshot(): void {
    if (this.disposed) return
    this.room.send(NETWORK_MESSAGE_TYPE, {
      type: 'request-snapshot',
      lastKnownTick: this.snapshotState?.tick ?? 0,
      lastEventSequence: this.lastEventSequence,
      lastTerrainSequence: this.lastTerrainSequence,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const dispose of this.listenerDisposers) dispose()
    this.listenerDisposers = []
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeout)
      pending.resolve({
        accepted: false,
        commandId: 0,
        authoritativeTick: this.snapshotState?.tick ?? 0,
        reason: 'navigation-cancelled',
      })
    }
    this.pendingCommands.clear()
    this.stateListeners.clear()
    this.events.splice(0)
    this.playerSamples.clear()
    this.authoritativePlayerPositions.clear()
    this.projectileSamples.clear()
  }

  private receiveServerMessage(value: unknown): void {
    if (this.disposed) return
    if (!isRecord(value) || typeof value.type !== 'string') return
    const message = value as ServerRoomMessage
    if (message.type === 'full-snapshot') this.applySnapshot(message)
    else if (
      message.type === 'simulation-events' &&
      message.matchGeneration === this.matchGeneration
    )
      this.applyEvents(message.events, message.fromSequence)
    else if (message.type === 'command-result') {
      if (message.matchGeneration !== this.matchGeneration) return
      const pending = this.pendingCommands.get(message.commandId)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pendingCommands.delete(message.commandId)
      pending.resolve(
        message.accepted
          ? {
              accepted: true,
              commandId: message.commandId,
              authoritativeTick: message.authoritativeTick,
            }
          : {
              accepted: false,
              commandId: message.commandId,
              authoritativeTick: message.authoritativeTick,
              reason: message.reason ?? 'malformed-message',
            },
      )
    } else if (message.type === 'match-result' && message.matchGeneration === this.matchGeneration)
      this.queueResult(message.result)
  }

  private applySnapshot(message: FullSnapshotMessage): void {
    if (this.disposed) return
    if (message.snapshot.version !== SIMULATION_SNAPSHOT_VERSION || !message.snapshot.state) return
    if (message.matchGeneration < this.matchGeneration) return
    if (matchStateChecksum(message.snapshot.state) !== message.checksum) {
      this.requestSnapshot()
      return
    }
    const installedMap = getMap(message.snapshot.state.mapId)
    if (
      installedMap.id !== message.snapshot.state.mapId ||
      installedMap.revision !== message.snapshot.state.mapRevision ||
      installedMap.contentHash !== message.snapshot.state.mapContentHash
    ) {
      this.requestSnapshot()
      return
    }
    const generationChanged = message.matchGeneration !== this.matchGeneration
    if (generationChanged) this.cancelPendingCommands()
    this.snapshotState = structuredClone(message.snapshot.state)
    this.snapshotState.players.forEach((player, seat) =>
      this.authoritativePlayerPositions.set(seat, { ...player.position }),
    )
    this.presentationRevisionValue += 1
    this.terrain = reconstructTerrain(
      this.snapshotState.mapId,
      this.snapshotState.terrainOperations,
    )
    this.lastEventSequence = message.lastEventSequence
    this.lastTerrainSequence = message.lastTerrainSequence
    this.events.splice(0)
    if (generationChanged) {
      this.commandId = 0
      this.resultQueuedForMatch = ''
    }
    this.matchGeneration = message.matchGeneration
    this.refreshTargets()
    for (const listener of this.stateListeners) listener(this.snapshotState)
  }

  private applyProjection(schema: OnlineSchemaState): void {
    if (this.disposed || !this.snapshotState || schema.matchGeneration !== this.matchGeneration)
      return
    const state = this.snapshotState
    state.tick = schema.simulationTick
    state.turnNumber = schema.turnNumber
    state.activePlayerIndex = schema.activePlayerSeat
    if (
      Number.isSafeInteger(schema.teamZeroTurnCursor) &&
      Number.isSafeInteger(schema.teamOneTurnCursor)
    )
      state.teamTurnCursors = [schema.teamZeroTurnCursor, schema.teamOneTurnCursor]
    state.phase = schema.matchPhase
    state.paused = schema.phase !== 'playing'
    state.timerRemainingTicks = schema.timerRemainingTicks
    state.wind = schema.wind
    const receivedAt = performance.now()
    for (const projected of schema.players.values()) {
      const player = state.players[projected.seat]
      if (projected.sessionId === this.room.sessionId) this.playerId = projected.playerId
      const position = { x: projected.x, y: projected.y }
      this.authoritativePlayerPositions.set(projected.seat, { ...position })
      const distance = Math.hypot(position.x - player.position.x, position.y - player.position.y)
      const sample = {
        tick: schema.simulationTick,
        receivedAt,
        position,
        velocity: { x: projected.velocityX, y: projected.velocityY },
      }
      if (distance >= INTERPOLATION_SNAP_THRESHOLD) {
        player.position = { ...position }
        this.playerSamples.set(projected.seat, [sample])
      } else this.pushSample(this.playerSamples, projected.seat, sample)
      player.velocity = { x: projected.velocityX, y: projected.velocityY }
      player.health = projected.health
      player.alive = projected.alive
      player.grounded = projected.grounded
      player.moveDirection = projected.moveDirection
      player.frozenTurnsRemaining = projected.frozenTurnsRemaining
      player.frozenAppliedTurn = projected.frozenAppliedTurn
      if (projected.facing === -1 || projected.facing === 1) player.facing = projected.facing
      if (projected.teamId === 0 || projected.teamId === 1) player.teamId = projected.teamId
      if (Number.isSafeInteger(projected.teamSlot)) player.teamSlot = projected.teamSlot
      player.selectedWeapon = projected.selectedWeapon
      const projectedAppearance = {
        version: projected.version,
        body: projected.body,
        primaryColor: projected.primaryColor,
        accentColor: projected.accentColor,
        pattern: projected.pattern,
        face: projected.face,
        victoryStyle: projected.victoryStyle,
        accessory: projected.accessory,
      }
      player.appearance = validatePlayerAppearance(projectedAppearance)
        ? projectedAppearance
        : player.appearance
      player.inventory = Object.fromEntries(
        WEAPON_ORDER.map((weaponId) => [weaponId, ammo(projected.ammunition.get(weaponId) ?? 0)]),
      ) as WeaponInventory
    }
    const projected = [...schema.projectiles.values()]
    const ids = new Set(projected.map((projectile) => projectile.id))
    state.projectiles = state.projectiles.filter((projectile) => ids.has(projectile.id))
    for (const source of projected) {
      let projectile = state.projectiles.find((candidate) => candidate.id === source.id)
      if (!projectile) {
        projectile = {
          id: source.id,
          actionId: source.actionId,
          ownerId: source.ownerId,
          weaponId: source.weaponId,
          kind: source.kind,
          position: { x: source.x, y: source.y },
          velocity: { x: source.velocityX, y: source.velocityY },
          radius: source.radius,
          fuseTicks: source.fuseTicks,
        }
        state.projectiles.push(projectile)
      }
      projectile.velocity = { x: source.velocityX, y: source.velocityY }
      projectile.fuseTicks = source.fuseTicks
      const position = { x: source.x, y: source.y }
      const sample = {
        tick: schema.simulationTick,
        receivedAt,
        position,
        velocity: { x: source.velocityX, y: source.velocityY },
      }
      if (
        Math.hypot(position.x - projectile.position.x, position.y - projectile.position.y) >=
        INTERPOLATION_SNAP_THRESHOLD
      ) {
        projectile.position = { ...position }
        this.projectileSamples.set(source.id, [sample])
      } else this.pushSample(this.projectileSamples, source.id, sample)
    }
    for (const id of this.projectileSamples.keys())
      if (!ids.has(id)) this.projectileSamples.delete(id)
    state.beacons = [...schema.beacons.values()].map((beacon) => ({
      id: beacon.id,
      actionId: beacon.actionId,
      ownerId: beacon.ownerId,
      weaponId: beacon.weaponId,
      position: { x: beacon.x, y: beacon.y },
      remainingTicks: beacon.remainingTicks,
    }))
    if (schema.result.available) {
      const winnerSeat = schema.result.winnerSeat
      const winnerTeamId = schema.result.winnerTeamId ?? state.players[winnerSeat]?.teamId ?? -1
      state.winnerPlayerId = winnerSeat >= 0 ? (state.players[winnerSeat]?.id ?? null) : null
      state.winnerTeamId = winnerTeamId === 0 || winnerTeamId === 1 ? winnerTeamId : null
      state.isDraw = winnerSeat < 0
      const winnerPlayerIndices = state.players
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => player.teamId === state.winnerTeamId)
        .map(({ index }) => index)
      this.queueResult({
        config: state.config,
        winnerIndex: winnerSeat >= 0 ? winnerSeat : null,
        winnerTeamId: state.winnerTeamId,
        winnerPlayerIndices,
        remainingHealth: schema.result.remainingHealth,
        turnsTaken: schema.result.turnsTaken,
        durationSeconds: schema.result.durationSeconds,
        playerRecaps: state.players.map((player) => ({
          playerId: player.id, damageDealt: 0, selfDamage: 0, shots: 0, terrainDestroyed: 0, favoriteWeaponId: null,
        })),
      })
    }
    for (const listener of this.stateListeners) listener(state)
  }

  private applyEvents(events: MatchEvent[], fromSequence: number): void {
    if (this.disposed) return
    if (!Array.isArray(events) || events.length === 0) return
    if (fromSequence > this.lastEventSequence + 1) {
      this.requestSnapshot()
      return
    }
    for (const event of events) {
      if (!isRecord(event) || !Number.isSafeInteger(event.sequence)) continue
      if (event.sequence <= this.lastEventSequence) continue
      if (event.sequence !== this.lastEventSequence + 1) {
        this.requestSnapshot()
        return
      }
      if (event.type === 'terrain-destroyed' || event.type === 'terrain-created') {
        const operation = event.operation
        if (operation.sequence > this.lastTerrainSequence + 1) {
          this.requestSnapshot()
          return
        }
        if (operation.sequence > this.lastTerrainSequence) {
          if (operation.type === 'add-ring')
            this.terrain?.addRing(
              operation.x,
              operation.y,
              operation.innerRadius ?? 0,
              operation.radius,
            )
          else this.terrain?.removeCircle(operation.x, operation.y, operation.radius)
          this.lastTerrainSequence = operation.sequence
          this.snapshotState?.terrainOperations.push(structuredClone(operation))
        }
      }
      if (event.type === 'teleported' && this.snapshotState) {
        const seat = this.snapshotState.players.findIndex((player) => player.id === event.playerId)
        if (seat >= 0) {
          this.snapshotState.players[seat].position = { ...event.to }
          this.playerSamples.set(seat, [])
        }
      }
      if (event.type === 'projectile-reflected' && this.snapshotState) {
        const projectile = this.snapshotState.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        )
        if (projectile) {
          projectile.position = { ...event.position }
          projectile.velocity = { ...event.outgoingVelocity }
          this.projectileSamples.set(projectile.id, [])
        }
      }
      if (event.type === 'projectile-boundary-reflected' && this.snapshotState) {
        const projectile = this.snapshotState.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        )
        if (projectile) {
          projectile.position = { ...event.position }
          projectile.velocity = { ...event.outgoingVelocity }
          this.projectileSamples.set(projectile.id, [])
        }
      }
      if (event.type === 'projectile-wrapped' && this.snapshotState) {
        const projectile = this.snapshotState.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        )
        if (projectile) {
          projectile.position = { ...event.to }
          projectile.velocity = { ...event.velocity }
          this.projectileSamples.set(projectile.id, [])
        }
      }
      if (event.type === 'projectile-boundary-removed' && this.snapshotState) {
        this.snapshotState.projectiles = this.snapshotState.projectiles.filter(
          (projectile) => projectile.id !== event.projectileId,
        )
        this.projectileSamples.delete(event.projectileId)
      }
      if (event.type === 'projectile-portaled' && this.snapshotState) {
        const projectile = this.snapshotState.projectiles.find(
          (candidate) => candidate.id === event.projectileId,
        )
        if (projectile) {
          projectile.position = { ...event.to }
          projectile.velocity = { ...event.outgoingVelocity }
          this.projectileSamples.set(projectile.id, [])
        }
      }
      if (event.type === 'beacon-deployed' && this.snapshotState)
        this.snapshotState.beacons.push(structuredClone(event.beacon))
      if (event.type === 'barrage-released' && this.snapshotState)
        this.snapshotState.beacons = this.snapshotState.beacons.filter(
          (beacon) => beacon.actionId !== event.actionId,
        )
      this.lastEventSequence = event.sequence
      if (
        event.type === 'match-ended' &&
        this.resultQueuedForMatch === (this.snapshotState?.matchId ?? '')
      )
        continue
      this.events.push(structuredClone(event))
      if (event.type === 'match-ended')
        this.resultQueuedForMatch = this.snapshotState?.matchId ?? ''
    }
  }

  private queueResult(result: SimulationMatchResult): void {
    const matchId = this.snapshotState?.matchId ?? ''
    if (this.resultQueuedForMatch === matchId) return
    this.resultQueuedForMatch = matchId
    this.events.push({
      type: 'match-ended',
      sequence: this.lastEventSequence + 1,
      tick: this.snapshotState?.tick ?? 0,
      result,
    })
  }

  private refreshTargets(): void {
    if (!this.snapshotState) return
    const receivedAt = performance.now()
    this.playerSamples.clear()
    this.snapshotState.players.forEach((player, seat) =>
      this.playerSamples.set(seat, [
        {
          tick: this.snapshotState!.tick,
          receivedAt,
          position: { ...player.position },
          velocity: { ...player.velocity },
        },
      ]),
    )
    this.projectileSamples.clear()
    for (const projectile of this.snapshotState.projectiles)
      this.projectileSamples.set(projectile.id, [
        {
          tick: this.snapshotState.tick,
          receivedAt,
          position: { ...projectile.position },
          velocity: { ...projectile.velocity },
        },
      ])
  }

  private pushSample<Key>(
    samples: Map<Key, PositionSample[]>,
    key: Key,
    sample: PositionSample,
  ): void {
    const history = samples.get(key) ?? []
    if (history.at(-1)?.tick === sample.tick) history[history.length - 1] = sample
    else history.push(sample)
    if (history.length > 8) history.splice(0, history.length - 8)
    samples.set(key, history)
  }

  private cancelPendingCommands(): void {
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout)
      pending.resolve({
        accepted: false,
        commandId,
        authoritativeTick: this.snapshotState?.tick ?? 0,
        reason: 'navigation-cancelled',
      })
    }
    this.pendingCommands.clear()
  }

  private keepLatestSample<Key>(samples: Map<Key, PositionSample[]>, key: Key): void {
    const latest = samples.get(key)?.at(-1)
    if (latest) samples.set(key, [latest])
  }
}
