import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountRepository } from './repository'
import { installAccountRoutes, isAccountSyncBody } from './routes'
import { sanitizeAccountData } from '../../src/shared/account'

const servers: ReturnType<ReturnType<typeof express>['listen']>[] = []

async function startDisabledAccountApp(): Promise<string> {
  const app = express()
  installAccountRoutes(app, { enabled: false, authorizedParties: [] })
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function startEnabledAccountApp(): Promise<string> {
  const app = express()
  const repository = {} as AccountRepository
  installAccountRoutes(app, {
    enabled: true,
    clerkSecretKey: 'sk_test_example',
    authorizedParties: ['https://evileggs.vercel.app'],
  }, repository)
  const server = app.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('account routes when accounts are disabled', () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })))
  })

  it('publishes disabled capabilities without caching', async () => {
    const baseUrl = await startDisabledAccountApp()
    const response = await fetch(`${baseUrl}/api/account/capabilities`)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ account: { enabled: false } })
  })

  it('publishes enabled capabilities without contacting account providers', async () => {
    const baseUrl = await startEnabledAccountApp()
    const response = await fetch(`${baseUrl}/api/account/capabilities`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ account: { enabled: true } })
  })

  it('does not install private account, ticket, or webhook routes', async () => {
    const baseUrl = await startDisabledAccountApp()

    const responses = await Promise.all([
      fetch(`${baseUrl}/api/me`),
      fetch(`${baseUrl}/api/game-tickets`, { method: 'POST' }),
      fetch(`${baseUrl}/api/clerk/webhooks`, { method: 'POST' }),
    ])

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404])
  })
})

describe('account sync request validation', () => {
  it('requires structured account data instead of silently accepting defaults', () => {
    expect(isAccountSyncBody({ baseRevision: 0 })).toBe(false)
    expect(isAccountSyncBody({ baseRevision: 0, data: null })).toBe(false)
    expect(isAccountSyncBody({ baseRevision: 0, data: { preferences: {}, outfitPresets: [] } })).toBe(false)
    expect(isAccountSyncBody({ baseRevision: 0, data: sanitizeAccountData(undefined) })).toBe(true)
    expect(isAccountSyncBody({ baseRevision: -1, data: { preferences: {}, outfitPresets: [] } })).toBe(false)
  })
})
