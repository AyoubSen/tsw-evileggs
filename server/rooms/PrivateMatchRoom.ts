import { randomInt, randomUUID } from 'node:crypto'
import { ErrorCode, Room, ServerError, type Client, type Messages } from '@colyseus/core'
import {
  DEFAULT_PLAYER_NAMES,
  PLAYER_COUNT_BY_MODE,
  sanitizePlayerName,
  type LocalMatchConfig,
} from '../../src/match/config'
import type { MatchMode, TeamId } from '../../src/maps/registry'
import {
  CURRENT_COMPATIBILITY,
  MAX_NETWORK_MESSAGE_BYTES,
  NETWORK_MESSAGE_TYPE,
  clientRoomMessageSchema,
  compatibilityError,
  createRoomOptionsSchema,
  joinRoomOptionsSchema,
  type ClientRoomMessage,
  type NetworkCommandRejection,
  type RoomPhase,
  type ServerRoomMessage,
} from '../../src/network/protocol'
import type { MatchCommand } from '../../src/simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../../src/simulation/match/MatchEvent'
import { MatchSimulation } from '../../src/simulation/match/MatchSimulation'
import { FIXED_TICK_SECONDS } from '../../src/simulation/match/MatchState'
import { matchStateChecksum } from '../../src/simulation/serialization/matchSerialization'
import { roomLog } from '../logger'
import { roomCodeRegistry } from '../roomCodeRegistry'
import {
  MatchResultState,
  PrivateMatchState,
  RoomPlayerState,
  projectSimulationState,
} from '../schema/PrivateMatchState'

const START_COUNTDOWN_MS = 3000
const RESUME_COUNTDOWN_MS = 2000
const RECONNECT_GRACE_SECONDS = 30
const MAX_RECENT_EVENTS = 256
const MAX_COMMANDS_PER_SECOND = 24
const MAX_MOVE_TOGGLES_PER_SECOND = 12

type RoomMetadata = {
  code: string
  phase: string
  connectedPlayers: number
  capacity: number
  mode: Extract<MatchMode, '1v1' | '2v2'>
}

type ClientData = {
  playerId: string
  seat: number
  commandWindowStartedAt: number
  commandCount: number
  movementWindowStartedAt: number
  movementCount: number
}

type QueuedCommand = {
  receivedOrder: number
  playerId: string
  seat: number
  commandId: number
  expectedTurn: number
  matchGeneration: number
  command: ClientRoomMessage & { type: 'command' }
  client: Client
}

export class PrivateMatchRoom extends Room<{
  state: PrivateMatchState
  metadata: RoomMetadata
}> {
  state = new PrivateMatchState()
  maxClients = 4
  patchRate = 50
  maxMessagesPerSecond = 40
  autoDispose = true

  private simulation: MatchSimulation | null = null
  private commandQueue: QueuedCommand[] = []
  private recentEvents: MatchEvent[] = []
  private receivedOrder = 0
  private simulationCommandSequence = 0
  private simulationAccumulator = 0
  private countdownRemainingMs = 0
  private roomCode = ''
  private reconnectGraceSeconds = RECONNECT_GRACE_SECONDS
  private matchHasBegun = false

  messages: Messages<this> = {
    [NETWORK_MESSAGE_TYPE]: (client: Client, payload: unknown) =>
      this.receiveMessage(client, payload),
    '*': (client: Client) =>
      this.sendTo(client, {
        type: 'room-error',
        code: 'unknown-message',
        message: 'That room message is not supported.',
      }),
  }

  async onCreate(options: unknown): Promise<void> {
    const parsed = createRoomOptionsSchema.safeParse(options)
    if (!parsed.success)
      throw new ServerError(ErrorCode.INVALID_PAYLOAD, 'Invalid private-room configuration.')
    const incompatibility = compatibilityError(parsed.data.compatibility)
    if (incompatibility)
      throw new ServerError(ErrorCode.AUTH_FAILED, `Incompatible game version: ${incompatibility}`)

    const capacity = PLAYER_COUNT_BY_MODE[parsed.data.mode]
    this.maxClients = capacity
    const entry = roomCodeRegistry.register(this.roomId, capacity, parsed.data.mode)
    this.roomCode = entry.code
    this.state.roomCode = entry.code
    this.state.mode = parsed.data.mode
    this.state.capacity = capacity
    this.state.mapId = parsed.data.mapId
    this.state.turnDurationSeconds = parsed.data.turnDurationSeconds
    this.state.protocolVersion = CURRENT_COMPATIBILITY.protocol
    this.state.mapRegistryVersion = CURRENT_COMPATIBILITY.maps
    this.state.weaponRegistryVersion = CURRENT_COMPATIBILITY.weapons
    this.metadata = {
      code: entry.code,
      phase: 'waiting',
      connectedPlayers: 0,
      capacity,
      mode: parsed.data.mode,
    }
    await this.setMatchmaking({ private: true, metadata: this.metadata, maxClients: capacity })
    this.setSimulationInterval((deltaMs) => this.updateRoom(deltaMs), 1000 / 60)
    roomLog('room-created', { roomId: this.roomId, roomCode: this.roomCode })
  }

  onAuth(_client: Client, options: unknown): boolean {
    const parsed = createRoomOptionsSchema.safeParse(options)
    const joinParsed = joinRoomOptionsSchema.safeParse(options)
    const data = parsed.success ? parsed.data : joinParsed.success ? joinParsed.data : null
    if (!data) throw new ServerError(ErrorCode.INVALID_PAYLOAD, 'Invalid join request.')
    const incompatibility = compatibilityError(data.compatibility)
    if (incompatibility)
      throw new ServerError(ErrorCode.AUTH_FAILED, `Incompatible game version: ${incompatibility}`)
    if (this.state.phase !== 'waiting')
      throw new ServerError(ErrorCode.APPLICATION_ERROR, 'This match has already started.')
    if (this.state.players.size >= this.state.capacity)
      throw new ServerError(ErrorCode.APPLICATION_ERROR, 'This private room is already full.')
    return true
  }

  onJoin(client: Client, options: unknown): void {
    const playerName =
      typeof options === 'object' && options !== null && 'playerName' in options
        ? (options as { playerName: unknown }).playerName
        : undefined
    const seat = this.availableSeat()
    if (seat === null)
      throw new ServerError(ErrorCode.APPLICATION_ERROR, 'This private room is already full.')
    const playerId = `room-player-${seat + 1}-${randomUUID().slice(0, 8)}`
    const player = new RoomPlayerState()
    player.playerId = playerId
    player.seat = seat
    player.teamId = seat % 2
    player.teamSlot = Math.floor(seat / 2)
    player.name = sanitizePlayerName(
      playerName,
      DEFAULT_PLAYER_NAMES[seat] ?? `Player ${seat + 1}`,
    )
    player.sessionId = client.sessionId
    this.state.players.set(playerId, player)
    client.userData = {
      playerId,
      seat,
      commandWindowStartedAt: this.clock.currentTime,
      commandCount: 0,
      movementWindowStartedAt: this.clock.currentTime,
      movementCount: 0,
    } satisfies ClientData
    this.updateListing()
    roomLog('player-joined', {
      roomCode: this.roomCode,
      playerId,
      seat,
      connectedPlayers: this.connectedPlayerCount(),
    })
  }

  onDrop(client: Client): void {
    const player = this.playerFor(client)
    if (!player) return
    player.connected = false
    player.ready = false
    this.clearHeldInput(player.seat)
    if (this.state.phase === 'playing' || this.state.phase === 'starting') {
      this.simulation?.setPaused(true)
      this.state.phase = 'reconnecting'
      this.state.reconnectRemainingMs = this.reconnectGraceSeconds * 1000
      this.countdownRemainingMs = 0
      this.state.countdownRemainingMs = 0
      this.updatePhaseListing()
    }
    this.updateListing()
    roomLog('player-dropped', { roomCode: this.roomCode, playerId: player.playerId })
    void this.allowReconnection(client, this.reconnectGraceSeconds).catch(() => undefined)
  }

  onReconnect(client: Client): void {
    const player = this.playerFor(client)
    if (!player) return
    player.connected = true
    player.sessionId = client.sessionId
    this.state.reconnectRemainingMs = 0
    if (this.state.phase === 'reconnecting' && this.allPlayersConnected()) {
      this.countdownRemainingMs = RESUME_COUNTDOWN_MS
      this.state.countdownRemainingMs = RESUME_COUNTDOWN_MS
    }
    this.sendSnapshot(client)
    this.updateListing()
    roomLog('player-reconnected', {
      roomCode: this.roomCode,
      playerId: player.playerId,
      seat: player.seat,
    })
  }

  onLeave(client: Client, code?: number): void {
    const player = this.playerFor(client)
    if (!player) return
    this.clearHeldInput(player.seat)
    player.connected = false
    const activeMatch = ['starting', 'playing', 'reconnecting'].includes(this.state.phase)
    if (activeMatch && this.simulation) {
      if (!this.matchHasBegun) this.cancelPendingStart(player.playerId)
      else {
        this.finishByForfeit((player.teamId === 0 ? 1 : 0) as TeamId)
        this.state.players.delete(player.playerId)
      }
    } else {
      this.state.players.delete(player.playerId)
      for (const remaining of this.state.players.values()) remaining.wantsRematch = false
    }
    this.updateListing()
    roomLog('player-left', {
      roomCode: this.roomCode,
      playerId: player.playerId,
      code,
      phase: this.state.phase,
    })
  }

  onDispose(): void {
    this.state.phase = 'disposed'
    roomCodeRegistry.remove(this.roomCode)
    roomLog('room-disposed', { roomId: this.roomId, roomCode: this.roomCode })
  }

  onUncaughtException(error: Error, methodName: string): void {
    roomLog('room-error', { roomCode: this.roomCode, methodName, message: error.message })
  }

  finishForBrowserTest(): void {
    if (process.env.ENABLE_TEST_ROUTES !== 'true') throw new Error('Test routes are disabled')
    if (this.state.phase !== 'playing') throw new Error('Match is not playing')
    this.finishByForfeit(0)
  }

  private receiveMessage(client: Client, payload: unknown): void {
    let bytes = MAX_NETWORK_MESSAGE_BYTES + 1
    try {
      bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
    } catch {
      // Circular and unserializable payloads are rejected below.
    }
    if (bytes > MAX_NETWORK_MESSAGE_BYTES) {
      this.roomError(client, 'message-too-large', 'That room message is too large.')
      return
    }
    const parsed = clientRoomMessageSchema.safeParse(payload)
    if (!parsed.success) {
      this.roomError(client, 'malformed-message', 'That room message was malformed.')
      return
    }
    const player = this.playerFor(client)
    if (!player) {
      this.roomError(client, 'not-seated', 'You do not have a player seat in this room.')
      return
    }
    const message = parsed.data as ClientRoomMessage
    if (message.type === 'set-ready') this.setReady(player, message.ready)
    else if (message.type === 'command') this.queueCommand(client, player, message)
    else if (message.type === 'request-snapshot') this.sendSnapshot(client)
    else if (message.type === 'rematch-vote') this.setRematchVote(player, message.wantsRematch)
    else this.sendTo(client, { type: 'latency-pong', nonce: message.nonce })
  }

  private setReady(player: RoomPlayerState, ready: boolean): void {
    if (this.state.phase !== 'waiting') return
    player.ready = ready
    if (this.canStartMatch()) this.beginMatch()
  }

  private beginMatch(): void {
    if (this.state.phase !== 'waiting' && this.state.phase !== 'results') return
    const players = Array.from({ length: this.state.capacity }, (_, seat) =>
      this.playerAtSeat(seat),
    )
    if (players.some((player) => !player?.connected)) return
    const config: LocalMatchConfig = {
      mode: this.state.mode as LocalMatchConfig['mode'],
      playerNames: players.map((player) => player!.name),
      mapId: this.state.mapId as LocalMatchConfig['mapId'],
      turnDurationSeconds: this.state
        .turnDurationSeconds as LocalMatchConfig['turnDurationSeconds'],
    }
    this.state.matchGeneration += 1
    this.simulation = new MatchSimulation(config, {
      seed: randomInt(1, 0x1_0000_0000),
      matchId: `${this.roomId}-${this.state.matchGeneration}`,
    })
    this.simulation.setPaused(true)
    this.simulationAccumulator = 0
    this.matchHasBegun = false
    this.simulationCommandSequence = 0
    this.receivedOrder = 0
    this.commandQueue = []
    this.recentEvents = []
    this.state.projectiles.clear()
    this.state.result = new MatchResultState()
    for (const player of this.state.players.values()) {
      player.ready = false
      player.wantsRematch = false
      player.latestCommandId = 0
    }
    this.countdownRemainingMs = START_COUNTDOWN_MS
    this.state.countdownRemainingMs = START_COUNTDOWN_MS
    this.state.phase = 'starting'
    projectSimulationState(this.state, this.simulation.state)
    this.updatePhaseListing()
    for (const client of this.clients) this.sendSnapshot(client)
    roomLog('match-starting', {
      roomCode: this.roomCode,
      generation: this.state.matchGeneration,
      mapId: config.mapId,
    })
  }

  private queueCommand(
    client: Client,
    player: RoomPlayerState,
    message: ClientRoomMessage & { type: 'command' },
  ): void {
    const data = client.userData as ClientData
    if (!this.withinCommandRate(data, message.command.type === 'move')) {
      this.rejectCommand(client, message.commandId, 'rate-limited')
      return
    }
    if (message.commandId <= player.latestCommandId) {
      this.rejectCommand(client, message.commandId, 'duplicate-command')
      return
    }
    player.latestCommandId = message.commandId
    if (message.matchGeneration !== this.state.matchGeneration) {
      this.rejectCommand(client, message.commandId, 'wrong-match')
      return
    }
    if (!this.simulation || this.state.phase !== 'playing') {
      this.rejectCommand(client, message.commandId, 'match-not-accepting-input')
      return
    }
    if (message.expectedTurn < this.simulation.state.turnNumber) {
      this.rejectCommand(client, message.commandId, 'stale-turn')
      return
    }
    if (message.expectedTurn > this.simulation.state.turnNumber) {
      this.rejectCommand(client, message.commandId, 'future-turn')
      return
    }
    this.commandQueue.push({
      receivedOrder: ++this.receivedOrder,
      playerId: player.playerId,
      seat: player.seat,
      commandId: message.commandId,
      expectedTurn: message.expectedTurn,
      matchGeneration: message.matchGeneration,
      command: message,
      client,
    })
  }

  private updateRoom(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return
    if (this.state.phase === 'starting') {
      this.advanceCountdown(deltaMs, false)
      return
    }
    if (this.state.phase === 'reconnecting') {
      if (this.state.reconnectRemainingMs > 0)
        this.state.reconnectRemainingMs = Math.max(0, this.state.reconnectRemainingMs - deltaMs)
      if (this.countdownRemainingMs > 0) this.advanceCountdown(deltaMs, true)
      return
    }
    if (this.state.phase !== 'playing' || !this.simulation) return
    this.simulationAccumulator = Math.min(this.simulationAccumulator + deltaMs / 1000, 0.25)
    while (this.simulationAccumulator + Number.EPSILON >= FIXED_TICK_SECONDS) {
      this.processCommandQueue()
      this.simulation.step()
      this.simulationAccumulator -= FIXED_TICK_SECONDS
      const events = this.simulation.drainEvents()
      if (events.length) this.deliverEvents(events)
      if (this.simulation.state.phase === 'victory') {
        this.finishNormally()
        break
      }
    }
    projectSimulationState(this.state, this.simulation.state)
  }

  private advanceCountdown(deltaMs: number, reconnecting: boolean): void {
    if (!this.simulation) return
    this.countdownRemainingMs = Math.max(0, this.countdownRemainingMs - deltaMs)
    this.state.countdownRemainingMs = Math.ceil(this.countdownRemainingMs)
    if (this.countdownRemainingMs > 0) return
    if (!this.allPlayersConnected()) return
    this.state.reconnectRemainingMs = 0
    this.state.phase = 'playing'
    this.matchHasBegun = true
    this.simulation.setPaused(false)
    this.updatePhaseListing()
    for (const client of this.clients) this.sendSnapshot(client)
    roomLog(reconnecting ? 'match-resumed' : 'match-started', {
      roomCode: this.roomCode,
      generation: this.state.matchGeneration,
      tick: this.simulation.state.tick,
    })
  }

  private processCommandQueue(): void {
    if (!this.simulation || this.commandQueue.length === 0) return
    const queue = this.commandQueue.sort((left, right) => left.receivedOrder - right.receivedOrder)
    this.commandQueue = []
    for (const queued of queue) {
      if (queued.matchGeneration !== this.state.matchGeneration) {
        this.rejectCommand(queued.client, queued.commandId, 'wrong-match')
        continue
      }
      const simulationPlayerId = this.simulation.state.players[queued.seat].id
      const command = {
        ...queued.command.command,
        sequence: ++this.simulationCommandSequence,
        expectedTurn: queued.expectedTurn,
        playerId: simulationPlayerId,
      } as MatchCommand
      const result = this.simulation.applyCommand(command)
      this.sendTo(queued.client, {
        type: 'command-result',
        commandId: queued.commandId,
        accepted: result.accepted,
        ...(result.accepted ? {} : { reason: result.reason }),
        authoritativeTick: this.simulation.state.tick + 1,
        matchGeneration: this.state.matchGeneration,
      })
      if (!result.accepted)
        roomLog('command-rejected', {
          roomCode: this.roomCode,
          playerId: queued.playerId,
          commandId: queued.commandId,
          reason: result.reason,
        })
      if (result.accepted && ['fire', 'teleport'].includes(queued.command.command.type))
        this.clearAllHeldInput()
    }
  }

  private deliverEvents(events: MatchEvent[]): void {
    this.recentEvents.push(...events)
    if (this.recentEvents.length > MAX_RECENT_EVENTS)
      this.recentEvents.splice(0, this.recentEvents.length - MAX_RECENT_EVENTS)
    this.broadcast(NETWORK_MESSAGE_TYPE, {
      type: 'simulation-events',
      matchGeneration: this.state.matchGeneration,
      fromSequence: events[0].sequence,
      events,
    } satisfies ServerRoomMessage)
  }

  private sendSnapshot(client: Client): void {
    if (!this.simulation) return
    const snapshot = this.simulation.snapshot()
    this.sendTo(client, {
      type: 'full-snapshot',
      snapshot,
      checksum: matchStateChecksum(snapshot.state),
      lastEventSequence: Math.max(0, snapshot.state.nextEventSequence - 1),
      lastTerrainSequence: Math.max(0, snapshot.state.nextTerrainSequence - 1),
      matchGeneration: this.state.matchGeneration,
    })
    roomLog('snapshot-sent', {
      roomCode: this.roomCode,
      tick: snapshot.state.tick,
      generation: this.state.matchGeneration,
    })
  }

  private finishNormally(): void {
    if (!this.simulation || this.state.phase === 'results') return
    this.enterResults(this.simulation.getResult(), 'normal')
  }

  private finishByForfeit(winnerTeamId: TeamId): void {
    if (!this.simulation || this.state.phase === 'results') return
    const state = this.simulation.state
    const winnerIndex = state.players.findIndex((player) => player.teamId === winnerTeamId)
    state.phase = 'victory'
    state.paused = true
    state.timerRemainingTicks = 0
    state.winnerPlayerId = state.players[winnerIndex]?.id ?? null
    state.winnerTeamId = winnerTeamId
    state.isDraw = false
    this.clearAllHeldInput()
    this.enterResults(this.simulation.getResult(), 'forfeit')
  }

  private enterResults(result: SimulationMatchResult, reason: 'normal' | 'forfeit'): void {
    if (!this.simulation) return
    this.state.phase = 'results'
    this.state.countdownRemainingMs = 0
    this.state.reconnectRemainingMs = 0
    this.state.result.available = true
    this.state.result.winnerSeat = result.winnerIndex ?? -1
    this.state.result.winnerTeamId = result.winnerTeamId ?? -1
    this.state.result.reason = reason
    this.state.result.remainingHealth = result.remainingHealth
    this.state.result.turnsTaken = result.turnsTaken
    this.state.result.durationSeconds = result.durationSeconds
    projectSimulationState(this.state, this.simulation.state)
    this.broadcast(NETWORK_MESSAGE_TYPE, {
      type: 'match-result',
      matchGeneration: this.state.matchGeneration,
      result,
      reason,
    } satisfies ServerRoomMessage)
    this.updatePhaseListing()
    roomLog('match-result', {
      roomCode: this.roomCode,
      reason,
      winnerSeat: result.winnerIndex,
      tick: this.simulation.state.tick,
    })
  }

  private setRematchVote(player: RoomPlayerState, wantsRematch: boolean): void {
    if (this.state.phase !== 'results') return
    player.wantsRematch = wantsRematch
    const players = [...this.state.players.values()]
    if (
      players.length === this.state.capacity &&
      players.every((candidate) => candidate.connected && candidate.wantsRematch)
    ) {
      roomLog('rematch-starting', { roomCode: this.roomCode })
      this.beginMatch()
    }
  }

  private cancelPendingStart(leavingPlayerId: string): void {
    this.simulation = null
    this.commandQueue = []
    this.recentEvents = []
    this.countdownRemainingMs = 0
    this.matchHasBegun = false
    this.state.phase = 'waiting'
    this.state.countdownRemainingMs = 0
    this.state.reconnectRemainingMs = 0
    this.state.simulationTick = 0
    this.state.turnNumber = 0
    this.state.activePlayerSeat = -1
    this.state.matchPhase = ''
    this.state.timerRemainingTicks = 0
    this.state.eventSequence = 0
    this.state.terrainSequence = 0
    this.state.projectiles.clear()
    this.state.result = new MatchResultState()
    this.state.players.delete(leavingPlayerId)
    for (const remaining of this.state.players.values()) {
      remaining.ready = false
      remaining.wantsRematch = false
    }
    this.updatePhaseListing()
  }

  private rejectCommand(client: Client, commandId: number, reason: NetworkCommandRejection): void {
    this.sendTo(client, {
      type: 'command-result',
      commandId,
      accepted: false,
      reason,
      authoritativeTick: this.simulation?.state.tick ?? 0,
      matchGeneration: this.state.matchGeneration,
    })
  }

  private roomError(client: Client, code: string, message: string): void {
    this.sendTo(client, { type: 'room-error', code, message })
  }

  private sendTo(client: Client, message: ServerRoomMessage): void {
    client.send(NETWORK_MESSAGE_TYPE, message)
  }

  private withinCommandRate(data: ClientData, movement: boolean): boolean {
    const now = this.clock.currentTime
    if (now - data.commandWindowStartedAt >= 1000) {
      data.commandWindowStartedAt = now
      data.commandCount = 0
    }
    data.commandCount += 1
    if (data.commandCount > MAX_COMMANDS_PER_SECOND) return false
    if (!movement) return true
    if (now - data.movementWindowStartedAt >= 1000) {
      data.movementWindowStartedAt = now
      data.movementCount = 0
    }
    data.movementCount += 1
    return data.movementCount <= MAX_MOVE_TOGGLES_PER_SECOND
  }

  private playerFor(client: Client): RoomPlayerState | undefined {
    const data = client.userData as ClientData | undefined
    return data?.playerId ? this.state.players.get(data.playerId) : undefined
  }

  private playerAtSeat(seat: number): RoomPlayerState | undefined {
    return [...this.state.players.values()].find((player) => player.seat === seat)
  }

  private availableSeat(): number | null {
    for (let seat = 0; seat < this.state.capacity; seat += 1)
      if (!this.playerAtSeat(seat)) return seat
    return null
  }

  private connectedPlayerCount(): number {
    return [...this.state.players.values()].filter((player) => player.connected).length
  }

  private allPlayersConnected(): boolean {
    return (
      this.state.players.size === this.state.capacity &&
      this.connectedPlayerCount() === this.state.capacity
    )
  }

  private canStartMatch(): boolean {
    const players = [...this.state.players.values()]
    return (
      players.length === this.state.capacity &&
      players.every((player) => player.connected && player.ready)
    )
  }

  private clearHeldInput(seat: number): void {
    if (!this.simulation) return
    this.simulation.state.players[seat].moveDirection = 0
    this.commandQueue = this.commandQueue.filter((command) => command.seat !== seat)
    projectSimulationState(this.state, this.simulation.state)
  }

  private clearAllHeldInput(): void {
    if (!this.simulation) return
    for (const player of this.simulation.state.players) player.moveDirection = 0
  }

  private updateListing(): void {
    const connectedPlayers = this.connectedPlayerCount()
    roomCodeRegistry.update(this.roomCode, { connectedPlayers })
    void this.setMetadata({ ...this.metadata, connectedPlayers }).catch(() => undefined)
  }

  private updatePhaseListing(): void {
    roomCodeRegistry.update(this.roomCode, { phase: this.state.phase as RoomPhase })
    void this.setMetadata({ ...this.metadata, phase: this.state.phase }).catch(() => undefined)
  }
}
