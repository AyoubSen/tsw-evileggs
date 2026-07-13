import { randomInt } from 'node:crypto'
import { normalizeRoomCode, ROOM_CODE_LENGTH, type RoomPhase } from '../src/network/protocol'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type RoomCodeEntry = {
  code: string
  roomId: string
  phase: RoomPhase
  connectedPlayers: number
  createdAt: number
}

export class RoomCodeRegistry {
  private readonly entries = new Map<string, RoomCodeEntry>()

  register(roomId: string): RoomCodeEntry {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = ''
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1)
        code += ALPHABET[randomInt(ALPHABET.length)]
      if (this.entries.has(code)) continue
      const entry = {
        code,
        roomId,
        phase: 'waiting' as const,
        connectedPlayers: 0,
        createdAt: Date.now(),
      }
      this.entries.set(code, entry)
      return entry
    }
    throw new Error('Unable to allocate a unique room code')
  }

  resolve(code: string): RoomCodeEntry | undefined {
    return this.entries.get(normalizeRoomCode(code))
  }

  update(code: string, updates: Partial<Pick<RoomCodeEntry, 'phase' | 'connectedPlayers'>>): void {
    const entry = this.resolve(code)
    if (entry) Object.assign(entry, updates)
  }

  remove(code: string): void {
    this.entries.delete(normalizeRoomCode(code))
  }

  get size(): number {
    return this.entries.size
  }

  diagnostics(): RoomCodeEntry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry }))
  }

  clear(): void {
    this.entries.clear()
  }
}

export const roomCodeRegistry = new RoomCodeRegistry()
