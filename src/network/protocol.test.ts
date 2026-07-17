import { describe, expect, it } from 'vitest'
import {
  CURRENT_COMPATIBILITY,
  clientRoomMessageSchema,
  compatibilityError,
  createRoomOptionsSchema,
  isRoomCode,
  normalizeRoomCode,
} from './protocol'

describe('online protocol validation', () => {
  it('normalizes human-entered room codes', () => {
    expect(normalizeRoomCode(' ab c2 34 ')).toBe('ABC234')
    expect(isRoomCode('abc234')).toBe(true)
    expect(isRoomCode('O0I1AA')).toBe(false)
  })

  it('accepts intention-only weapon activation commands', () => {
    const result = clientRoomMessageSchema.safeParse({
      type: 'command',
      commandId: 1,
      expectedTurn: 1,
      matchGeneration: 1,
      command: {
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: { x: 1, y: 0 }, power: 50 },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an intention-only in-flight weapon trigger', () => {
    const result = clientRoomMessageSchema.safeParse({
      type: 'command',
      commandId: 2,
      expectedTurn: 1,
      matchGeneration: 1,
      command: { type: 'trigger-weapon' },
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
        type: 'activate-weapon',
        activation: {
          kind: 'directional',
          aimDirection: { x: 1, y: 0 },
          power: 50,
          damage: 100,
          explosionPosition: { x: 10, y: 20 },
        },
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
        command: {
          type: 'activate-weapon',
          activation: { kind: 'directional', aimDirection: { x: 5, y: 0 }, power: 50 },
        },
      }).success,
    ).toBe(false)
    expect(
      clientRoomMessageSchema.safeParse({
        type: 'command',
        commandId: 1,
        expectedTurn: 1,
        matchGeneration: 1,
        command: {
          type: 'activate-weapon',
          activation: { kind: 'target-position', target: { x: Number.NaN, y: 20 } },
        },
      }).success,
    ).toBe(false)
  })

  it('reports explicit compatibility failures', () => {
    expect(CURRENT_COMPATIBILITY).toMatchObject({
      protocol: 'private-room-6',
      snapshot: 6,
      weapons: 'weapons-4',
      build: '1.4.1',
    })
    expect(compatibilityError(CURRENT_COMPATIBILITY)).toBeNull()
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, maps: 'maps-old' })).toMatch(
      /Map registry/,
    )
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, build: 'old-client' })).toMatch(
      /Client build/,
    )
  })

  it('admits the new official maps only for their supported team modes', () => {
    const teamMaps = [
      ['2v2', 'switchback-quarry'],
      ['2v2', 'dry-aqueduct'],
      ['3v3', 'sundered-crown'],
      ['3v3', 'lantern-vault'],
      ['3v3', 'fossil-wake'],
    ] as const

    for (const [mode, mapId] of teamMaps) {
      expect(
        createRoomOptionsSchema.safeParse({
          playerName: 'Nova',
          mode,
          mapId,
          turnDurationSeconds: 30,
          compatibility: CURRENT_COMPATIBILITY,
        }).success,
      ).toBe(true)
    }

    expect(
      createRoomOptionsSchema.safeParse({
        playerName: 'Nova',
        mode: '3v3',
        mapId: 'switchback-quarry',
        turnDurationSeconds: 30,
        compatibility: CURRENT_COMPATIBILITY,
      }).success,
    ).toBe(false)
  })

  it('rejects the removed crater-basin map', () => {
    expect(
      createRoomOptionsSchema.safeParse({
        playerName: 'Nova',
        mode: '1v1',
        mapId: 'crater-basin',
        turnDurationSeconds: 30,
        compatibility: CURRENT_COMPATIBILITY,
      }).success,
    ).toBe(false)
  })
})
