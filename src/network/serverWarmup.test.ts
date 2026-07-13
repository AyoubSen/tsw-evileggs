import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OnlineConnectionError,
  healthNetworkError,
  realtimeConnectionError,
  reconnectConnectionError,
} from './connectionErrors'
import { HEALTH_RESPONSE } from './healthProtocol'
import { waitForGameServer, type WarmupOptions } from './serverWarmup'
import { isOnlineLifecycleCancellation } from './onlineLifecycle'

const quickWarmup: WarmupOptions = {
  maxAttempts: 2,
  attemptTimeoutMs: 10,
  retryDelayMs: 1,
}

const healthResponse = () =>
  new Response(JSON.stringify(HEALTH_RESPONSE), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('server health warm-up', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GAME_HTTP_BASE_URL', '/game-server')
    vi.stubEnv('VITE_COLYSEUS_URL', 'https://tsw-evileggs.onrender.com')
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the same-origin HTTP base and stops after a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(healthResponse())
    vi.stubGlobal('fetch', fetchMock)

    await waitForGameServer(undefined, quickWarmup)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/game-server/health', {
      signal: expect.any(AbortSignal),
      cache: 'no-store',
    })
  })

  it('retries timed-out attempts only within the configured bound', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(waitForGameServer(undefined, quickWarmup)).rejects.toMatchObject({
      code: 'wake-timeout',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cancels an active fetch without another retry', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const warmup = waitForGameServer(controller.signal, quickWarmup)
    controller.abort()

    await expect(warmup).rejects.toSatisfy(isOnlineLifecycleCancellation)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects malformed health JSON with a useful response error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{broken', { status: 200 })))

    await expect(waitForGameServer(undefined, quickWarmup)).rejects.toMatchObject({
      code: 'invalid-response',
      message: expect.stringMatching(/invalid health response/i),
    })
  })

  it('keeps HTTP failures distinct from blocker guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })))

    await expect(waitForGameServer(undefined, quickWarmup)).rejects.toMatchObject({
      code: 'server-http',
      status: 503,
      message: expect.not.stringMatching(/privacy extension/i),
    })
  })

  it('uses cautious filter language only when no HTTP response exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(waitForGameServer(undefined, quickWarmup)).rejects.toMatchObject({
      code: 'health-network',
      message: expect.stringMatching(/privacy extension or network filter may/i),
    })
  })
})

describe('connection error classification', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports an offline browser without blaming a blocker', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(healthNetworkError()).toMatchObject({
      code: 'offline',
      message: expect.stringMatching(/offline/i),
    })
  })

  it('distinguishes realtime opening and reconnect failures after health succeeds', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(realtimeConnectionError()).toMatchObject({
      code: 'realtime',
      message: expect.stringMatching(/server is reachable.*realtime connection/i),
    })
    expect(reconnectConnectionError()).toMatchObject({
      code: 'reconnect',
      message: expect.stringMatching(/could not be restored/i),
    })
  })

  it('retains status metadata for explicit server errors', () => {
    expect(new OnlineConnectionError('server-http', 'HTTP failure', 500)).toMatchObject({
      code: 'server-http',
      status: 500,
    })
  })
})
