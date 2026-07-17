import type { Vector } from '../shared/types'

export function fitWorldZoom(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
): number {
  if ([viewportWidth, viewportHeight, worldWidth, worldHeight].some((value) => value <= 0)) return 1
  return Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight)
}

export function followWorldZoom(fitZoom: number): number {
  return Math.min(1, Math.max(fitZoom, fitZoom * 1.32))
}

export function clampedCameraScroll(
  focus: Vector,
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
): Vector {
  const safeZoom = Math.max(zoom, Number.EPSILON)
  const visibleWidth = viewport.width / safeZoom
  const visibleHeight = viewport.height / safeZoom
  return {
    x: Math.min(Math.max(focus.x - visibleWidth / 2, 0), Math.max(0, world.width - visibleWidth)),
    y: Math.min(Math.max(focus.y - visibleHeight / 2, 0), Math.max(0, world.height - visibleHeight)),
  }
}
