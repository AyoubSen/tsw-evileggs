import Phaser from 'phaser'
import type { Vector } from '../shared/types'
import type {
  EllipseRecipe,
  PaletteRole,
  SemanticPalette,
  ShapePoint,
  ShapeRecipe,
} from './weaponVisualRecipes'

export type DrawShapeOptions = Readonly<{
  origin: Vector
  direction?: Vector
  scale?: number
  mirrorY?: boolean
  palette: SemanticPalette
  alpha?: number
}>

const ELLIPSE_SEGMENTS = 24

function finiteDirection(direction: Vector | undefined): Vector {
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y))
    return { x: 1, y: 0 }
  const length = Math.hypot(direction.x, direction.y)
  return length > Number.EPSILON ? { x: direction.x / length, y: direction.y / length } : { x: 1, y: 0 }
}

function clampedAlpha(value: number | undefined): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? (value ?? 1) : 1))
}

function ellipsePoints(recipe: EllipseRecipe): readonly ShapePoint[] {
  return Array.from({ length: ELLIPSE_SEGMENTS }, (_, index) => {
    const angle = (index / ELLIPSE_SEGMENTS) * Math.PI * 2
    return {
      x: recipe.center.x + Math.cos(angle) * recipe.radiusX,
      y: recipe.center.y + Math.sin(angle) * recipe.radiusY,
    }
  })
}

export function drawShapeRecipe(
  graphics: Phaser.GameObjects.Graphics,
  recipe: ShapeRecipe,
  options: DrawShapeOptions,
): void {
  const direction = finiteDirection(options.direction)
  const across = { x: -direction.y, y: direction.x }
  const scale = Number.isFinite(options.scale) ? Math.max(0, options.scale ?? 1) : 1
  const mirror = options.mirrorY ? -1 : 1
  const baseAlpha = clampedAlpha(options.alpha)
  const color = (role: PaletteRole): number => options.palette[role]
  const transform = (local: ShapePoint): Phaser.Math.Vector2 =>
    new Phaser.Math.Vector2(
      options.origin.x +
        direction.x * local.x * scale +
        across.x * local.y * scale * mirror,
      options.origin.y +
        direction.y * local.x * scale +
        across.y * local.y * scale * mirror,
    )
  const drawClosedShape = (
    localPoints: readonly ShapePoint[],
    fill: PaletteRole | undefined,
    stroke: PaletteRole | undefined,
    strokeWidth: number | undefined,
    alpha: number,
  ): void => {
    if (localPoints.length < 3) return
    const worldPoints = localPoints.map(transform)
    if (fill) graphics.fillStyle(color(fill), alpha).fillPoints(worldPoints, true)
    if (stroke && (strokeWidth ?? 0) > 0)
      graphics
        .lineStyle((strokeWidth ?? 0) * scale, color(stroke), alpha)
        .strokePoints(worldPoints, true)
  }

  for (const primitive of recipe.primitives) {
    const alpha = baseAlpha * clampedAlpha(primitive.alpha)
    switch (primitive.kind) {
      case 'polygon':
        drawClosedShape(
          primitive.points,
          primitive.fill,
          primitive.stroke,
          primitive.strokeWidth,
          alpha,
        )
        break
      case 'line': {
        const from = transform(primitive.from)
        const to = transform(primitive.to)
        if (primitive.outline && (primitive.outlineWidth ?? 0) > 0)
          graphics
            .lineStyle(
              (primitive.width + (primitive.outlineWidth ?? 0) * 2) * scale,
              color(primitive.outline),
              alpha,
            )
            .lineBetween(from.x, from.y, to.x, to.y)
        graphics
          .lineStyle(primitive.width * scale, color(primitive.color), alpha)
          .lineBetween(from.x, from.y, to.x, to.y)
        break
      }
      case 'circle': {
        const center = transform(primitive.center)
        const radius = primitive.radius * scale
        if (primitive.fill)
          graphics.fillStyle(color(primitive.fill), alpha).fillCircle(center.x, center.y, radius)
        if (primitive.stroke && (primitive.strokeWidth ?? 0) > 0)
          graphics
            .lineStyle((primitive.strokeWidth ?? 0) * scale, color(primitive.stroke), alpha)
            .strokeCircle(center.x, center.y, radius)
        break
      }
      case 'ellipse':
        drawClosedShape(
          ellipsePoints(primitive),
          primitive.fill,
          primitive.stroke,
          primitive.strokeWidth,
          alpha,
        )
        break
    }
  }
}
