import { describe, expect, it } from 'vitest'
import type { ReflectorWallDefinition } from '../../maps/mapDocument'
import {
  firstProjectileContact,
  sweepCircleAgainstReflector,
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
