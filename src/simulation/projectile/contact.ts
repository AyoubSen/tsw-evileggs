import type { MapObjectDefinition, ReflectorWallDefinition } from '../../maps/mapDocument'
import type { Vector } from '../../shared/types'

type ContactBase = {
  toi: number
  position: Vector
  normal: Vector
}

export type ProjectileContact =
  | (ContactBase & { kind: 'boundary'; stableId: string })
  | (ContactBase & { kind: 'player'; playerId: string; stableId: string })
  | (ContactBase & { kind: 'terrain'; stableId: string })
  | (ContactBase & {
      kind: 'reflector'
      object: ReflectorWallDefinition
      stableId: string
    })

const CONTACT_PRIORITY: Record<ProjectileContact['kind'], number> = {
  boundary: 0,
  player: 1,
  reflector: 2,
  terrain: 3,
}
const CONTACT_EPSILON = 1e-9

export function compareProjectileContacts(left: ProjectileContact, right: ProjectileContact): number {
  if (Math.abs(left.toi - right.toi) > CONTACT_EPSILON) return left.toi - right.toi
  const priority = CONTACT_PRIORITY[left.kind] - CONTACT_PRIORITY[right.kind]
  if (priority !== 0) return priority
  return left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0
}

export function firstProjectileContact(
  contacts: readonly (ProjectileContact | null)[],
): ProjectileContact | null {
  let first: ProjectileContact | null = null
  for (const contact of contacts)
    if (contact && (!first || compareProjectileContacts(contact, first) < 0)) first = contact
  return first
}

export function sweepCircleAgainstReflector(
  start: Vector,
  end: Vector,
  projectileRadius: number,
  object: ReflectorWallDefinition,
): ProjectileContact | null {
  const segment = { x: object.end.x - object.start.x, y: object.end.y - object.start.y }
  const segmentLength = Math.hypot(segment.x, segment.y)
  if (segmentLength <= Number.EPSILON) return null
  const tangent = { x: segment.x / segmentLength, y: segment.y / segmentLength }
  const surfaceNormal = { x: -tangent.y, y: tangent.x }
  const movement = { x: end.x - start.x, y: end.y - start.y }
  const radius = projectileRadius + object.thickness / 2
  const candidates: ProjectileContact[] = []

  const signedStart =
    (start.x - object.start.x) * surfaceNormal.x +
    (start.y - object.start.y) * surfaceNormal.y
  const signedMovement = movement.x * surfaceNormal.x + movement.y * surfaceNormal.y
  if (Math.abs(signedMovement) > CONTACT_EPSILON) {
    for (const side of [-1, 1] as const) {
      const normal = { x: surfaceNormal.x * side, y: surfaceNormal.y * side }
      if (movement.x * normal.x + movement.y * normal.y >= -CONTACT_EPSILON) continue
      const toi = (side * radius - signedStart) / signedMovement
      if (toi < -CONTACT_EPSILON || toi > 1 + CONTACT_EPSILON) continue
      const clampedToi = Math.max(0, Math.min(1, toi))
      const position = {
        x: start.x + movement.x * clampedToi,
        y: start.y + movement.y * clampedToi,
      }
      const projection =
        (position.x - object.start.x) * tangent.x +
        (position.y - object.start.y) * tangent.y
      if (projection < -CONTACT_EPSILON || projection > segmentLength + CONTACT_EPSILON) continue
      candidates.push({
        kind: 'reflector',
        toi: clampedToi,
        position,
        normal,
        object,
        stableId: object.id,
      })
    }
  }

  const movementLengthSquared = movement.x * movement.x + movement.y * movement.y
  if (movementLengthSquared > CONTACT_EPSILON) {
    for (const endpoint of [object.start, object.end]) {
      const relative = { x: start.x - endpoint.x, y: start.y - endpoint.y }
      const b = 2 * (relative.x * movement.x + relative.y * movement.y)
      const c = relative.x * relative.x + relative.y * relative.y - radius * radius
      const discriminant = b * b - 4 * movementLengthSquared * c
      if (discriminant < 0) continue
      const toi = (-b - Math.sqrt(discriminant)) / (2 * movementLengthSquared)
      if (toi < -CONTACT_EPSILON || toi > 1 + CONTACT_EPSILON) continue
      const clampedToi = Math.max(0, Math.min(1, toi))
      const position = {
        x: start.x + movement.x * clampedToi,
        y: start.y + movement.y * clampedToi,
      }
      const normalOffset = { x: position.x - endpoint.x, y: position.y - endpoint.y }
      const normalLength = Math.hypot(normalOffset.x, normalOffset.y)
      if (normalLength <= CONTACT_EPSILON) continue
      const normal = { x: normalOffset.x / normalLength, y: normalOffset.y / normalLength }
      if (movement.x * normal.x + movement.y * normal.y >= -CONTACT_EPSILON) continue
      candidates.push({
        kind: 'reflector',
        toi: clampedToi,
        position,
        normal,
        object,
        stableId: object.id,
      })
    }
  }

  return firstProjectileContact(candidates)
}

export function sweepCircleAgainstMapObject(
  start: Vector,
  end: Vector,
  projectileRadius: number,
  object: MapObjectDefinition,
): ProjectileContact | null {
  switch (object.type) {
    case 'reflector-wall':
      return sweepCircleAgainstReflector(start, end, projectileRadius, object)
  }
}
