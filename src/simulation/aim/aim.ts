import type { Vector } from '../../shared/types'

/** Elevation is degrees above the active character's facing-relative horizon. */
export function aimDirection(elevationDegrees: number, facing: 1 | -1): Vector {
  const radians = (elevationDegrees * Math.PI) / 180
  return { x: Math.cos(radians) * facing, y: -Math.sin(radians) }
}

export function launchSpeed(baseSpeed: number, powerPercent: number): number {
  return baseSpeed * (powerPercent / 100)
}

export function launchVelocity(direction: Vector, baseSpeed: number, powerPercent: number): Vector {
  const speed = launchSpeed(baseSpeed, powerPercent)
  return { x: direction.x * speed, y: direction.y * speed }
}
