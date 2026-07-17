import { describe, expect, it } from 'vitest'
import type { ReflectorWallDefinition } from '../../maps/mapDocument'
import {
  compareProjectileContacts,
  firstProjectileContact,
  sweepCircleAgainstBounds,
  sweepCircleAgainstReflector,
  type ProjectileContact,
} from './contact'

const wall = (overrides: Partial<ReflectorWallDefinition> = {}): ReflectorWallDefinition => ({
  id: 'wall',
  type: 'reflector-wall',
  start: { x: 100, y: 100 },
  end: { x: 300, y: 100 },
  thickness: 10,
  velocityRetention: 0.8,
  ...overrides,
})

describe('reflector projectile contacts', () => {
  it('sweeps high-speed circles against horizontal and vertical capsules', () => {
    const horizontal = sweepCircleAgainstReflector(
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      5,
      wall(),
    )
    expect(horizontal).toMatchObject({ kind: 'reflector', normal: { x: 0, y: -1 } })
    expect(horizontal?.position.y).toBeCloseTo(90)

    const vertical = sweepCircleAgainstReflector(
      { x: 0, y: 200 },
      { x: 200, y: 200 },
      5,
      wall({ start: { x: 100, y: 100 }, end: { x: 100, y: 300 } }),
    )
    expect(vertical).toMatchObject({ kind: 'reflector', normal: { x: -1, y: 0 } })
    expect(vertical?.position.x).toBeCloseTo(90)
  })

  it('returns a normalized angled surface normal and retained reflected speed', () => {
    const contact = sweepCircleAgainstReflector(
      { x: 50, y: 150 },
      { x: 250, y: -50 },
      5,
      wall({ end: { x: 300, y: 300 } }),
    )!
    if (contact.kind !== 'reflector') throw new Error('Expected a reflector contact.')
    expect(Math.hypot(contact.normal.x, contact.normal.y)).toBeCloseTo(1)
    const incoming = { x: 200, y: -200 }
    const dot = incoming.x * contact.normal.x + incoming.y * contact.normal.y
    const outgoing = {
      x: (incoming.x - 2 * dot * contact.normal.x) * contact.object.velocityRetention,
      y: (incoming.y - 2 * dot * contact.normal.y) * contact.object.velocityRetention,
    }
    expect(Math.hypot(outgoing.x, outgoing.y)).toBeCloseTo(Math.hypot(200, 200) * 0.8)
  })

  it('uses stable object IDs to resolve equal-time overlapping contacts', () => {
    const laterId = sweepCircleAgainstReflector(
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      5,
      wall({ id: 'z-wall' }),
    )
    const earlierId = sweepCircleAgainstReflector(
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      5,
      wall({ id: 'a-wall' }),
    )
    expect(firstProjectileContact([laterId, earlierId])).toMatchObject({ stableId: 'a-wall' })
  })
})

describe('projectile contact ordering and boundaries', () => {
  const contact = (kind: ProjectileContact['kind'], stableId: string): ProjectileContact => {
    const base = { toi: 0.5, position: { x: 10, y: 10 }, normal: { x: 1, y: 0 }, stableId }
    if (kind === 'boundary') return { ...base, kind, edge: 'left' }
    if (kind === 'player') return { ...base, kind, playerId: stableId }
    if (kind === 'reflector') return { ...base, kind, object: wall({ id: stableId }) }
    if (kind === 'portal')
      return {
        ...base,
        kind,
        aperture: 'entrance',
        object: {
          id: stableId,
          type: 'projectile-portal',
          entrance: { start: { x: 0, y: 0 }, end: { x: 0, y: 20 }, thickness: 4 },
          exit: { start: { x: 50, y: 0 }, end: { x: 50, y: 20 }, thickness: 4 },
          velocityRetention: 1,
        },
      }
    return { ...base, kind }
  }

  it('keeps equal-time gameplay priority stable', () => {
    const orderedKinds: ProjectileContact['kind'][] = [
      'boundary',
      'player',
      'reflector',
      'portal',
      'terrain',
    ]
    const contacts = orderedKinds.map((kind) => contact(kind, kind))
    expect([...contacts].reverse().sort(compareProjectileContacts).map(({ kind }) => kind)).toEqual(
      orderedKinds,
    )
  })

  it.each([
    [{ x: 20, y: 50 }, { x: -20, y: 50 }, 'left'],
    [{ x: 80, y: 50 }, { x: 120, y: 50 }, 'right'],
    [{ x: 50, y: 20 }, { x: 50, y: -20 }, 'top'],
    [{ x: 50, y: 80 }, { x: 50, y: 120 }, 'bottom'],
  ] as const)('sweeps a projectile against the %s boundary', (start, end, edge) => {
    expect(sweepCircleAgainstBounds(start, end, 5, 100, 100)).toMatchObject({
      kind: 'boundary',
      edge,
    })
  })

  it('does not invent a contact for stationary projectiles', () => {
    expect(sweepCircleAgainstBounds({ x: 5, y: 5 }, { x: 5, y: 5 }, 5, 100, 100)).toBeNull()
  })
})
