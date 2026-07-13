import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Room } from '@colyseus/sdk'
import {
  ONLINE_RECONNECT_STORAGE_KEY,
  OnlineRoomSession,
  playerFacingError,
} from './OnlineRoomSession'

type Listener<Arguments extends unknown[]> = (...arguments_: Arguments) => void
type TestSignal<Arguments extends unknown[]> = {
  (listener: Listener<Arguments>): unknown
  remove: (listener: Listener<Arguments>) => void
  invoke: (...arguments_: Arguments) => void
  removeCount: number
}

function createSignal<Arguments extends unknown[]>(): TestSignal<Arguments> {
  const listeners = new Set<Listener<Arguments>>()
  const signal = ((listener: Listener<Arguments>) => {
    listeners.add(listener)
    return signal
  }) as TestSignal<Arguments>
  signal.removeCount = 0
  signal.remove = (listener) => {
    signal.removeCount += 1
    listeners.delete(listener)
  }
  signal.invoke = (...arguments_) => {
    for (const listener of [...listeners]) listener(...arguments_)
  }
  return signal
}

class FakeSessionRoom {
  sessionId = 'session-1'
  reconnectionToken: string
  state = {}
  reconnection = {
    enabled: true,
    retryCount: 0,
    maxRetries: 15,
    delay: 100,
    minDelay: 100,
    maxDelay: 5000,
    minUptime: 5000,
    backoff: (attempt: number, delay: number) => attempt * delay,
    maxEnqueuedMessages: 10,
    enqueuedMessages: [{ type: 'command' }],
    isReconnecting: false,
  }
  onStateChange = createSignal<[unknown]>()
  onDrop = createSignal<[number?, string?]>()
  onReconnect = createSignal<[]>()
  onLeave = createSignal<[number?, string?]>()
  onError = createSignal<[number?, string?]>()
  leaveCount = 0
  messageDisposeCount = 0
  sent: unknown[] = []
  private staleMessageListener: ((message: unknown) => void) | null = null

  constructor(token: string) {
    this.reconnectionToken = token
  }

  onMessage(_type: string | number, listener: (message: unknown) => void): () => void {
    this.staleMessageListener = listener
    return () => {
      this.messageDisposeCount += 1
    }
  }

  send(_type: string | number, payload: unknown): void {
    this.sent.push(payload)
  }

  async leave(): Promise<number> {
    this.leaveCount += 1
    return 4000
  }

  lateMessage(message: unknown): void {
    this.staleMessageListener?.(message)
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

const SessionConstructor = OnlineRoomSession as unknown as new (room: Room) => OnlineRoomSession

describe('OnlineRoomSession lifecycle', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    })
  })

  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  })

  it('intentionally leaves once, disables reconnect, and clears owned storage', async () => {
    const room = new FakeSessionRoom('token-one')
    const session = new SessionConstructor(room as unknown as Room)
    expect(sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)).toBe('token-one')

    const firstLeave = session.leave()
    const secondLeave = session.leave()
    expect(firstLeave).toBe(secondLeave)
    await firstLeave
    session.dispose()

    expect(room.leaveCount).toBe(1)
    expect(room.reconnection.enabled).toBe(false)
    expect(room.reconnection.enqueuedMessages).toEqual([])
    expect(sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)).toBeNull()
    expect(session.isDisposed).toBe(true)
    expect(room.messageDisposeCount).toBe(2)
    expect(room.onStateChange.removeCount).toBe(2)
    expect(room.onDrop.removeCount).toBe(1)
  })

  it('ignores late state, status, and match messages after disposal', () => {
    const room = new FakeSessionRoom('token-late')
    const session = new SessionConstructor(room as unknown as Room)
    let viewUpdates = 0
    let statusUpdates = 0
    session.subscribeView(() => {
      viewUpdates += 1
    })
    session.subscribeStatus(() => {
      statusUpdates += 1
    })
    session.dispose()

    room.onStateChange.invoke({ phase: 'playing' })
    room.onDrop.invoke(1006, 'late drop')
    room.onReconnect.invoke()
    room.onError.invoke(500, 'late error')
    room.lateMessage({ type: 'full-snapshot' })

    expect(viewUpdates).toBe(0)
    expect(statusUpdates).toBe(1)
    expect(room.sent).toEqual([expect.objectContaining({ type: 'latency-ping' })])
  })

  it('keeps legitimate unexpected-disconnect reconnection active', () => {
    const room = new FakeSessionRoom('token-drop')
    const session = new SessionConstructor(room as unknown as Room)
    const statuses: string[] = []
    session.subscribeStatus((status) => statuses.push(status))

    room.onDrop.invoke(1006, 'network lost')
    expect(statuses).toEqual(['connected', 'reconnecting'])
    expect(room.reconnection.enabled).toBe(true)
    expect(sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)).toBe('token-drop')

    room.onReconnect.invoke()
    expect(statuses).toEqual(['connected', 'reconnecting', 'connected'])
    expect(room.sent).toContainEqual(expect.objectContaining({ type: 'request-snapshot' }))
  })

  it('reports presentation-only latency quality without affecting room state', () => {
    const room = new FakeSessionRoom('token-latency')
    const session = new SessionConstructor(room as unknown as Room)
    const quality: string[] = []
    session.subscribeQuality((value) => quality.push(value))
    room.lateMessage({ type: 'latency-pong', nonce: Date.now() - 100 })
    expect(quality).toEqual(['unknown', 'good'])
    session.dispose()
  })

  it('does not let an old disposed session clear a newer session token', async () => {
    const firstRoom = new FakeSessionRoom('token-old')
    const first = new SessionConstructor(firstRoom as unknown as Room)
    await first.leave()

    const secondRoom = new FakeSessionRoom('token-new')
    const second = new SessionConstructor(secondRoom as unknown as Room)
    firstRoom.onStateChange.invoke({ phase: 'results' })
    firstRoom.onLeave.invoke(4000, 'late leave')

    expect(sessionStorage.getItem(ONLINE_RECONNECT_STORAGE_KEY)).toBe('token-new')
    expect(second.isDisposed).toBe(false)
    second.dispose()
  })
})

describe('online room error mapping', () => {
  it.each([
    ['room-full', 'That private room is already full.'],
    ['match-started', 'That room match has already started.'],
    ['room-not-found', 'That room code is no longer active.'],
    ['incompatible version', 'Your game version is not compatible with this room.'],
  ])('keeps %s distinct', (serverMessage, expected) => {
    expect(playerFacingError(new Error(serverMessage)).message).toBe(expected)
  })

  it('uses realtime guidance only after health has succeeded', () => {
    expect(playerFacingError(new TypeError('socket failed'), 'realtime')).toMatchObject({
      code: 'realtime',
      message: expect.stringMatching(/server is reachable/i),
    })
  })
})
