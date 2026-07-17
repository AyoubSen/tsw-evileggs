import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '../../src/simulation/match/MatchEvent'
import { MatchBalanceTracker } from './MatchBalanceTracker'

describe('match balance tracker', () => {
  it('aggregates weapon outcomes and resolution pacing without player positions', () => {
    const tracker = new MatchBalanceTracker()
    tracker.record([
      {
        type: 'weapon-fired',
        sequence: 1,
        tick: 10,
        playerId: 'a',
        weaponId: 'basic-rocket',
        actionId: 'action-1',
        origin: { x: 10, y: 10 },
      },
      {
        type: 'projectile-spawned',
        sequence: 2,
        tick: 10,
        projectileId: 'projectile-1',
        actionId: 'action-1',
        weaponId: 'basic-rocket',
        kind: 'primary',
        position: { x: 10, y: 10 },
      },
      {
        type: 'player-damaged',
        sequence: 3,
        tick: 20,
        playerId: 'b',
        amount: 40,
        sourceActionId: 'action-1',
        selfDamage: false,
      },
      { type: 'player-died', sequence: 4, tick: 20, playerId: 'b' },
      {
        type: 'projectile-boundary-removed',
        sequence: 5,
        tick: 21,
        projectileId: 'projectile-1',
        edge: 'right',
        position: { x: 960, y: 100 },
      },
      { type: 'turn-started', sequence: 6, tick: 30, playerId: 'b', wind: 0 },
    ] satisfies MatchEvent[])

    expect(tracker.summary()).toEqual({
      expiredTurns: 0,
      weapons: {
        'basic-rocket': {
          activations: 1,
          damage: 40,
          selfDamage: 0,
          eliminations: 1,
          boundaryMisses: 1,
          totalResolutionTicks: 20,
          resolvedActions: 1,
        },
      },
    })
  })
})
