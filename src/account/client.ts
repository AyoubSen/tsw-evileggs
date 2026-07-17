import { sanitizeAccountData, type AccountData, type AccountEnvelope } from '../shared/account'
import type { ProgressionOverview } from '../shared/progression'

export class AccountConflictError extends Error {
  constructor(readonly envelope: AccountEnvelope) { super('Account data changed on another device.') }
}

const baseUrl = (): string => {
  const configured = import.meta.env.VITE_GAME_HTTP_BASE_URL?.trim() || '/game-server'
  return new URL(configured.replace(/\/$/, '') + '/', window.location.origin).toString()
}

export async function getAccountCapabilities(): Promise<{ enabled: boolean }> {
  const response = await fetch(new URL('api/account/capabilities', baseUrl()))
  if (!response.ok) throw new Error('Cloud account service is unavailable.')
  const value = await response.json() as { account?: { enabled?: unknown } }
  if (typeof value.account?.enabled !== 'boolean')
    throw new Error('Cloud account service returned invalid capabilities.')
  return { enabled: value.account.enabled }
}

async function request(getToken: () => Promise<string | null>, path: string, init?: RequestInit) {
  const token = await getToken()
  if (!token) throw new Error('Sign in is required.')
  const response = await fetch(new URL(path.replace(/^\//, ''), baseUrl()), {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  return response
}

const envelope = async (response: Response): Promise<AccountEnvelope> => {
  const value = await response.json() as Partial<AccountEnvelope>
  if (!Number.isSafeInteger(value.revision) || (value.revision ?? -1) < 0) throw new Error('The account service returned invalid data.')
  return { revision: value.revision!, data: sanitizeAccountData(value.data) }
}

export async function getAccount(getToken: () => Promise<string | null>) {
  const response = await request(getToken, '/api/me')
  if (!response.ok) throw new Error('Account data is temporarily unavailable.')
  return envelope(response)
}

export async function syncAccount(getToken: () => Promise<string | null>, baseRevision: number, data: AccountData) {
  const response = await request(getToken, '/api/me/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision, data }),
  })
  if (response.status === 409) throw new AccountConflictError(await envelope(response))
  if (!response.ok) throw new Error('Account sync is temporarily unavailable.')
  return envelope(response)
}

export async function deleteAccountData(getToken: () => Promise<string | null>) {
  const response = await request(getToken, '/api/me/delete', { method: 'POST' })
  if (!response.ok) throw new Error('Account data could not be deleted.')
}

export async function createGameTicket(getToken: () => Promise<string | null>): Promise<string> {
  const response = await request(getToken, '/api/game-tickets', { method: 'POST' })
  if (!response.ok) throw new Error('Your signed-in game identity could not be verified.')
  const value = await response.json() as { ticket?: unknown }
  if (typeof value.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.ticket))
    throw new Error('The game identity service returned invalid data.')
  return value.ticket
}

export async function getProgression(getToken: () => Promise<string | null>): Promise<ProgressionOverview> {
  const response = await request(getToken, '/api/me/progression')
  if (!response.ok) throw new Error('Progression is temporarily unavailable.')
  const value = await response.json() as ProgressionOverview
  if (!value?.summary || !Array.isArray(value.recentMatches) || !Array.isArray(value.entitlements))
    throw new Error('The progression service returned invalid data.')
  return value
}
