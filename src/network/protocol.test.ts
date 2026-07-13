import { describe, expect, it } from 'vitest'
import {
  CURRENT_COMPATIBILITY,
  clientRoomMessageSchema,
  compatibilityError,
  isRoomCode,
  normalizeRoomCode,
} from './protocol'

describe('online protocol validation', () => {
  it('normalizes human-entered room codes', () => {
    expect(normalizeRoomCode(' ab c2 34 ')).toBe('ABC234')
    expect(isRoomCode('abc234')).toBe(true)
    expect(isRoomCode('O0I1AA')).toBe(false)
  })

  it('accepts intention-only fire commands', () => {
    const result = clientRoomMessageSchema.safeParse({
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'fire', aimDirection: { x: 1, y: 0 }, power: 50 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects claimed outcomes and unknown object keys', () => {
    const result = clientRoomMessageSchema.safeParse({
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: {
        type: 'fire',
        aimDirection: { x: 1, y: 0 },
        power: 50,
        damage: 100,
        explosionPosition: { x: 10, y: 20 },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-normalized aim and non-finite coordinates', () => {
    expect(
      clientRoomMessageSchema.safeParse({
        type: 'command',
        commandId: 1,
        expectedTurn: 1,
        matchGeneration: 1,
        command: { type: 'fire', aimDirection: { x: 5, y: 0 }, power: 50 },
      }).success,
    ).toBe(false)
    expect(
      clientRoomMessageSchema.safeParse({
        type: 'command',
        commandId: 1,
        expectedTurn: 1,
        matchGeneration: 1,
        command: { type: 'teleport', destination: { x: Number.NaN, y: 20 } },
      }).success,
    ).toBe(false)
  })

  it('reports explicit compatibility failures', () => {
    expect(compatibilityError(CURRENT_COMPATIBILITY)).toBeNull()
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, maps: 'maps-old' })).toMatch(
      /Map registry/,
    )
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, build: 'old-client' })).toMatch(
      /Client build/,
    )
  })
})
