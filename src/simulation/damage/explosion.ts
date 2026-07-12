import type { Vector } from '../../shared/types'

export function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function explosionFalloff(
  baseValue: number,
  blastRadius: number,
  targetDistance: number,
): number {
  if (targetDistance >= blastRadius) return 0
  return baseValue * (1 - targetDistance / blastRadius)
}

export function knockbackVelocity(
  center: Vector,
  target: Vector,
  force: number,
  blastRadius: number,
): Vector {
  const targetDistance = distance(center, target)
  const magnitude = explosionFalloff(force, blastRadius, targetDistance)
  if (magnitude === 0) return { x: 0, y: 0 }
  const dx = target.x - center.x
  const dy = target.y - center.y
  const length = Math.hypot(dx, dy) || 1
  return { x: (dx / length) * magnitude, y: (dy / length) * magnitude - magnitude * 0.25 }
}
