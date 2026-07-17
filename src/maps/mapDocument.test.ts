import { describe, expect, it } from 'vitest'
import {
  MAX_MAP_OBJECTS,
  createHeightFieldDocument,
  migrateMapDocument,
  resolveMapDocument,
  type MapDocument,
  type MapTheme,
} from './mapDocument'

const theme: MapTheme = {
  sky: 0x9edce5,
  sun: 0xffedb1,
  backHill: 0x78b996,
  terrain: 0x9a673e,
  surface: 0x437c53,
  dust: 0xa88d69,
  brick: 0xa8543d,
  stone: 0x77736c,
  steel: 0x394c55,
}

function document(): MapDocument {
  return createHeightFieldDocument({
    id: 'test-map',
    revision: 1,
    mode: '1v1',
    displayName: 'Test Map',
    description: 'A deterministic map document fixture.',
    label: 'Test',
    width: 960,
    height: 540,
    terrainScale: 2,
    spawnXs: [180, 780],
    surfaceAt: () => 380,
    theme,
  })
}

const reflector = (id: string) => ({
  id,
  type: 'reflector-wall' as const,
  start: { x: 400, y: 100 },
  end: { x: 480, y: 100 },
  thickness: 12,
  velocityRetention: 0.8,
})

const portal = (id: string) => ({
  id,
  type: 'projectile-portal' as const,
  entrance: { start: { x: 300, y: 100 }, end: { x: 300, y: 180 }, thickness: 12 },
  exit: { start: { x: 600, y: 100 }, end: { x: 600, y: 180 }, thickness: 12 },
  velocityRetention: 0.8,
})

describe('map document v3', () => {
  it('migrates strict v1 documents with an empty object list', () => {
    const current = document()
    const { objects: _objects, ...v1 } = current
    const migrated = migrateMapDocument({ ...v1, formatVersion: 1 })
    expect(migrated.formatVersion).toBe(3)
    expect(migrated.objects).toEqual([])
  })

  it('migrates v2 documents without changing reflector objects', () => {
    const current = document()
    const wall = reflector('wall')
    const migrated = migrateMapDocument({ ...current, formatVersion: 2, objects: [wall] })
    expect(migrated.formatVersion).toBe(3)
    expect(migrated.objects).toEqual([wall])
  })

  it('sorts objects canonically and hashes equivalent content identically', () => {
    const left = resolveMapDocument({ ...document(), objects: [reflector('z-wall'), portal('a-portal')] })
    const right = resolveMapDocument({ ...document(), objects: [portal('a-portal'), reflector('z-wall')] })
    expect(left.objects.map((object) => object.id)).toEqual(['a-portal', 'z-wall'])
    expect(left.contentHash).toBe(right.contentHash)
    expect(left.contentHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('strictly validates both portal apertures and rejects pair overlap', () => {
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...portal('pair'), entrance: { ...portal('pair').entrance, extra: true } }],
      }),
    ).toThrow(/unsupported/i)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...portal('pair'), exit: { ...portal('pair').entrance } }],
      }),
    ).toThrow(/apertures overlap/)
  })

  it('rejects unsupported fields, unknown kinds, and duplicate IDs', () => {
    expect(() => resolveMapDocument({ ...document(), surprise: true })).toThrow(/unsupported/i)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...reflector('wall'), script: 'run()' }],
      }),
    ).toThrow(/unsupported/i)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...reflector('wall'), type: 'portal' }],
      }),
    ).toThrow(/Unsupported map object type/)
    expect(() =>
      resolveMapDocument({ ...document(), objects: [reflector('wall'), reflector('wall')] }),
    ).toThrow(/Duplicate map object ID/)
  })

  it('rejects malformed geometry, bounds, spawn overlap, and count overflow', () => {
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...reflector('wall'), end: { x: 400, y: 100 } }],
      }),
    ).toThrow(/invalid length/)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [{ ...reflector('wall'), start: { x: 2, y: 100 } }],
      }),
    ).toThrow(/outside the map bounds/)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: [
          {
            ...reflector('wall'),
            start: { x: 150, y: 365 },
            end: { x: 210, y: 365 },
          },
        ],
      }),
    ).toThrow(/spawn safety volume/)
    expect(() =>
      resolveMapDocument({
        ...document(),
        objects: Array.from({ length: MAX_MAP_OBJECTS + 1 }, (_, index) =>
          reflector(`wall-${index + 1}`),
        ),
      }),
    ).toThrow(/at most 32 objects/)
  })
})
