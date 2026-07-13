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

export const ONLINE_RECONNECT_STORAGE_KEY = 'toybox-artillery:online-reconnection'

type ConnectionStatus = 'connected' | 'reconnecting' | 'failed' | 'left'
export type ConnectionQuality = 'unknown' | 'good' | 'fair' | 'poor'
export const LATENCY_FAIR_THRESHOLD_MS = 140
export const LATENCY_POOR_THRESHOLD_MS = 280
export const LATENCY_STALE_THRESHOLD_MS = 10_000
type StatusListener = (status: ConnectionStatus, message?: string) => void
type QualityListener = (quality: ConnectionQuality, latencyMs: number | null) => void
type RoomViewListener = (view: OnlineRoomView) => void

let nextSessionGeneration = 0

function endpoint(): string {
  return (
    (import.meta.env.VITE_COLYSEUS_URL as string | undefined)?.trim() || 'http://localhost:2567'
  )
}

function httpEndpoint(): string {
  return endpoint().replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '')
}

function playerFacingError(caught: unknown): Error {
  const message = caught instanceof Error ? caught.message : String(caught)
  if (/longer than expected to wake/i.test(message)) return new Error(message)
  if (/full|locked/i.test(message)) return new Error('That private room is already full.')
  if (/already started|match-started/i.test(message))
    return new Error('That room match has already started.')
  if (/incompatible|version|auth/i.test(message))
    return new Error('Your game version is not compatible with this room.')
  if (/not found|invalid room|room-not-found/i.test(message))
    return new Error('That room code is no longer active.')
  return new Error('The game server could not be reached. Check the connection and try again.')
}

async function closeCancelledRoom(room: Room): Promise<void> {
  room.reconnection.enabled = false
  room.reconnection.enqueuedMessages.splice(0)
  await room.leave(true).catch(() => undefined)
}

const SERVER_WAKE_TIMEOUT_MS = 65_000
const SERVER_WAKE_RETRY_MS = 1_500
const SERVER_HEALTH_ATTEMPT_TIMEOUT_MS = 20_000

const abortableDelay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(new OnlineLifecycleCancellation('aborted-startup'))
      },
      { once: true },
    )
  })

async function waitForServer(signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + SERVER_WAKE_TIMEOUT_MS
  while (Date.now() < deadline) {
    throwIfOnlineStartupAborted(signal)
    const attempt = new AbortController()
    const cancelAttempt = () => attempt.abort()
    signal?.addEventListener('abort', cancelAttempt, { once: true })
    const timeout = setTimeout(() => attempt.abort(), SERVER_HEALTH_ATTEMPT_TIMEOUT_MS)
    try {
      const response = await fetch(`${httpEndpoint()}/health`, {
        signal: attempt.signal,
        cache: 'no-store',
      })
      if (response.ok) return
    } catch (caught) {
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      if (import.meta.env.DEV) console.debug('Game server warm-up retry', caught)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancelAttempt)
    }
    await abortableDelay(SERVER_WAKE_RETRY_MS, signal)
  }
  throw new Error('The game server is taking longer than expected to wake. Please try again.')
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
      this.emitStatus(this.intentionalLeave ? 'left' : 'failed', 'The room connection ended.')
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
  ): Promise<OnlineRoomSession> {
    try {
      throwIfOnlineStartupAborted(signal)
      await waitForServer(signal)
      const client = new Client(endpoint())
      const options: CreateRoomOptions = {
        playerName,
        mapId: config.mapId,
        turnDurationSeconds: config.turnDurationSeconds,
        compatibility: CURRENT_COMPATIBILITY,
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
      if (import.meta.env.DEV) console.error('Online room creation failed', caught)
      throw playerFacingError(caught)
    }
  }

  static async join(
    codeInput: string,
    playerName: string,
    signal?: AbortSignal,
  ): Promise<OnlineRoomSession> {
    try {
      throwIfOnlineStartupAborted(signal)
      await waitForServer(signal)
      const code = normalizeRoomCode(codeInput)
      const response = await fetch(
        `${httpEndpoint()}/api/private-rooms/${encodeURIComponent(code)}`,
        { signal },
      )
      const payload = (await response.json().catch(() => null)) as {
        roomId?: string
        message?: string
      } | null
      if (!response.ok || !payload?.roomId) throw new Error(payload?.message ?? 'Room not found')
      throwIfOnlineStartupAborted(signal)
      const client = new Client(endpoint())
      const options: JoinRoomOptions = { playerName, compatibility: CURRENT_COMPATIBILITY }
      const room = await client.joinById(payload.roomId, options)
      if (signal?.aborted) {
        await closeCancelledRoom(room)
        throw new OnlineLifecycleCancellation('aborted-startup')
      }
      return new OnlineRoomSession(room)
    } catch (caught) {
      if (isOnlineLifecycleCancellation(caught)) throw caught
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      throw playerFacingError(caught)
    }
  }

  static async reconnectStored(signal?: AbortSignal): Promise<OnlineRoomSession | null> {
    let token: string | null
    try {
      token = sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)
    } catch {
      return null
    }
    if (!token) return null
    try {
      throwIfOnlineStartupAborted(signal)
      const client = new Client(endpoint())
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

  get localSeat(): 0 | 1 | null {
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
