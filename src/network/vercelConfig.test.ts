import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Vercel game-server proxy', () => {
  it('routes the stable HTTP prefix to Render before the SPA fallback', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
    ) as {
      rewrites?: Array<{ source?: string; destination?: string }>
    }

    expect(config.rewrites?.[0]).toEqual({
      source: '/game-server/:path*',
      destination: 'https://tsw-evileggs.onrender.com/:path*',
    })
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })
})
