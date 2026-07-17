import type {
  MapObjectDefinition,
  ProjectilePortalDefinition,
  ReflectorWallDefinition,
} from '../../maps/mapDocument'
import type { Vector } from '../../shared/types'

type ContactBase = {
  toi: number
  position: Vector
  normal: Vector
}

export type ProjectileBoundaryEdge = 'left' | 'right' | 'top' | 'bottom'

export type ProjectileContact =
  | (ContactBase & { kind: 'boundary'; edge: ProjectileBoundaryEdge; stableId: string })
  | (ContactBase & { kind: 'player'; playerId: string; stableId: string })
  | (ContactBase & { kind: 'terrain'; stableId: string })
  | (ContactBase & {
      kind: 'reflector'
      object: ReflectorWallDefinition
      stableId: string
    })
  | (ContactBase & {
      kind: 'portal'
      object: ProjectilePortalDefinition
      aperture: 'entrance' | 'exit'
      stableId: string
    })

const CONTACT_PRIORITY: Record<ProjectileContact['kind'], number> = {
  boundary: 0,
  player: 1,
  reflector: 2,
  portal: 3,
  terrain: 4,
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

export function sweepCircleAgainstBounds(
  start: Vector,
  end: Vector,
  radius: number,
  width: number,
  height: number,
): ProjectileContact | null {
  const movement = { x: end.x - start.x, y: end.y - start.y }
  const candidates: ProjectileContact[] = []
  const add = (
    edge: ProjectileBoundaryEdge,
    coordinate: number,
    startCoordinate: number,
    movementCoordinate: number,
    normal: Vector,
  ) => {
    if (movementCoordinate * (normal.x || normal.y) >= -CONTACT_EPSILON) return
    const toi = (coordinate - startCoordinate) / movementCoordinate
    if (toi < -CONTACT_EPSILON || toi > 1 + CONTACT_EPSILON) return
    const clampedToi = Math.max(0, Math.min(1, toi))
    candidates.push({
      kind: 'boundary',
      edge,
      stableId: `boundary:${edge}`,
      toi: clampedToi,
      position: {
        x: start.x + movement.x * clampedToi,
        y: start.y + movement.y * clampedToi,
      },
      normal,
    })
  }
  if (movement.x < -CONTACT_EPSILON) add('left', radius, start.x, movement.x, { x: 1, y: 0 })
  if (movement.x > CONTACT_EPSILON)
    add('right', width - radius, start.x, movement.x, { x: -1, y: 0 })
  if (movement.y < -CONTACT_EPSILON) add('top', radius, start.y, movement.y, { x: 0, y: 1 })
  if (movement.y > CONTACT_EPSILON)
    add('bottom', height - radius, start.y, movement.y, { x: 0, y: -1 })
  return firstProjectileContact(candidates)
}

type CapsuleContact = ContactBase

export function sweepCircleAgainstCapsule(
  start: Vector,
  end: Vector,
  projectileRadius: number,
  segmentStart: Vector,
  segmentEnd: Vector,
  thickness: number,
): CapsuleContact | null {
  const segment = { x: segmentEnd.x - segmentStart.x, y: segmentEnd.y - segmentStart.y }
  const segmentLength = Math.hypot(segment.x, segment.y)
  if (segmentLength <= Number.EPSILON) return null
  const tangent = { x: segment.x / segmentLength, y: segment.y / segmentLength }
  const surfaceNormal = { x: -tangent.y, y: tangent.x }
  const movement = { x: end.x - start.x, y: end.y - start.y }
  const radius = projectileRadius + thickness / 2
  const candidates: CapsuleContact[] = []

  const signedStart =
    (start.x - segmentStart.x) * surfaceNormal.x +
    (start.y - segmentStart.y) * surfaceNormal.y
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
        (position.x - segmentStart.x) * tangent.x +
        (position.y - segmentStart.y) * tangent.y
      if (projection < -CONTACT_EPSILON || projection > segmentLength + CONTACT_EPSILON) continue
      candidates.push({
        toi: clampedToi,
        position,
        normal,
      })
    }
  }

  const movementLengthSquared = movement.x * movement.x + movement.y * movement.y
  if (movementLengthSquared > CONTACT_EPSILON) {
    for (const endpoint of [segmentStart, segmentEnd]) {
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
        toi: clampedToi,
        position,
        normal,
      })
    }
  }

  let first: CapsuleContact | null = null
  for (const candidate of candidates)
    if (!first || candidate.toi < first.toi - CONTACT_EPSILON) first = candidate
  return first
}

export function sweepCircleAgainstReflector(
  start: Vector,
  end: Vector,
  projectileRadius: number,
  object: ReflectorWallDefinition,
): ProjectileContact | null {
  const contact = sweepCircleAgainstCapsule(
    start,
    end,
    projectileRadius,
    object.start,
    object.end,
    object.thickness,
  )
  return contact ? { ...contact, kind: 'reflector', object, stableId: object.id } : null
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
    case 'projectile-portal': {
      const contacts = (['entrance', 'exit'] as const).map((aperture) => {
        const segment = object[aperture]
        const contact = sweepCircleAgainstCapsule(
          start,
          end,
          projectileRadius,
          segment.start,
          segment.end,
          segment.thickness,
        )
        return contact
          ? {
              ...contact,
              kind: 'portal' as const,
              object,
              aperture,
              stableId: `${object.id}:${aperture}`,
            }
          : null
      })
      return firstProjectileContact(contacts)
    }
  }
}
