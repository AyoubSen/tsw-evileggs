import type { LocalMatchConfig } from '../../match/config'
import type { MapId } from '../../maps/registry'
import type { Vector } from '../../shared/types'
import type { WeaponId, WeaponInventory } from '../../weapons/registry'

export const SIMULATION_HZ = 60
export const FIXED_TICK_SECONDS = 1 / SIMULATION_HZ

export type MatchPhase = 'input' | 'projectile' | 'settling' | 'expired' | 'victory'

export type SimPlayer = {
  id: string
  name: string
  position: Vector
  velocity: Vector
  health: number
  radius: number
  alive: boolean
  grounded: boolean
  moveDirection: -1 | 0 | 1
  selectedWeapon: WeaponId
  inventory: WeaponInventory
}

export type SimProjectile = {
  id: string
  actionId: string
  ownerId: string
  weaponId: WeaponId
  kind: 'primary' | 'cluster-child'
  position: Vector
  velocity: Vector
  radius: number
  fuseTicks: number
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
  phase: MatchPhase
  paused: boolean
  players: [SimPlayer, SimPlayer]
  activePlayerIndex: 0 | 1
  turnNumber: number
  timerRemainingTicks: number
  expiredTicks: number
  settlingTicks: number
  durationTicks: number
  wind: number
  projectiles: SimProjectile[]
  activeAction: ActiveAction
  pendingExplosions: []
  terrainOperations: TerrainOperation[]
  winnerPlayerId: string | null
  isDraw: boolean
  nextProjectileId: number
  nextActionId: number
  nextTerrainSequence: number
  nextEventSequence: number
  lastCommandSequence: number
}

export type SerializedMatchState = {
  version: 1
  state: MatchState
}
