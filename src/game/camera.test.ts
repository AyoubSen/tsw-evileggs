import { describe, expect, it } from 'vitest'
import { clampedCameraScroll, fitWorldZoom, followWorldZoom } from './camera'

describe('world camera geometry', () => {
  it.each([
    [960, 540, 1],
    [1920, 1080, 0.5],
    [2048, 1152, 0.46875],
  ])('fits a %sx%s world', (width, height, expected) => {
    expect(fitWorldZoom(960, 540, width, height)).toBe(expected)
  })

  it('keeps follow zoom readable and within fit and native scale', () => {
    expect(followWorldZoom(0.5)).toBeCloseTo(0.66)
    expect(followWorldZoom(1)).toBe(1)
  })

  it('clamps focus at every large-world edge', () => {
    const world = { width: 1920, height: 1080 }
    const viewport = { width: 960, height: 540 }
    expect(clampedCameraScroll({ x: 0, y: 0 }, world, viewport, 1)).toEqual({ x: 0, y: 0 })
    expect(clampedCameraScroll({ x: 1920, y: 1080 }, world, viewport, 1)).toEqual({
      x: 960,
      y: 540,
    })
  })
})
