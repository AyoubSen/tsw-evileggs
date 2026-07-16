import { MapSchema, schema, type SchemaType } from '@colyseus/schema'
import type { MatchState, SimPlayer, SimProjectile } from '../../src/simulation/match/MatchState'

export const RoomPlayerState = schema({
  playerId: { type: 'string', default: '' },
  seat: { type: 'uint8', default: 0 },
  teamId: { type: 'uint8', default: 0 },
  teamSlot: { type: 'uint8', default: 0 },
  name: { type: 'string', default: '' },
  sessionId: { type: 'string', default: '' },
  connected: { type: 'boolean', default: true },
  ready: { type: 'boolean', default: false },
  wantsRematch: { type: 'boolean', default: false },
  latestCommandId: { type: 'uint32', default: 0 },
  x: { type: 'float64', default: 0 },
  y: { type: 'float64', default: 0 },
  velocityX: { type: 'float64', default: 0 },
  velocityY: { type: 'float64', default: 0 },
  health: { type: 'float64', default: 100 },
  alive: { type: 'boolean', default: true },
  grounded: { type: 'boolean', default: true },
  moveDirection: { type: 'int8', default: 0 },
  facing: { type: 'int8', default: 1 },
  selectedWeapon: { type: 'string', default: 'basic-rocket' },
  basicRocketAmmo: { type: 'int16', default: -1 },
  timedGrenadeAmmo: { type: 'int16', default: 3 },
  scatterShotAmmo: { type: 'int16', default: 3 },
  clusterChargeAmmo: { type: 'int16', default: 2 },
  teleporterAmmo: { type: 'int16', default: 2 },
})
export type RoomPlayerState = SchemaType<typeof RoomPlayerState>

export const ProjectileState = schema({
  id: { type: 'string', default: '' },
  actionId: { type: 'string', default: '' },
  ownerId: { type: 'string', default: '' },
  weaponId: { type: 'string', default: '' },
  kind: { type: 'string', default: 'primary' },
  x: { type: 'float64', default: 0 },
  y: { type: 'float64', default: 0 },
  velocityX: { type: 'float64', default: 0 },
  velocityY: { type: 'float64', default: 0 },
  radius: { type: 'float64', default: 0 },
  fuseTicks: { type: 'uint32', default: 0 },
})
export type ProjectileState = SchemaType<typeof ProjectileState>

export const MatchResultState = schema({
  available: { type: 'boolean', default: false },
  winnerSeat: { type: 'int8', default: -1 },
  winnerTeamId: { type: 'int8', default: -1 },
  reason: { type: 'string', default: '' },
  remainingHealth: { type: 'uint16', default: 0 },
  turnsTaken: { type: 'uint32', default: 0 },
  durationSeconds: { type: 'uint32', default: 0 },
})
export type MatchResultState = SchemaType<typeof MatchResultState>

export const PrivateMatchState = schema({
  roomCode: { type: 'string', default: '' },
  phase: { type: 'string', default: 'waiting' },
  mode: { type: 'string', default: '1v1' },
  capacity: { type: 'uint8', default: 2 },
  mapId: { type: 'string', default: 'rolling-hills' },
  turnDurationSeconds: { type: 'uint8', default: 30 },
  protocolVersion: { type: 'string', default: '' },
  mapRegistryVersion: { type: 'string', default: '' },
  weaponRegistryVersion: { type: 'string', default: '' },
  countdownRemainingMs: { type: 'uint16', default: 0 },
  reconnectRemainingMs: { type: 'uint16', default: 0 },
  matchGeneration: { type: 'uint32', default: 0 },
  simulationTick: { type: 'uint32', default: 0 },
  turnNumber: { type: 'uint32', default: 0 },
  activePlayerSeat: { type: 'int8', default: -1 },
  matchPhase: { type: 'string', default: '' },
  timerRemainingTicks: { type: 'uint32', default: 0 },
  wind: { type: 'int16', default: 0 },
  eventSequence: { type: 'uint32', default: 0 },
  terrainSequence: { type: 'uint32', default: 0 },
  players: { map: RoomPlayerState, default: new MapSchema<RoomPlayerState>() },
  projectiles: { map: ProjectileState, default: new MapSchema<ProjectileState>() },
  result: { type: MatchResultState, default: new MatchResultState() },
})
export type PrivateMatchState = SchemaType<typeof PrivateMatchState>

const ammo = (value: number | 'unlimited') => (value === 'unlimited' ? -1 : value)

function projectPlayer(target: RoomPlayerState, source: SimPlayer): void {
  target.x = source.position.x
  target.y = source.position.y
  target.velocityX = source.velocity.x
  target.velocityY = source.velocity.y
  target.health = source.health
  target.alive = source.alive
  target.grounded = source.grounded
  target.moveDirection = source.moveDirection
  target.facing = source.facing
  target.teamId = source.teamId
  target.teamSlot = source.teamSlot
  target.selectedWeapon = source.selectedWeapon
  target.basicRocketAmmo = ammo(source.inventory['basic-rocket'])
  target.timedGrenadeAmmo = ammo(source.inventory['timed-grenade'])
  target.scatterShotAmmo = ammo(source.inventory['scatter-shot'])
  target.clusterChargeAmmo = ammo(source.inventory['cluster-charge'])
  target.teleporterAmmo = ammo(source.inventory.teleporter)
}

function createProjectile(source: SimProjectile): ProjectileState {
  const target = new ProjectileState()
  target.id = source.id
  target.actionId = source.actionId
  target.ownerId = source.ownerId
  target.weaponId = source.weaponId
  target.kind = source.kind
  target.x = source.position.x
  target.y = source.position.y
  target.velocityX = source.velocity.x
  target.velocityY = source.velocity.y
  target.radius = source.radius
  target.fuseTicks = source.fuseTicks
  return target
}

export function projectSimulationState(state: PrivateMatchState, simulation: MatchState): void {
  state.simulationTick = simulation.tick
  state.turnNumber = simulation.turnNumber
  state.activePlayerSeat = simulation.activePlayerIndex
  state.matchPhase = simulation.phase
  state.timerRemainingTicks = simulation.timerRemainingTicks
  state.wind = simulation.wind
  state.eventSequence = Math.max(0, simulation.nextEventSequence - 1)
  state.terrainSequence = Math.max(0, simulation.nextTerrainSequence - 1)
  for (const roomPlayer of state.players.values())
    projectPlayer(roomPlayer, simulation.players[roomPlayer.seat])

  const activeIds = new Set(simulation.projectiles.map((projectile) => projectile.id))
  for (const id of state.projectiles.keys()) if (!activeIds.has(id)) state.projectiles.delete(id)
  for (const projectile of simulation.projectiles) {
    const target = state.projectiles.get(projectile.id) ?? createProjectile(projectile)
    target.x = projectile.position.x
    target.y = projectile.position.y
    target.velocityX = projectile.velocity.x
    target.velocityY = projectile.velocity.y
    target.fuseTicks = projectile.fuseTicks
    if (!state.projectiles.has(projectile.id)) state.projectiles.set(projectile.id, target)
  }
}
