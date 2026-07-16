import type { LocalMatchConfig } from '../../match/config'
import type { WeaponId } from '../../weapons/registry'
import type { SimBeacon, SimMine, SimProjectile, TerrainOperation } from './MatchState'
import type { Vector } from '../../shared/types'
import type { TeamId } from '../../maps/registry'

export type SimulationMatchResult = {
  config: LocalMatchConfig
  winnerIndex: number | null
  winnerTeamId: TeamId | null
  winnerPlayerIndices: number[]
  remainingHealth: number
  turnsTaken: number
  durationSeconds: number
}

type EventEnvelope = { sequence: number; tick: number }

export type MatchEvent =
  | (EventEnvelope & { type: 'turn-started'; playerId: string; wind: number })
  | (EventEnvelope & { type: 'turn-expired'; playerId: string })
  | (EventEnvelope & { type: 'weapon-selected'; playerId: string; weaponId: WeaponId })
  | (EventEnvelope & {
      type: 'weapon-fired'
      playerId: string
      weaponId: WeaponId
      actionId: string
      origin: Vector
      direction?: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-spawned'
      projectileId: string
      actionId: string
      weaponId: WeaponId
      kind: SimProjectile['kind']
      position: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-bounced'
      projectileId: string
      weaponId: WeaponId
      position: Vector
    })
  | (EventEnvelope & { type: 'cluster-split'; actionId: string; position: Vector })
  | (EventEnvelope & {
      type: 'remote-split'
      actionId: string
      position: Vector
    })
  | (EventEnvelope & {
      type: 'drill-bored'
      actionId: string
      from: Vector
      to: Vector
    })
  | (EventEnvelope & {
      type: 'scatter-fired'
      actionId: string
      origin: Vector
      endpoints: Vector[]
    })
  | (EventEnvelope & {
      type: 'explosion-resolved'
      actionId: string
      weaponId: WeaponId
      position: Vector
      blastRadius: number
    })
  | (EventEnvelope & {
      type: 'teleported'
      actionId: string
      playerId: string
      from: Vector
      to: Vector
    })
  | (EventEnvelope & { type: 'mine-deployed'; mine: SimMine })
  | (EventEnvelope & {
      type: 'mine-triggered'
      mineId: string
      actionId: string
      position: Vector
    })
  | (EventEnvelope & { type: 'beacon-deployed'; beacon: SimBeacon })
  | (EventEnvelope & {
      type: 'barrage-released'
      actionId: string
      position: Vector
      bombCount: number
    })
  | (EventEnvelope & {
      type: 'melee-struck'
      actionId: string
      origin: Vector
      endpoint: Vector
      targetPlayerId: string | null
    })
  | (EventEnvelope & {
      type: 'player-frozen'
      playerId: string
      sourceActionId: string
    })
  | (EventEnvelope & { type: 'player-jumped'; playerId: string })
  | (EventEnvelope & { type: 'terrain-destroyed'; operation: TerrainOperation })
  | (EventEnvelope & {
      type: 'player-damaged'
      playerId: string
      amount: number
      sourceActionId: string
      selfDamage: boolean
    })
  | (EventEnvelope & { type: 'player-died'; playerId: string })
  | (EventEnvelope & { type: 'match-ended'; result: SimulationMatchResult })

export type MatchEventInput = MatchEvent extends infer Event
  ? Event extends MatchEvent
    ? Omit<Event, keyof EventEnvelope>
    : never
  : never
