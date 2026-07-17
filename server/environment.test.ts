import { describe, expect, it } from 'vitest'
import { accountEnvironment, parseAllowedWebOrigins } from './environment'

describe('allowed web origins', () => {
  it('accepts the production frontend origin', () => {
    expect(parseAllowedWebOrigins('https://evileggs.vercel.app', 'production')).toEqual([
      'https://evileggs.vercel.app',
    ])
  })

  it('parses comma-separated origins and normalizes a trailing slash', () => {
    expect(
      parseAllowedWebOrigins(
        'https://evileggs.vercel.app/, https://preview.evileggs.vercel.app',
        'production',
      ),
    ).toEqual(['https://evileggs.vercel.app', 'https://preview.evileggs.vercel.app'])
  })

  it('rejects values that are URLs rather than exact web origins', () => {
    expect(() => parseAllowedWebOrigins('https://evileggs.vercel.app/game', 'production')).toThrow(
      /invalid web origin/i,
    )
  })
})

const coreAccountEnvironment = {
  AUTH_ENABLED: 'true',
  CLERK_SECRET_KEY: 'sk_test_example',
  DATABASE_URL: 'postgresql://user:password@example.test/database',
  CLERK_AUTHORIZED_PARTIES: 'https://evileggs.vercel.app',
}

describe('account environment', () => {
  it('enables accounts when the requested core configuration is present', () => {
    expect(accountEnvironment(coreAccountEnvironment)).toEqual({
      enabled: true,
      clerkSecretKey: 'sk_test_example',
      webhookSigningSecret: undefined,
      databaseUrl: 'postgresql://user:password@example.test/database',
      authorizedParties: ['https://evileggs.vercel.app'],
    })
  })

  it('stays disabled without requiring account configuration', () => {
    expect(accountEnvironment({ AUTH_ENABLED: 'false' })).toEqual({
      enabled: false,
      clerkSecretKey: undefined,
      webhookSigningSecret: undefined,
      databaseUrl: undefined,
      authorizedParties: [],
    })
  })

  it.each(['CLERK_SECRET_KEY', 'DATABASE_URL', 'CLERK_AUTHORIZED_PARTIES'] as const)(
    'rejects enabled accounts when %s is missing',
    (name) => {
      const environment: NodeJS.ProcessEnv = { ...coreAccountEnvironment }
      delete environment[name]

      expect(() => accountEnvironment(environment)).toThrow(name)
    },
  )

  it('requires webhook signing in production when accounts are enabled', () => {
    expect(() => accountEnvironment({ ...coreAccountEnvironment, NODE_ENV: 'production' })).toThrow(
      'CLERK_WEBHOOK_SIGNING_SECRET',
    )
    expect(
      accountEnvironment({
        ...coreAccountEnvironment,
        NODE_ENV: 'production',
        CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_example',
      }).enabled,
    ).toBe(true)
  })
})
