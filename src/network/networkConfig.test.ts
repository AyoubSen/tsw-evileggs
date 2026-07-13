import { describe, expect, it } from 'vitest'
import { joinHttpUrl, resolveNetworkConfig } from './networkConfig'

describe('network endpoint configuration', () => {
  it('keeps production custom HTTP relative and realtime direct', () => {
    expect(
      resolveNetworkConfig({
        DEV: false,
        VITE_GAME_HTTP_BASE_URL: '/game-server/',
        VITE_COLYSEUS_URL: 'https://tsw-evileggs.onrender.com/',
      }),
    ).toEqual({
      gameHttpBaseUrl: '/game-server',
      colyseusUrl: 'https://tsw-evileggs.onrender.com',
    })
  })

  it('supports explicit local development endpoints', () => {
    expect(
      resolveNetworkConfig({
        DEV: true,
        VITE_GAME_HTTP_BASE_URL: 'http://localhost:2567/',
        VITE_COLYSEUS_URL: 'ws://localhost:2567/',
      }),
    ).toEqual({
      gameHttpBaseUrl: 'http://localhost:2567',
      colyseusUrl: 'ws://localhost:2567',
    })
  })

  it('uses localhost defaults only in development', () => {
    expect(resolveNetworkConfig({ DEV: true })).toEqual({
      gameHttpBaseUrl: 'http://localhost:2567',
      colyseusUrl: 'http://localhost:2567',
    })
    expect(() =>
      resolveNetworkConfig({
        DEV: false,
        VITE_COLYSEUS_URL: 'https://tsw-evileggs.onrender.com',
      }),
    ).toThrow(/VITE_GAME_HTTP_BASE_URL is required/)
    expect(() =>
      resolveNetworkConfig({ DEV: false, VITE_GAME_HTTP_BASE_URL: '/game-server' }),
    ).toThrow(/VITE_COLYSEUS_URL is required/)
  })

  it('joins relative and absolute bases without duplicate slashes', () => {
    expect(joinHttpUrl('/game-server/', '/health')).toBe('/game-server/health')
    expect(joinHttpUrl('/', '/health')).toBe('/health')
    expect(joinHttpUrl('http://localhost:2567/', '/api/private-rooms/ABC234')).toBe(
      'http://localhost:2567/api/private-rooms/ABC234',
    )
  })
})
