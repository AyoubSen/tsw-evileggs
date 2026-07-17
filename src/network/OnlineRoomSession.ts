import { Client, type Room } from '@colyseus/sdk'
import type { LocalMatchConfig } from '../match/config'
import {
  CURRENT_COMPATIBILITY,
  NETWORK_MESSAGE_TYPE,
  PRIVATE_MATCH_ROOM,
  normalizeRoomCode,
  type CreateRoomOptions,
  type JoinRoomOptions,
} from './protocol'
import { OnlineMatchSource } from './OnlineMatchSource'
import {
  OnlineLifecycleCancellation,
  isOnlineLifecycleCancellation,
  throwIfOnlineStartupAborted,
} from './onlineLifecycle'
import { roomViewFromSchema, type OnlineRoomView } from './roomView'
import {
  OnlineConnectionError,
  healthNetworkError,
  realtimeConnectionError,
  reconnectConnectionError,
  unknownNetworkError,
} from './connectionErrors'
import { NetworkConfigurationError, joinHttpUrl, runtimeNetworkConfig } from './networkConfig'
import { waitForGameServer } from './serverWarmup'
import {
  DEFAULT_PLAYER_APPEARANCES,
  validatePlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'
import { BRAND } from '../app/branding'
import { resolveAccessoryFit } from '../players/playerVisualRecipes'

export const ONLINE_RECONNECT_STORAGE_KEY = `${BRAND.storageNamespace}:online-reconnection`
const LEGACY_ONLINE_RECONNECT_STORAGE_KEY = 'toybox-artillery:online-reconnection'

type ConnectionStatus = 'connected' | 'reconnecting' | 'failed' | 'left'
export type ConnectionQuality = 'unknown' | 'good' | 'fair' | 'poor'
export const LATENCY_FAIR_THRESHOLD_MS = 140
export const LATENCY_POOR_THRESHOLD_MS = 280
export const LATENCY_STALE_THRESHOLD_MS = 10_000
type StatusListener = (status: ConnectionStatus, message?: string) => void
type QualityListener = (quality: ConnectionQuality, latencyMs: number | null) => void
type RoomViewListener = (view: OnlineRoomView) => void
export type GameTicketProvider = () => Promise<string>

let nextSessionGeneration = 0

export function playerFacingError(
  caught: unknown,
  phase: 'realtime' | 'unknown' = 'unknown',
): Error {
  if (caught instanceof OnlineConnectionError || caught instanceof NetworkConfigurationError)
    return caught
  const message = caught instanceof Error ? caught.message : String(caught)
  if (/full|locked/i.test(message)) return new Error('That private room is already full.')
  if (/already started|match-started/i.test(message))
    return new Error('That room match has already started.')
  if (/identity|ticket|auth(?:entication|orization)? failed/i.test(message))
    return new Error('Your signed-in game identity could not be verified. Please try again.')
  if (/incompatible|version/i.test(message))
    return new Error('Your game version is not compatible with this room.')
  if (/not found|invalid room|room-not-found/i.test(message))
    return new Error('That room code is no longer active.')
  return phase === 'realtime' ? realtimeConnectionError() : unknownNetworkError()
}

async function closeCancelledRoom(room: Room): Promise<void> {
  room.reconnection.enabled = false
  room.reconnection.enqueuedMessages.splice(0)
  await room.leave(true).catch(() => undefined)
}

async function resolvePrivateRoom(code: string, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(
      joinHttpUrl(
        runtimeNetworkConfig().gameHttpBaseUrl,
        `api/private-rooms/${encodeURIComponent(code)}`,
      ),
      { signal },
    )
  } catch (caught) {
    if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
    if (caught instanceof OnlineConnectionError) throw caught
    throw healthNetworkError()
  }
  const payload = (await response.json().catch(() => null)) as {
    roomId?: unknown
    message?: unknown
  } | null
  if (!response.ok) {
    if (typeof payload?.message === 'string') throw new Error(payload.message)
    throw new OnlineConnectionError(
      'server-http',
      `The game server returned HTTP ${response.status}. Please try again.`,
      response.status,
    )
  }
  if (typeof payload?.roomId !== 'string' || !payload.roomId)
    throw new OnlineConnectionError(
      'invalid-response',
      'The game server returned an invalid room response. Please try again later.',
    )
  return payload.roomId
}

export class OnlineRoomSession {
  readonly source: OnlineMatchSource
  readonly generation = ++nextSessionGeneration
  private readonly viewListeners = new Set<RoomViewListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly qualityListeners = new Set<QualityListener>()
  private readonly roomListenerDisposers: Array<() => void> = []
  private currentView: OnlineRoomView | null = null
  private intentionalLeave = false
  private leavePromise: Promise<void> | null = null
  private disposed = false
  private persistedToken = ''
  private currentStatus: ConnectionStatus = 'connected'
  private currentStatusMessage: string | undefined
  private quality: ConnectionQuality = 'unknown'
  private latencyMs: number | null = null
  private lastPongAt = 0
  private latencyInterval: ReturnType<typeof setInterval> | null = null

  private constructor(readonly room: Room) {
    this.source = new OnlineMatchSource(room)
    room.reconnection.minUptime = 0
    room.reconnection.maxRetries = 12
    room.reconnection.maxDelay = 3000

    const onStateChange = (state: unknown) => {
      if (this.disposed) return
      this.currentView = roomViewFromSchema(state as never)
      this.persistReconnection()
      for (const listener of this.viewListeners) listener(this.currentView)
    }
    const onDrop = () => {
      if (!this.disposed) {
        this.resetQuality()
        this.emitStatus('reconnecting', 'Reconnecting to the room...')
      }
    }
    const onReconnect = () => {
      if (this.disposed) return
      this.persistReconnection()
      this.emitStatus('connected')
      this.source.requestSnapshot()
    }
    const onLeave = () => {
      if (this.disposed) return
      this.clearReconnection()
      const reconnectFailed = !this.intentionalLeave && this.currentStatus === 'reconnecting'
      this.emitStatus(
        this.intentionalLeave ? 'left' : 'failed',
        reconnectFailed ? reconnectConnectionError().message : 'The room connection ended.',
      )
      this.dispose()
    }
    const onError = () => {
      if (!this.disposed && this.currentStatus !== 'reconnecting')
        this.emitStatus('reconnecting', 'Checking the room connection...')
    }
    const disposeLatency = room.onMessage(NETWORK_MESSAGE_TYPE, (message: unknown) => {
      if (
        this.disposed ||
        !message ||
        typeof message !== 'object' ||
        (message as { type?: unknown }).type !== 'latency-pong'
      )
        return
      const nonce = (message as { nonce?: unknown }).nonce
      if (typeof nonce !== 'number') return
      this.setLatency(Math.max(0, Date.now() - nonce))
    })

    room.onStateChange(onStateChange)
    room.onDrop(onDrop)
    room.onReconnect(onReconnect)
    room.onLeave(onLeave)
    room.onError(onError)
    this.roomListenerDisposers.push(
      () => room.onStateChange.remove(onStateChange),
      () => room.onDrop.remove(onDrop),
      () => room.onReconnect.remove(onReconnect),
      () => room.onLeave.remove(onLeave),
      () => room.onError.remove(onError),
      disposeLatency,
    )

    const initialState = room.state as unknown as { players?: unknown; result?: unknown }
    if (initialState?.players && initialState.result)
      this.currentView = roomViewFromSchema(room.state as never)
    this.persistReconnection()
    this.latencyInterval = setInterval(() => this.measureLatency(), 4_000)
    this.measureLatency()
  }

  static async create(
    playerName: string,
    config: LocalMatchConfig,
    signal?: AbortSignal,
    gameTicketProvider?: GameTicketProvider,
  ): Promise<OnlineRoomSession> {
    try {
      if (config.mode !== '1v1' && config.mode !== '2v2' && config.mode !== '3v3')
        throw new Error('That match mode is not available for private online rooms.')
      throwIfOnlineStartupAborted(signal)
      await waitForGameServer(signal)
      const client = new Client(runtimeNetworkConfig().colyseusUrl)
      if (!validatePlayerAppearance(config.playerAppearances[0]) || !resolveAccessoryFit(config.playerAppearances[0].body, config.playerAppearances[0].accessory).safe) throw new Error('Invalid or unsafe player appearance.')
      const options: CreateRoomOptions = {
        playerName,
        mode: config.mode,
        mapId: config.mapId,
        projectileBoundaryMode: config.projectileBoundaryMode,
        turnDurationSeconds: config.turnDurationSeconds,
        arsenal: config.arsenal,
        compatibility: CURRENT_COMPATIBILITY,
        playerAppearance: { ...config.playerAppearances[0] },
        ...(gameTicketProvider ? { gameTicket: await gameTicketProvider() } : {}),
      }
      const room = await client.create(PRIVATE_MATCH_ROOM, options)
      if (signal?.aborted) {
        await closeCancelledRoom(room)
        throw new OnlineLifecycleCancellation('aborted-startup')
      }
      return new OnlineRoomSession(room)
    } catch (caught) {
      if (isOnlineLifecycleCancellation(caught)) throw caught
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      throw playerFacingError(caught, 'realtime')
    }
  }

  static async join(
    codeInput: string,
    playerName: string,
    signal?: AbortSignal,
    playerAppearance: Readonly<PlayerAppearance> = DEFAULT_PLAYER_APPEARANCES[0],
    gameTicketProvider?: GameTicketProvider,
  ): Promise<OnlineRoomSession> {
    try {
      throwIfOnlineStartupAborted(signal)
      await waitForGameServer(signal)
      const code = normalizeRoomCode(codeInput)
      const roomId = await resolvePrivateRoom(code, signal)
      throwIfOnlineStartupAborted(signal)
      const client = new Client(runtimeNetworkConfig().colyseusUrl)
      if (!validatePlayerAppearance(playerAppearance) || !resolveAccessoryFit(playerAppearance.body, playerAppearance.accessory).safe) throw new Error('Invalid or unsafe player appearance.')
      const options: JoinRoomOptions = {
        playerName,
        playerAppearance: { ...playerAppearance },
        compatibility: CURRENT_COMPATIBILITY,
        ...(gameTicketProvider ? { gameTicket: await gameTicketProvider() } : {}),
      }
      const room = await client.joinById(roomId, options)
      if (signal?.aborted) {
        await closeCancelledRoom(room)
        throw new OnlineLifecycleCancellation('aborted-startup')
      }
      return new OnlineRoomSession(room)
    } catch (caught) {
      if (isOnlineLifecycleCancellation(caught)) throw caught
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      throw playerFacingError(caught, 'realtime')
    }
  }

  static async reconnectStored(signal?: AbortSignal): Promise<OnlineRoomSession | null> {
    let token: string | null
    try {
      token = sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)
      if (!token) {
        token = sessionStorage.getItem(LEGACY_ONLINE_RECONNECT_STORAGE_KEY)
        if (token) sessionStorage.setItem(ONLINE_RECONNECT_STORAGE_KEY, token)
      }
      sessionStorage.removeItem(LEGACY_ONLINE_RECONNECT_STORAGE_KEY)
    } catch {
      return null
    }
    if (!token) return null
    try {
      throwIfOnlineStartupAborted(signal)
      const client = new Client(runtimeNetworkConfig().colyseusUrl)
      const room = await client.reconnect(token)
      if (signal?.aborted) {
        await closeCancelledRoom(room)
        throw new OnlineLifecycleCancellation('aborted-startup')
      }
      return new OnlineRoomSession(room)
    } catch (caught) {
      if (isOnlineLifecycleCancellation(caught)) throw caught
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      try {
        if (sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY) === token)
          sessionStorage.removeItem(ONLINE_RECONNECT_STORAGE_KEY)
      } catch {
        // Session storage can be unavailable without making online play unusable.
      }
      return null
    }
  }

  get view(): OnlineRoomView | null {
    return this.currentView
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get localSeat(): number | null {
    return (
      this.currentView?.players.find((player) => player.sessionId === this.room.sessionId)?.seat ??
      null
    )
  }

  subscribeView(listener: RoomViewListener): () => void {
    if (this.disposed) return () => undefined
    this.viewListeners.add(listener)
    if (this.currentView) listener(this.currentView)
    return () => this.viewListeners.delete(listener)
  }

  subscribeStatus(listener: StatusListener): () => void {
    if (this.disposed) return () => undefined
    this.statusListeners.add(listener)
    listener(this.currentStatus, this.currentStatusMessage)
    return () => this.statusListeners.delete(listener)
  }

  subscribeQuality(listener: QualityListener): () => void {
    if (this.disposed) return () => undefined
    this.qualityListeners.add(listener)
    listener(this.quality, this.latencyMs)
    return () => this.qualityListeners.delete(listener)
  }

  setReady(ready: boolean): void {
    if (!this.disposed) this.room.send(NETWORK_MESSAGE_TYPE, { type: 'set-ready', ready })
  }

  voteRematch(wantsRematch: boolean): void {
    if (!this.disposed) this.room.send(NETWORK_MESSAGE_TYPE, { type: 'rematch-vote', wantsRematch })
  }

  leave(): Promise<void> {
    if (this.leavePromise) return this.leavePromise
    this.intentionalLeave = true
    this.room.reconnection.enabled = false
    this.room.reconnection.enqueuedMessages.splice(0)
    this.dispose()
    this.leavePromise = this.room.leave(true).then(() => undefined)
    return this.leavePromise
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const dispose of this.roomListenerDisposers.splice(0)) dispose()
    this.viewListeners.clear()
    this.statusListeners.clear()
    this.qualityListeners.clear()
    if (this.latencyInterval) clearInterval(this.latencyInterval)
    this.latencyInterval = null
    this.source.dispose()
    this.clearReconnection()
  }

  private emitStatus(status: ConnectionStatus, message?: string): void {
    if (this.disposed) return
    this.currentStatus = status
    this.currentStatusMessage = message
    for (const listener of this.statusListeners) listener(status, message)
  }

  private measureLatency(): void {
    if (this.disposed || this.currentStatus === 'reconnecting') return
    if (
      this.lastPongAt > 0 &&
      Date.now() - this.lastPongAt > LATENCY_STALE_THRESHOLD_MS &&
      this.quality !== 'poor'
    ) {
      this.quality = 'poor'
      this.latencyMs = null
      for (const listener of this.qualityListeners) listener(this.quality, null)
    }
    this.room.send(NETWORK_MESSAGE_TYPE, { type: 'latency-ping', nonce: Date.now() })
  }

  private setLatency(latencyMs: number): void {
    this.lastPongAt = Date.now()
    this.latencyMs = latencyMs
    this.quality =
      latencyMs < LATENCY_FAIR_THRESHOLD_MS
        ? 'good'
        : latencyMs < LATENCY_POOR_THRESHOLD_MS
          ? 'fair'
          : 'poor'
    for (const listener of this.qualityListeners) listener(this.quality, latencyMs)
  }

  private resetQuality(): void {
    this.quality = 'unknown'
    this.latencyMs = null
    this.lastPongAt = 0
    for (const listener of this.qualityListeners) listener(this.quality, null)
  }

  private persistReconnection(): void {
    if (this.disposed || this.intentionalLeave) return
    try {
      this.persistedToken = this.room.reconnectionToken
      sessionStorage.setItem(ONLINE_RECONNECT_STORAGE_KEY, this.persistedToken)
    } catch {
      // Refresh recovery is best-effort when session storage is blocked.
    }
  }

  private clearReconnection(): void {
    try {
      const stored = sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)
      if (stored === this.persistedToken || stored === this.room.reconnectionToken)
        sessionStorage.removeItem(ONLINE_RECONNECT_STORAGE_KEY)
    } catch {
      // Nothing else needs cleanup when storage is blocked.
    }
  }
}
