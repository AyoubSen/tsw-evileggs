import { describe, expect, it } from 'vitest'
import { parseAllowedWebOrigins } from './environment'

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
