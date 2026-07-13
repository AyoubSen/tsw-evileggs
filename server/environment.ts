function normalizeWebOrigin(value: string): string {
  const origin = value.trim()
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error(`ALLOWED_WEB_ORIGINS contains an invalid origin: ${origin}`)
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(`ALLOWED_WEB_ORIGINS contains an invalid web origin: ${origin}`)
  return parsed.origin
}

export function parseAllowedWebOrigins(
  value: string | undefined,
  nodeEnvironment = process.env.NODE_ENV,
): string[] {
  const configured = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeWebOrigin)
  if (configured?.length) return [...new Set(configured)]
  if (nodeEnvironment === 'production')
    throw new Error('ALLOWED_WEB_ORIGINS is required in production')
  return ['http://localhost:5173', 'http://127.0.0.1:5173']
}

export function allowedWebOrigins(): string[] {
  return parseAllowedWebOrigins(process.env.ALLOWED_WEB_ORIGINS)
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin === undefined || allowed.includes(origin)
}
