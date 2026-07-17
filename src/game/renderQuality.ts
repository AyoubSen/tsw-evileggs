import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../shared/constants'

export const MAX_RENDER_SCALE = 3
const RENDER_SCALE_STEP = 0.25

export function calculateRenderScale(
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio: number,
): number {
  const width = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : VIEWPORT_WIDTH
  const height =
    Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : VIEWPORT_HEIGHT
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const displayScale = Math.min(width / VIEWPORT_WIDTH, height / VIEWPORT_HEIGHT)
  const desired = Math.max(1, Math.min(MAX_RENDER_SCALE, displayScale * dpr))
  return Math.min(
    MAX_RENDER_SCALE,
    Math.ceil(desired / RENDER_SCALE_STEP) * RENDER_SCALE_STEP,
  )
}

export function renderScaleForElement(element: HTMLElement): number {
  return calculateRenderScale(
    element.clientWidth,
    element.clientHeight,
    globalThis.devicePixelRatio ?? 1,
  )
}

export function backingSize(renderScale: number): { width: number; height: number } {
  return {
    width: Math.round(VIEWPORT_WIDTH * renderScale),
    height: Math.round(VIEWPORT_HEIGHT * renderScale),
  }
}
