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
type StatusListener = (status: ConnectionStatus, message?: string) => void
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

export class OnlineRoomSession {
  readonly source: OnlineMatchSource
  readonly generation = ++nextSessionGeneration
  private readonly viewListeners = new Set<RoomViewListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly roomListenerDisposers: Array<() => void> = []
  private currentView: OnlineRoomView | null = null
  private intentionalLeave = false
  private leavePromise: Promise<void> | null = null
  private disposed = false
  private persistedToken = ''

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
      if (!this.disposed) this.emitStatus('reconnecting', 'Reconnecting to the room...')
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
      if (!this.disposed) this.emitStatus('failed', 'The room connection encountered an error.')
    }

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
    )

    const initialState = room.state as unknown as { players?: unknown; result?: unknown }
    if (initialState?.players && initialState.result)
      this.currentView = roomViewFromSchema(room.state as never)
    this.persistReconnection()
  }

  static async create(
    playerName: string,
    config: LocalMatchConfig,
    signal?: AbortSignal,
  ): Promise<OnlineRoomSession> {
    try {
      throwIfOnlineStartupAborted(signal)
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
    return () => this.statusListeners.delete(listener)
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
    this.source.dispose()
    this.clearReconnection()
  }

  private emitStatus(status: ConnectionStatus, message?: string): void {
    if (this.disposed) return
    for (const listener of this.statusListeners) listener(status, message)
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
