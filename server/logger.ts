type LogFields = Record<string, string | number | boolean | null | undefined>

const enabled = process.env.DEVELOPMENT_LOGGING !== 'false'

export function roomLog(event: string, fields: LogFields = {}): void {
  if (!enabled) return
  console.info(JSON.stringify({ time: new Date().toISOString(), event, ...fields }))
}
