import { describe, expect, it } from 'vitest'
import {
  CURRENT_COMPATIBILITY,
  clientRoomMessageSchema,
  compatibilityError,
  createRoomOptionsSchema,
  joinRoomOptionsSchema,
  isRoomCode,
  normalizeRoomCode,
} from './protocol'
import {
  DEFAULT_PLAYER_APPEARANCES,
  sanitizePlayerAppearance,
} from '../players/appearanceRegistry'

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
      protocol: 'private-room-13',
      snapshot: 10,
      maps: 'maps-9',
      weapons: 'weapons-4',
      appearances: 'appearances-3.0.0',
      build: '1.11.0',
    })
    expect(compatibilityError(CURRENT_COMPATIBILITY)).toBeNull()
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, maps: 'maps-old' })).toMatch(
      /Map registry/,
    )
    expect(compatibilityError({ ...CURRENT_COMPATIBILITY, build: 'old-client' })).toMatch(
      /Client build/,
    )
    expect(
      compatibilityError({ ...CURRENT_COMPATIBILITY, appearances: 'appearances-old' }),
    ).toMatch(/appearance registry/i)
  })

  it('requires a strict registered appearance for create and join options', () => {
    const join = {
      playerName: 'Nova',
      compatibility: CURRENT_COMPATIBILITY,
      playerAppearance: DEFAULT_PLAYER_APPEARANCES[0],
    }
    expect(joinRoomOptionsSchema.safeParse(join).success).toBe(true)
    expect(
      joinRoomOptionsSchema.safeParse({
        ...join,
        playerAppearance: { ...DEFAULT_PLAYER_APPEARANCES[0], version: 1 },
      }).success,
    ).toBe(false)
    expect(joinRoomOptionsSchema.safeParse({ ...join, playerAppearance: undefined }).success).toBe(
      false,
    )
    expect(
      joinRoomOptionsSchema.safeParse({
        ...join,
        playerAppearance: { ...DEFAULT_PLAYER_APPEARANCES[0], body: 'unknown' },
      }).success,
    ).toBe(false)
    expect(
      joinRoomOptionsSchema.safeParse({
        ...join,
        playerAppearance: { ...DEFAULT_PLAYER_APPEARANCES[0], extra: true },
      }).success,
    ).toBe(false)
  })

  it('migrates v1 appearances without changing their six existing selections', () => {
    const current = DEFAULT_PLAYER_APPEARANCES[4]
    const { victoryStyle: _victoryStyle, ...legacy } = current
    const migrated = sanitizePlayerAppearance({ ...legacy, version: 1 })
    expect(migrated).toEqual({ ...current, victoryStyle: 'proud' })
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
          projectileBoundaryMode: 'open',
          turnDurationSeconds: 30,
          compatibility: CURRENT_COMPATIBILITY,
          playerAppearance: DEFAULT_PLAYER_APPEARANCES[0],
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
