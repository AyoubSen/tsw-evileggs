import { describe, expect, it } from 'vitest'
import {
  INTERPOLATION_DELAY_MS,
  INTERPOLATION_SNAP_THRESHOLD,
  MAX_EXTRAPOLATION_MS,
  STALE_STATE_THRESHOLD_MS,
  samplePosition,
  type PositionSample,
} from './interpolation'

const sample = (receivedAt: number, x: number, velocityX = 0): PositionSample => ({
  tick: receivedAt,
  receivedAt,
  position: { x, y: 10 },
  velocity: { x: velocityX, y: 0 },
})

describe('online position interpolation', () => {
  it('interpolates within authoritative samples using a short buffer', () => {
    const result = samplePosition([sample(1000, 0), sample(1100, 40)], 1150, { x: 20, y: 10 })
    expect(INTERPOLATION_DELAY_MS).toBe(100)
    expect(result.position.x).toBe(20)
    expect(result.snap).toBe(false)
  })

  it('bounds extrapolation and stops stale samples indefinitely', () => {
    const latest = sample(1000, 10, 100)
    expect(
      samplePosition([latest], 1000 + INTERPOLATION_DELAY_MS + MAX_EXTRAPOLATION_MS, {
        x: 10,
        y: 10,
      }).position.x,
    ).toBe(20)
    expect(
      samplePosition([latest], 1000 + STALE_STATE_THRESHOLD_MS + 1, { x: 12, y: 10 }).position.x,
    ).toBe(12)
  })

  it('snaps a teleport or large correction cleanly', () => {
    const result = samplePosition([sample(1000, INTERPOLATION_SNAP_THRESHOLD + 20)], 1000, {
      x: 0,
      y: 10,
    })
    expect(result.snap).toBe(true)
    expect(result.position.x).toBe(INTERPOLATION_SNAP_THRESHOLD + 20)
  })
})
