import { OnlineConnectionError, healthNetworkError } from './connectionErrors'
import { HEALTH_RESPONSE } from './healthProtocol'
import { joinHttpUrl, runtimeNetworkConfig } from './networkConfig'
import { OnlineLifecycleCancellation, throwIfOnlineStartupAborted } from './onlineLifecycle'

export type WarmupOptions = {
  maxAttempts: number
  attemptTimeoutMs: number
  retryDelayMs: number
}

export const DEFAULT_WARMUP_OPTIONS: WarmupOptions = {
  maxAttempts: 4,
  attemptTimeoutMs: 15_000,
  retryDelayMs: 1_500,
}

const abortableDelay = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OnlineLifecycleCancellation('aborted-startup'))
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new OnlineLifecycleCancellation('aborted-startup'))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

type HealthPayload = {
  status: string
  service: string
  protocolVersion: unknown
}

function validHealthResponse(value: unknown): value is HealthPayload {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return (
    response.status === HEALTH_RESPONSE.status &&
    response.service === HEALTH_RESPONSE.service &&
    'protocolVersion' in response
  )
}

export async function waitForGameServer(
  signal?: AbortSignal,
  options: WarmupOptions = DEFAULT_WARMUP_OPTIONS,
): Promise<void> {
  const healthUrl = joinHttpUrl(runtimeNetworkConfig().gameHttpBaseUrl, 'health')
  let lastFailure: OnlineConnectionError = healthNetworkError()

  for (let attemptNumber = 0; attemptNumber < options.maxAttempts; attemptNumber += 1) {
    throwIfOnlineStartupAborted(signal)
    const attempt = new AbortController()
    let attemptTimedOut = false
    const cancelAttempt = () => attempt.abort()
    signal?.addEventListener('abort', cancelAttempt, { once: true })
    const timeout = setTimeout(() => {
      attemptTimedOut = true
      attempt.abort()
    }, options.attemptTimeoutMs)

    try {
      const response = await fetch(healthUrl, { signal: attempt.signal, cache: 'no-store' })
      if (!response.ok) {
        lastFailure = new OnlineConnectionError(
          'server-http',
          `The game server returned HTTP ${response.status}. Please try again.`,
          response.status,
        )
      } else {
        const payload = await response.json().catch(() => null)
        if (!validHealthResponse(payload))
          throw new OnlineConnectionError(
            'invalid-response',
            'The game server returned an invalid health response. Please try again later.',
          )
        if (payload.protocolVersion !== HEALTH_RESPONSE.protocolVersion)
          throw new OnlineConnectionError(
            'protocol-incompatible',
            'Your game version is not compatible with the server.',
          )
        return
      }
    } catch (caught) {
      if (signal?.aborted) throw new OnlineLifecycleCancellation('aborted-startup')
      if (
        caught instanceof OnlineConnectionError &&
        ['invalid-response', 'protocol-incompatible'].includes(caught.code)
      )
        throw caught
      lastFailure = attemptTimedOut
        ? new OnlineConnectionError(
            'wake-timeout',
            'The game server is taking longer than expected to wake. Please try again.',
          )
        : caught instanceof OnlineConnectionError
          ? caught
          : healthNetworkError()
      if (import.meta.env.DEV) console.debug('Game server warm-up retry', caught)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancelAttempt)
    }

    if (attemptNumber + 1 < options.maxAttempts) await abortableDelay(options.retryDelayMs, signal)
  }

  throw lastFailure
}
