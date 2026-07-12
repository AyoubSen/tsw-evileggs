import type { TurnPhase, Vector } from '../../shared/types'

export const DRAG_MIN_DISTANCE = 36
export const DRAG_MAX_DISTANCE = 180
export const DRAG_START_DISTANCE = 8
export const AIM_GUIDE_STEPS = 8

export type DragAim = {
  direction: Vector
  power: number
  distance: number
  worldAngle: number
}

export function movementDirection(codes: ReadonlySet<string>): -1 | 0 | 1 {
  return (Number(codes.has('KeyD')) - Number(codes.has('KeyQ') || codes.has('KeyA'))) as -1 | 0 | 1
}

export function isJumpCode(code: string): boolean {
  return code === 'KeyZ' || code === 'KeyW'
}

export function canJump(phase: TurnPhase, grounded: boolean, jumpReady: boolean): boolean {
  return phase === 'input' && grounded && jumpReady
}

export function getPullVector(origin: Vector, pointer: Vector): Vector {
  return { x: pointer.x - origin.x, y: pointer.y - origin.y }
}

export function getFiringDirectionFromPull(pull: Vector): Vector | null {
  const length = Math.hypot(pull.x, pull.y)
  if (length === 0) return null
  return { x: -pull.x / length, y: -pull.y / length }
}

export function getPowerFromPullDistance(
  distance: number,
  minimumPower: number,
  maximumPower: number,
): number | null {
  if (distance < DRAG_MIN_DISTANCE) return null
  const clampedDistance = Math.min(distance, DRAG_MAX_DISTANCE)
  const normalizedPower =
    (clampedDistance - DRAG_MIN_DISTANCE) / (DRAG_MAX_DISTANCE - DRAG_MIN_DISTANCE)
  return minimumPower + normalizedPower * (maximumPower - minimumPower)
}

export function dragAim(
  origin: Vector,
  pointer: Vector,
  minimumPower: number,
  maximumPower: number,
): DragAim | null {
  const pull = getPullVector(origin, pointer)
  const rawDistance = Math.hypot(pull.x, pull.y)
  const direction = getFiringDirectionFromPull(pull)
  const power = getPowerFromPullDistance(rawDistance, minimumPower, maximumPower)
  if (!direction || power === null) return null
  return {
    direction,
    power,
    distance: Math.min(rawDistance, DRAG_MAX_DISTANCE),
    worldAngle: (Math.atan2(-direction.y, direction.x) * 180) / Math.PI,
  }
}

export function canvasPointToWorld(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  worldWidth: number,
  worldHeight: number,
): Vector {
  return {
    x: ((clientX - bounds.left) / bounds.width) * worldWidth,
    y: ((clientY - bounds.top) / bounds.height) * worldHeight,
  }
}
