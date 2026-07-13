import type { Vector } from '../shared/types'

export const INTERPOLATION_DELAY_MS = 100
export const MAX_EXTRAPOLATION_MS = 100
export const INTERPOLATION_SNAP_THRESHOLD = 110
export const STALE_STATE_THRESHOLD_MS = 350

export type PositionSample = {
  tick: number
  receivedAt: number
  position: Vector
  velocity: Vector
}

export function samplePosition(
  samples: readonly PositionSample[],
  now: number,
  current: Vector,
): { position: Vector; snap: boolean } {
  const latest = samples.at(-1)
  if (!latest) return { position: current, snap: false }
  const error = Math.hypot(latest.position.x - current.x, latest.position.y - current.y)
  if (error >= INTERPOLATION_SNAP_THRESHOLD) return { position: { ...latest.position }, snap: true }

  const renderTime = now - INTERPOLATION_DELAY_MS
  const afterIndex = samples.findIndex((sample) => sample.receivedAt >= renderTime)
  if (afterIndex > 0) {
    const before = samples[afterIndex - 1]
    const after = samples[afterIndex]
    const span = Math.max(1, after.receivedAt - before.receivedAt)
    const alpha = Math.max(0, Math.min(1, (renderTime - before.receivedAt) / span))
    return {
      position: {
        x: before.position.x + (after.position.x - before.position.x) * alpha,
        y: before.position.y + (after.position.y - before.position.y) * alpha,
      },
      snap: false,
    }
  }
  if (afterIndex === 0) return { position: { ...samples[0].position }, snap: false }

  const age = now - latest.receivedAt
  if (age > STALE_STATE_THRESHOLD_MS) return { position: { ...current }, snap: false }
  const extrapolation = Math.min(age, MAX_EXTRAPOLATION_MS) / 1000
  return {
    position: {
      x: latest.position.x + latest.velocity.x * extrapolation,
      y: latest.position.y + latest.velocity.y * extrapolation,
    },
    snap: false,
  }
}
