import { beforeEach, describe, expect, it } from 'vitest'
import { ROOM_CODE_PATTERN } from '../src/network/protocol'
import { RoomCodeRegistry } from './roomCodeRegistry'

describe('RoomCodeRegistry', () => {
  let registry: RoomCodeRegistry

  beforeEach(() => {
    registry = new RoomCodeRegistry()
  })

  it('allocates unique human-friendly codes and resolves case-insensitively', () => {
    const codes = new Set<string>()
    for (let index = 0; index < 100; index += 1) {
      const entry = registry.register(`room-${index}`)
      expect(entry.code).toMatch(ROOM_CODE_PATTERN)
      expect(registry.resolve(entry.code.toLowerCase())?.roomId).toBe(`room-${index}`)
      codes.add(entry.code)
    }
    expect(codes.size).toBe(100)
  })

  it('updates diagnostics and expires registrations', () => {
    const entry = registry.register('room-a')
    registry.update(entry.code, { phase: 'playing', connectedPlayers: 2 })
    expect(registry.resolve(entry.code)).toMatchObject({ phase: 'playing', connectedPlayers: 2 })
    registry.remove(entry.code)
    expect(registry.resolve(entry.code)).toBeUndefined()
  })
})
