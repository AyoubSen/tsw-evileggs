import type { Room } from '@colyseus/sdk'
import type { MatchSource, MatchSourceCommandResult } from '../game/matchSource'
import type { MatchCommandInput } from '../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../simulation/match/MatchEvent'
import type { MatchState, SimProjectile } from '../simulation/match/MatchState'
import { reconstructTerrain } from '../simulation/match/MatchSimulation'
import { SIMULATION_HZ } from '../simulation/match/MatchState'
import type { TerrainMask } from '../terrain/TerrainMask'
import type { Vector } from '../shared/types'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/constants'
import { NETWORK_MESSAGE_TYPE, type FullSnapshotMessage, type ServerRoomMessage } from './protocol'

type StateListener = (state: MatchState) => void
type PendingCommand = {
  resolve: (result: MatchSourceCommandResult) => void
  timeout: ReturnType<typeof setTimeout>
}

type SchemaPlayer = {
  playerId: string
  sessionId: string
  seat: 0 | 1
  x: number
  y: number
  velocityX: number
  velocityY: number
  health: number
  alive: boolean
  grounded: boolean
  moveDirection: -1 | 0 | 1
  selectedWeapon: MatchState['players'][number]['selectedWeapon']
  basicRocketAmmo: number
  timedGrenadeAmmo: number
  scatterShotAmmo: number
  clusterChargeAmmo: number
  teleporterAmmo: number
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

type OnlineSchemaState = {
  phase: string
  matchGeneration: number
  simulationTick: number
  turnNumber: number
  activePlayerSeat: number
  matchPhase: MatchState['phase']
  timerRemainingTicks: number
  result: {
    available: boolean
    winnerSeat: number
    remainingHealth: number
    turnsTaken: number
    durationSeconds: number
  }
  players: { values(): IterableIterator<SchemaPlayer> }
  projectiles: { values(): IterableIterator<SchemaProjectile> }
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
  private readonly targetPlayers = new Map<number, Vector>()
  private readonly targetProjectiles = new Map<string, Vector>()
  private listenerDisposers: Array<() => void> = []
  private commandId = 0
  private lastEventSequence = 0
  private lastTerrainSequence = 0
  private matchGeneration = 0
  private inputPaused = false
  private disposed = false
  private resultQueuedForMatch = ''
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

  get localSeat(): 0 | 1 | null {
    const state = this.room.state as unknown as OnlineSchemaState
    if (!state?.players) return null
    const player = [...state.players.values()].find(
      (candidate) => candidate.sessionId === this.room.sessionId,
    )
    return player?.seat ?? null
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !this.snapshotState) return
    const alpha = 1 - Math.exp(-Math.max(0, deltaSeconds) * 18)
    this.snapshotState.players.forEach((player, seat) => {
      const target = this.targetPlayers.get(seat)
      if (!target) return
      player.position.x += (target.x - player.position.x) * alpha
      player.position.y += (target.y - player.position.y) * alpha
    })
    for (const projectile of this.snapshotState.projectiles) {
      const target = this.targetProjectiles.get(projectile.id)
      if (!target) continue
      projectile.position.x += (target.x - projectile.position.x) * alpha
      projectile.position.y += (target.y - projectile.position.y) * alpha
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

  isValidTeleport(target: Vector): boolean {
    if (!this.snapshotState || !this.terrain) return false
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return false
    if (target.x < 20 || target.x > GAME_WIDTH - 20 || target.y < 20 || target.y > GAME_HEIGHT - 20)
      return false
    if (this.terrain.isSolid(target.x, target.y) || this.terrain.isSolid(target.x, target.y + 14))
      return false
    const surface = this.terrain.surfaceY(target.x, target.y)
    if (surface === null || surface - target.y > 24 || surface - target.y < 10) return false
    return !this.state.players.some(
      (player, seat) =>
        seat !== this.localSeat &&
        player.alive &&
        Math.hypot(player.position.x - target.x, player.position.y - target.y) < player.radius * 2,
    )
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
    this.targetPlayers.clear()
    this.targetProjectiles.clear()
  }

  private receiveServerMessage(value: unknown): void {
    if (this.disposed) return
    if (!isRecord(value) || typeof value.type !== 'string') return
    const message = value as ServerRoomMessage
    if (message.type === 'full-snapshot') this.applySnapshot(message)
    else if (message.type === 'simulation-events')
      this.applyEvents(message.events, message.fromSequence)
    else if (message.type === 'command-result') {
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
    } else if (message.type === 'match-result') this.queueResult(message.result)
  }

  private applySnapshot(message: FullSnapshotMessage): void {
    if (this.disposed) return
    if (message.snapshot.version !== 1 || !message.snapshot.state) return
    this.snapshotState = structuredClone(message.snapshot.state)
    this.terrain = reconstructTerrain(
      this.snapshotState.mapId,
      this.snapshotState.terrainOperations,
    )
    this.lastEventSequence = message.lastEventSequence
    this.lastTerrainSequence = message.lastTerrainSequence
    if (message.matchGeneration !== this.matchGeneration) this.commandId = 0
    this.matchGeneration = message.matchGeneration
    this.refreshTargets()
    if (this.snapshotState.phase === 'victory') this.queueResult(this.resultFromState())
    for (const listener of this.stateListeners) listener(this.snapshotState)
  }

  private applyProjection(schema: OnlineSchemaState): void {
    if (this.disposed || !this.snapshotState || schema.matchGeneration !== this.matchGeneration)
      return
    const state = this.snapshotState
    state.tick = schema.simulationTick
    state.turnNumber = schema.turnNumber
    state.activePlayerIndex = schema.activePlayerSeat as 0 | 1
    state.phase = schema.matchPhase
    state.paused = schema.phase !== 'playing'
    state.timerRemainingTicks = schema.timerRemainingTicks
    for (const projected of schema.players.values()) {
      const player = state.players[projected.seat]
      if (projected.sessionId === this.room.sessionId) this.playerId = projected.playerId
      this.targetPlayers.set(projected.seat, { x: projected.x, y: projected.y })
      player.velocity = { x: projected.velocityX, y: projected.velocityY }
      player.health = projected.health
      player.alive = projected.alive
      player.grounded = projected.grounded
      player.moveDirection = projected.moveDirection
      player.selectedWeapon = projected.selectedWeapon
      player.inventory = {
        'basic-rocket': ammo(projected.basicRocketAmmo),
        'timed-grenade': ammo(projected.timedGrenadeAmmo),
        'scatter-shot': ammo(projected.scatterShotAmmo),
        'cluster-charge': ammo(projected.clusterChargeAmmo),
        teleporter: ammo(projected.teleporterAmmo),
      }
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
      this.targetProjectiles.set(source.id, { x: source.x, y: source.y })
    }
    for (const id of this.targetProjectiles.keys())
      if (!ids.has(id)) this.targetProjectiles.delete(id)
    if (schema.result.available) {
      const winnerSeat = schema.result.winnerSeat
      state.winnerPlayerId = winnerSeat >= 0 ? (state.players[winnerSeat]?.id ?? null) : null
      state.isDraw = winnerSeat < 0
      this.queueResult({
        config: state.config,
        winnerIndex: winnerSeat >= 0 ? winnerSeat : null,
        remainingHealth: schema.result.remainingHealth,
        turnsTaken: schema.result.turnsTaken,
        durationSeconds: schema.result.durationSeconds,
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
      if (event.type === 'terrain-destroyed') {
        const operation = event.operation
        if (operation.sequence > this.lastTerrainSequence + 1) {
          this.requestSnapshot()
          return
        }
        if (operation.sequence > this.lastTerrainSequence) {
          this.terrain?.removeCircle(operation.x, operation.y, operation.radius)
          this.lastTerrainSequence = operation.sequence
          this.snapshotState?.terrainOperations.push(structuredClone(operation))
        }
      }
      this.lastEventSequence = event.sequence
      this.events.push(structuredClone(event))
    }
  }

  private queueResult(result: SimulationMatchResult): void {
    const matchId = this.snapshotState?.matchId ?? ''
    if (this.resultQueuedForMatch === matchId) return
    this.resultQueuedForMatch = matchId
    this.events.push({
      type: 'match-ended',
      sequence: this.lastEventSequence,
      tick: this.snapshotState?.tick ?? 0,
      result,
    })
  }

  private resultFromState(): SimulationMatchResult {
    const state = this.state
    const winnerIndex = state.winnerPlayerId
      ? state.players.findIndex((player) => player.id === state.winnerPlayerId)
      : null
    const winner = winnerIndex === null ? null : state.players[winnerIndex]
    return {
      config: state.config,
      winnerIndex,
      remainingHealth: winner ? Math.ceil(winner.health) : 0,
      turnsTaken: state.turnNumber,
      durationSeconds: Math.floor(state.durationTicks / SIMULATION_HZ),
    }
  }

  private refreshTargets(): void {
    if (!this.snapshotState) return
    this.targetPlayers.clear()
    this.snapshotState.players.forEach((player, seat) =>
      this.targetPlayers.set(seat, { ...player.position }),
    )
    this.targetProjectiles.clear()
    for (const projectile of this.snapshotState.projectiles)
      this.targetProjectiles.set(projectile.id, { ...projectile.position })
  }
}
