import type { LocalMatchConfig } from '../../match/config'
import type { WeaponId } from '../../weapons/registry'
import type { SimBeacon, SimProjectile, TerrainOperation } from './MatchState'
import type { Vector } from '../../shared/types'
import type { TeamId } from '../../maps/registry'
import type { ProjectileBoundaryEdge } from '../projectile/contact'

export type SimulationMatchResult = {
  config: LocalMatchConfig
  winnerIndex: number | null
  winnerTeamId: TeamId | null
  winnerPlayerIndices: number[]
  remainingHealth: number
  turnsTaken: number
  durationSeconds: number
  playerRecaps: PlayerRecapStats[]
}

export type PlayerRecapStats = {
  playerId: string
  damageDealt: number
  selfDamage: number
  shots: number
  terrainDestroyed: number
  favoriteWeaponId: WeaponId | null
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
  | (EventEnvelope & {
      type: 'projectile-reflected'
      objectId: string
      projectileId: string
      position: Vector
      incomingVelocity: Vector
      outgoingVelocity: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-portaled'
      objectId: string
      projectileId: string
      from: Vector
      to: Vector
      incomingVelocity: Vector
      outgoingVelocity: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-boundary-reflected'
      projectileId: string
      edge: ProjectileBoundaryEdge
      position: Vector
      incomingVelocity: Vector
      outgoingVelocity: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-wrapped'
      projectileId: string
      edge: 'left' | 'right'
      from: Vector
      to: Vector
      velocity: Vector
    })
  | (EventEnvelope & {
      type: 'projectile-boundary-removed'
      projectileId: string
      edge: ProjectileBoundaryEdge
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
      result: 'player' | 'terrain' | 'miss'
    })
  | (EventEnvelope & {
      type: 'player-frozen'
      playerId: string
      sourceActionId: string
    })
  | (EventEnvelope & { type: 'player-jumped'; playerId: string })
  | (EventEnvelope & { type: 'terrain-destroyed'; operation: TerrainOperation })
  | (EventEnvelope & { type: 'terrain-created'; operation: TerrainOperation })
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
