import { describe, expect, it, vi } from 'vitest'
import type { MatchEvent } from '../simulation/match/MatchEvent'
import { EventSequenceGuard } from './presentation'

const event = (sequence: number): MatchEvent => ({
  type: 'player-died',
  sequence,
  tick: sequence,
  playerId: 'player-2',
})

const explosion = (sequence: number): MatchEvent => ({
  type: 'explosion-resolved',
  sequence,
  tick: sequence,
  actionId: 'action-1',
  weaponId: 'basic-rocket',
  position: { x: 100, y: 200 },
  blastRadius: 72,
})

describe('presentation event sequencing', () => {
  it('consumes an authoritative effect once and ignores duplicate or recovered old events', () => {
    const guard = new EventSequenceGuard()
    const effects: MatchEvent[] = []
    const playSound = vi.fn()
    for (const candidate of [explosion(1), explosion(1)])
      if (guard.consume(candidate)) {
        effects.push(candidate)
        playSound()
      }
    expect(effects).toHaveLength(1)
    expect(playSound).toHaveBeenCalledOnce()
    expect(guard.consume(event(3))).toBe(true)
    expect(guard.consume(event(2))).toBe(false)
  })

  it('resets safely for a new match generation', () => {
    const guard = new EventSequenceGuard()
    guard.consume(event(4))
    guard.reset()
    expect(guard.consume(event(1))).toBe(true)
  })
})
