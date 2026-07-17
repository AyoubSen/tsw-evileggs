import { TERRAIN_MATERIAL } from '../terrain/materials'
import { playerCountForMode, spawnSeatForIndex, type ResolvedMap } from './mapDocument'

export type MapAssessmentIssueCode =
  | 'canonical-seat'
  | 'spawn-pair-asymmetry'
  | 'spawn-clearance'
  | 'spawn-support-mismatch'
  | 'spawn-spacing'
  | 'mode-scale'

export type MapAssessmentIssue = {
  code: MapAssessmentIssueCode
  message: string
  seatIndices?: readonly number[]
}

export type MapAssessment = {
  valid: boolean
  issues: readonly MapAssessmentIssue[]
  metrics: {
    widthPerPlayer: number
    areaPerPlayer: number
    minimumSpawnDistance: number
    maximumMirroredSpawnOffset: number
  }
}

const MINIMUM_WIDTH_PER_PLAYER = 280
const MINIMUM_SPAWN_DISTANCE = 60
const CHARACTER_RADIUS = 14
const CHARACTER_HEIGHT = 30

function materialAt(map: ResolvedMap, x: number, y: number): number {
  const cellX = Math.floor(x / map.terrainScale)
  const cellY = Math.floor(y / map.terrainScale)
  if (cellX < 0 || cellY < 0 || cellX >= map.terrainWidth || cellY >= map.terrainHeight)
    return TERRAIN_MATERIAL.empty
  return map.terrainCells[cellY * map.terrainWidth + cellX]
}

export function assessOfficialMap(map: ResolvedMap): MapAssessment {
  const issues: MapAssessmentIssue[] = []
  const expectedPlayers = playerCountForMode(map.mode)
  let minimumSpawnDistance = Number.POSITIVE_INFINITY
  let maximumMirroredSpawnOffset = 0

  map.spawnPoints.forEach((spawn, index) => {
    const seat = spawnSeatForIndex(index)
    if (
      spawn.teamId !== seat.teamId ||
      spawn.teamSlot !== seat.teamSlot ||
      spawn.facing !== seat.facing
    )
      issues.push({ code: 'canonical-seat', message: `Seat ${index + 1} is not canonical.`, seatIndices: [index] })

    const sampleXs = [spawn.x - CHARACTER_RADIUS * 0.5, spawn.x, spawn.x + CHARACTER_RADIUS * 0.5]
    const supportedSamples = sampleXs.filter(
      (x) => materialAt(map, x, spawn.y) !== TERRAIN_MATERIAL.empty,
    ).length
    const supported =
      materialAt(map, spawn.x, spawn.y) !== TERRAIN_MATERIAL.empty && supportedSamples >= 2
    const clear = sampleXs.every(
      (x) =>
        materialAt(map, x, spawn.y - CHARACTER_RADIUS) === TERRAIN_MATERIAL.empty &&
        materialAt(map, x, spawn.y - CHARACTER_HEIGHT) === TERRAIN_MATERIAL.empty,
    )
    if (!supported || !clear)
      issues.push({
        code: 'spawn-clearance',
        message: `Seat ${index + 1} lacks stable support or body clearance.`,
        seatIndices: [index],
      })

    for (let otherIndex = index + 1; otherIndex < map.spawnPoints.length; otherIndex += 1) {
      const other = map.spawnPoints[otherIndex]
      minimumSpawnDistance = Math.min(
        minimumSpawnDistance,
        Math.hypot(other.x - spawn.x, other.y - spawn.y),
      )
    }
  })

  for (let index = 0; index + 1 < map.spawnPoints.length; index += 2) {
    const left = map.spawnPoints[index]
    const right = map.spawnPoints[index + 1]
    const offset = Math.max(Math.abs(left.x + right.x - map.width), Math.abs(left.y - right.y))
    maximumMirroredSpawnOffset = Math.max(maximumMirroredSpawnOffset, offset)
    if (offset > map.terrainScale)
      issues.push({
        code: 'spawn-pair-asymmetry',
        message: `Seats ${index + 1} and ${index + 2} are not mirrored.`,
        seatIndices: [index, index + 1],
      })
    if (materialAt(map, left.x, left.y) !== materialAt(map, right.x, right.y))
      issues.push({
        code: 'spawn-support-mismatch',
        message: `Seats ${index + 1} and ${index + 2} use different support materials.`,
        seatIndices: [index, index + 1],
      })
  }

  if (map.spawnPoints.length !== expectedPlayers)
    issues.push({ code: 'canonical-seat', message: `${map.mode} requires ${expectedPlayers} seats.` })
  if (minimumSpawnDistance <= MINIMUM_SPAWN_DISTANCE)
    issues.push({ code: 'spawn-spacing', message: 'Initial player spacing is too small.' })
  if (map.width / expectedPlayers < MINIMUM_WIDTH_PER_PLAYER)
    issues.push({ code: 'mode-scale', message: `${map.mode} is too narrow for its player count.` })

  return {
    valid: issues.length === 0,
    issues,
    metrics: {
      widthPerPlayer: map.width / expectedPlayers,
      areaPerPlayer: (map.width * map.height) / expectedPlayers,
      minimumSpawnDistance: Number.isFinite(minimumSpawnDistance) ? minimumSpawnDistance : 0,
      maximumMirroredSpawnOffset,
    },
  }
}
