import type { Vector } from '../../shared/types'
import type { TerrainMask } from '../../terrain/TerrainMask'
import type { SimPlayer } from '../match/MatchState'
import type { WeaponDefinition } from '../../weapons/registry'

type TeleportContext = {
  terrain: TerrainMask
  worldWidth: number
  worldHeight: number
  player: SimPlayer
  players: readonly SimPlayer[]
  weapon: WeaponDefinition
}

const finiteVector = (value: unknown): value is Vector =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Vector).x) &&
  Number.isFinite((value as Vector).y)

const playerBodyIntersectsTerrain = (
  terrain: TerrainMask,
  center: Vector,
  radius: number,
): boolean =>
  [
    center,
    { x: center.x, y: center.y - radius * 0.9 },
    { x: center.x - radius * 0.75, y: center.y - radius * 0.45 },
    { x: center.x + radius * 0.75, y: center.y - radius * 0.45 },
    { x: center.x - radius * 0.9, y: center.y },
    { x: center.x + radius * 0.9, y: center.y },
  ].some((point) => terrain.isSolid(point.x, point.y))

export const isTeleportDestinationValid = (
  destination: Vector,
  context: TeleportContext,
): boolean => {
  const { terrain, worldWidth, worldHeight, player, players, weapon } = context
  if (!finiteVector(destination)) return false
  if (
    destination.x < weapon.teleportEdgeMargin ||
    destination.x > worldWidth - weapon.teleportEdgeMargin ||
    destination.y < weapon.teleportEdgeMargin ||
    destination.y > worldHeight - weapon.teleportEdgeMargin
  )
    return false

  const surface = terrain.surfaceY(destination.x, destination.y)
  if (surface === null || Math.abs(destination.y - (surface - player.radius)) > 0.001)
    return false
  if (playerBodyIntersectsTerrain(terrain, destination, player.radius)) return false

  return !players.some(
    (candidate) =>
      candidate.id !== player.id &&
      candidate.alive &&
      Math.hypot(
        candidate.position.x - destination.x,
        candidate.position.y - destination.y,
      ) < weapon.teleportPlayerClearance,
  )
}

export const resolveTeleportDestination = (
  pointer: Vector,
  context: TeleportContext,
): Vector | null => {
  if (!finiteVector(pointer)) return null
  const surface = context.terrain.surfaceY(pointer.x, pointer.y)
  if (surface === null) return null
  const destination = { x: pointer.x, y: surface - context.player.radius }
  return isTeleportDestinationValid(destination, context) ? destination : null
}
