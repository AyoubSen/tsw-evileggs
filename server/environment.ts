export function allowedWebOrigins(): string[] {
  const configured = process.env.ALLOWED_WEB_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (configured?.length) return configured
  if (process.env.NODE_ENV === 'production')
    throw new Error('ALLOWED_WEB_ORIGINS is required in production')
  return ['http://localhost:5173', 'http://127.0.0.1:5173']
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin === undefined || allowed.includes(origin)
}
