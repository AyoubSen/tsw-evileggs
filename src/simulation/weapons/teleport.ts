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

const finiteVector = (value: Vector): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.y)

const circleIntersectsTerrain = (
  terrain: TerrainMask,
  center: Vector,
  radius: number,
): boolean => {
  const scale = terrain.scale
  const minX = Math.max(0, Math.floor((center.x - radius) / scale))
  const maxX = Math.min(terrain.width - 1, Math.floor((center.x + radius) / scale))
  const minY = Math.max(0, Math.floor((center.y - radius) / scale))
  const maxY = Math.min(terrain.height - 1, Math.floor((center.y + radius) / scale))
  const radiusSquared = radius * radius

  for (let y = minY; y <= maxY; y += 1)
    for (let x = minX; x <= maxX; x += 1) {
      if (terrain.cells[y * terrain.width + x] === 0) continue
      const nearestX = Math.max(x * scale, Math.min(center.x, (x + 1) * scale))
      const nearestY = Math.max(y * scale, Math.min(center.y, (y + 1) * scale))
      const dx = center.x - nearestX
      const dy = center.y - nearestY
      // Tangency with the supporting cell is valid; only overlap blocks the landing.
      if (dx * dx + dy * dy < radiusSquared - Number.EPSILON) return true
    }
  return false
}

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
  if (circleIntersectsTerrain(terrain, destination, player.radius)) return false

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
