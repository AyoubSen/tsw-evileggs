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

export type AccountEnvironment = Readonly<{
  enabled: boolean
  clerkSecretKey?: string
  webhookSigningSecret?: string
  databaseUrl?: string
  authorizedParties: string[]
}>

export function accountEnvironment(env: NodeJS.ProcessEnv = process.env): AccountEnvironment {
  if (env.AUTH_ENABLED !== undefined && env.AUTH_ENABLED !== 'true' && env.AUTH_ENABLED !== 'false')
    throw new Error('AUTH_ENABLED must be true or false')
  const requested = env.AUTH_ENABLED === 'true'
  const clerkSecretKey = env.CLERK_SECRET_KEY?.trim() || undefined
  const webhookSigningSecret = env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() || undefined
  const databaseUrl = env.DATABASE_URL?.trim() || undefined
  if (databaseUrl) {
    let parsed: URL
    try { parsed = new URL(databaseUrl) }
    catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL') }
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:')
      throw new Error('DATABASE_URL must be a PostgreSQL URL')
  }
  const authorizedParties = env.CLERK_AUTHORIZED_PARTIES?.split(',').map((value) => value.trim()).filter(Boolean) ?? []
  for (const party of authorizedParties) normalizeWebOrigin(party)
  const missing = [
    !clerkSecretKey && 'CLERK_SECRET_KEY',
    !databaseUrl && 'DATABASE_URL',
    authorizedParties.length === 0 && 'CLERK_AUTHORIZED_PARTIES',
    env.NODE_ENV === 'production' && !webhookSigningSecret && 'CLERK_WEBHOOK_SIGNING_SECRET',
  ].filter((value): value is string => typeof value === 'string')
  if (requested && missing.length)
    throw new Error(`AUTH_ENABLED requires: ${missing.join(', ')}`)
  return {
    enabled: requested && missing.length === 0,
    clerkSecretKey,
    webhookSigningSecret,
    databaseUrl,
    authorizedParties,
  }
}
