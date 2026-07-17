import type { LocalMatchConfig } from '../../match/config'
import type { MapId, TeamId } from '../../maps/registry'
import type { Vector } from '../../shared/types'
import type { WeaponId, WeaponInventory } from '../../weapons/registry'
import type { PlayerAppearance } from '../../players/appearanceRegistry'

export const SIMULATION_HZ = 60
export const FIXED_TICK_SECONDS = 1 / SIMULATION_HZ
export const SIMULATION_SNAPSHOT_VERSION = 10

export type MatchPhase = 'input' | 'projectile' | 'settling' | 'expired' | 'victory'

export type SimPlayer = {
  id: string
  name: string
  appearance: PlayerAppearance
  position: Vector
  velocity: Vector
  health: number
  radius: number
  teamId: TeamId
  teamSlot: number
  facing: -1 | 1
  alive: boolean
  grounded: boolean
  moveDirection: -1 | 0 | 1
  frozenTurnsRemaining: number
  frozenAppliedTurn: number
  selectedWeapon: WeaponId
  inventory: WeaponInventory
}

export type SimProjectile = {
  id: string
  actionId: string
  ownerId: string
  weaponId: WeaponId
  kind: 'primary' | 'cluster-child' | 'fork-child' | 'beacon-bomb'
  position: Vector
  velocity: Vector
  radius: number
  fuseTicks: number
}

export type SimMine = {
  id: string
  actionId: string
  ownerId: string
  teamId: TeamId
  weaponId: 'deployable-mine'
  position: Vector
  radius: number
  triggerRadius: number
  armedTurn: number
}

export type SimBeacon = {
  id: string
  actionId: string
  ownerId: string
  weaponId: 'bomb-beacon'
  position: Vector
  remainingTicks: number
}

export type TerrainOperation = {
  sequence: number
  tick: number
  type: 'subtract-circle'
  x: number
  y: number
  radius: number
  sourceActionId: string
}

export type ActiveAction = {
  id: string
  playerId: string
  weaponId: WeaponId
} | null

export type MatchState = {
  matchId: string
  seed: number
  tick: number
  config: LocalMatchConfig
  mapId: MapId
  mapRevision: number
  mapContentHash: string
  worldWidth: number
  worldHeight: number
  phase: MatchPhase
  paused: boolean
  players: SimPlayer[]
  activePlayerIndex: number
  teamTurnCursors: [number, number]
  turnNumber: number
  timerRemainingTicks: number
  expiredTicks: number
  settlingTicks: number
  durationTicks: number
  wind: number
  projectiles: SimProjectile[]
  mines: SimMine[]
  beacons: SimBeacon[]
  activeAction: ActiveAction
  pendingExplosions: []
  terrainOperations: TerrainOperation[]
  winnerPlayerId: string | null
  winnerTeamId: TeamId | null
  isDraw: boolean
  nextProjectileId: number
  nextMineId: number
  nextBeaconId: number
  nextActionId: number
  nextTerrainSequence: number
  nextEventSequence: number
  lastCommandSequence: number
}

export type SerializedMatchState = {
  version: typeof SIMULATION_SNAPSHOT_VERSION
  state: MatchState
  accumulatorSeconds: number
}
