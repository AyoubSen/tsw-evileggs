export type NetworkEnvironment = {
  DEV?: boolean
  VITE_GAME_HTTP_BASE_URL?: string
  VITE_COLYSEUS_URL?: string
}

export type NetworkConfig = {
  gameHttpBaseUrl: string
  colyseusUrl: string
}

export class NetworkConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkConfigurationError'
  }
}

const LOCAL_SERVER_URL = 'http://localhost:2567'

function requiredValue(
  value: string | undefined,
  name: 'VITE_GAME_HTTP_BASE_URL' | 'VITE_COLYSEUS_URL',
  development: boolean,
): string {
  const normalized = value?.trim()
  if (normalized) return normalized
  if (development) return LOCAL_SERVER_URL
  throw new NetworkConfigurationError(`${name} is required for production online play.`)
}

function withoutTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value
}

function normalizeHttpBase(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) {
    const parsed = new URL(value, 'https://frontend.invalid')
    if (parsed.search || parsed.hash)
      throw new NetworkConfigurationError(
        'VITE_GAME_HTTP_BASE_URL must not include a query or fragment.',
      )
    return withoutTrailingSlash(parsed.pathname)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new NetworkConfigurationError(
      'VITE_GAME_HTTP_BASE_URL must be an absolute HTTP URL or root-relative path.',
    )
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new NetworkConfigurationError(
      'VITE_GAME_HTTP_BASE_URL must use HTTP or HTTPS without credentials.',
    )
  if (parsed.search || parsed.hash)
    throw new NetworkConfigurationError(
      'VITE_GAME_HTTP_BASE_URL must not include a query or fragment.',
    )
  return withoutTrailingSlash(parsed.toString())
}

function normalizeColyseusUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new NetworkConfigurationError(
      'VITE_COLYSEUS_URL must be an absolute HTTP(S) or WebSocket URL.',
    )
  }
  if (
    !['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new NetworkConfigurationError(
      'VITE_COLYSEUS_URL must use HTTP(S) or WebSocket without credentials.',
    )
  if (parsed.search || parsed.hash)
    throw new NetworkConfigurationError('VITE_COLYSEUS_URL must not include a query or fragment.')
  return withoutTrailingSlash(parsed.toString())
}

export function resolveNetworkConfig(environment: NetworkEnvironment): NetworkConfig {
  const development = environment.DEV === true
  return {
    gameHttpBaseUrl: normalizeHttpBase(
      requiredValue(environment.VITE_GAME_HTTP_BASE_URL, 'VITE_GAME_HTTP_BASE_URL', development),
    ),
    colyseusUrl: normalizeColyseusUrl(
      requiredValue(environment.VITE_COLYSEUS_URL, 'VITE_COLYSEUS_URL', development),
    ),
  }
}

export function joinHttpUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.replace(/^\/+/, '')
  const normalizedBase = withoutTrailingSlash(baseUrl)
  return normalizedBase === '/' ? `/${normalizedPath}` : `${normalizedBase}/${normalizedPath}`
}

export function runtimeNetworkConfig(): NetworkConfig {
  return resolveNetworkConfig(import.meta.env)
}
