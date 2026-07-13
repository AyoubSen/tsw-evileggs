import type { LocalMatchConfig } from '../../match/config'
import type { WeaponId } from '../../weapons/registry'
import type { TerrainOperation } from './MatchState'

export type SimulationMatchResult = {
  config: LocalMatchConfig
  winnerIndex: number | null
  remainingHealth: number
  turnsTaken: number
  durationSeconds: number
}

type EventEnvelope = { sequence: number; tick: number }

export type MatchEvent =
  | (EventEnvelope & { type: 'turn-started'; playerId: string })
  | (EventEnvelope & { type: 'turn-expired'; playerId: string })
  | (EventEnvelope & { type: 'weapon-selected'; playerId: string; weaponId: WeaponId })
  | (EventEnvelope & {
      type: 'weapon-fired'
      playerId: string
      weaponId: WeaponId
      actionId: string
    })
  | (EventEnvelope & { type: 'projectile-spawned'; projectileId: string; actionId: string })
  | (EventEnvelope & { type: 'terrain-destroyed'; operation: TerrainOperation })
  | (EventEnvelope & { type: 'player-damaged'; playerId: string; amount: number })
  | (EventEnvelope & { type: 'player-died'; playerId: string })
  | (EventEnvelope & { type: 'match-ended'; result: SimulationMatchResult })

export type MatchEventInput = MatchEvent extends infer Event
  ? Event extends MatchEvent
    ? Omit<Event, keyof EventEnvelope>
    : never
  : never
