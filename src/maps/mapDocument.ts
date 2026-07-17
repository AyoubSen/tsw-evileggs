import {
  TERRAIN_MATERIAL,
  isTerrainMaterialId,
  type TerrainMaterialId,
} from '../terrain/materials'
import type { Vector } from '../shared/types'

export const MAP_FORMAT_VERSION = 2
export const MAX_MAP_OBJECTS = 32
export const MIN_REFLECTOR_LENGTH = 16
export const MAX_REFLECTOR_LENGTH = 1024
export const MIN_REFLECTOR_THICKNESS = 4
export const MAX_REFLECTOR_THICKNESS = 48
export const MIN_REFLECTOR_VELOCITY_RETENTION = 0.1
export const MAX_REFLECTOR_VELOCITY_RETENTION = 1
export const MAX_REFLECTOR_TOTAL_LENGTH = 8192
export const SPAWN_OBJECT_CLEARANCE = 40
export type MatchMode = '1v1' | '2v2' | '3v3'
export type TeamId = 0 | 1
export const PLAYER_COUNT_BY_MODE: Record<MatchMode, number> = { '1v1': 2, '2v2': 4, '3v3': 6 }

export type SpawnDefinition = {
  x: number
  y: number
  teamId: TeamId
  teamSlot: number
  facing: -1 | 1
}

export type MapTheme = {
  sky: number
  sun: number
  backHill: number
  terrain: number
  surface: number
  dust: number
  brick: number
  stone: number
  steel: number
}

export type ReflectorWallDefinition = {
  id: string
  type: 'reflector-wall'
  start: Vector
  end: Vector
  thickness: number
  velocityRetention: number
}

export type MapObjectDefinition = ReflectorWallDefinition

type MapDocumentBase = {
  format: 'mossfire-map'
  id: string
  revision: number
  mode: MatchMode
  displayName: string
  description: string
  label: string
  width: number
  height: number
  theme: MapTheme
  spawns: SpawnDefinition[]
  terrain: {
    encoding: 'row-rle-v1'
    cellSize: number
    rows: number[][]
  }
}

export type MapDocumentV1 = MapDocumentBase & { formatVersion: 1 }
export type MapDocument = MapDocumentBase & {
  formatVersion: typeof MAP_FORMAT_VERSION
  objects: MapObjectDefinition[]
}

export type ResolvedMap = Omit<MapDocument, 'terrain'> & {
  terrainScale: number
  terrainWidth: number
  terrainHeight: number
  terrainCells: Uint8Array
  spawnPoints: readonly SpawnDefinition[]
  contentHash: string
}

type HeightFieldSource = Omit<
  MapDocument,
  'format' | 'formatVersion' | 'spawns' | 'terrain' | 'objects'
> & {
  terrainScale: number
  spawnXs: readonly number[]
  surfaceAt: (x: number) => number
  objects?: readonly MapObjectDefinition[]
}

export type MaterialRectangle = {
  x: number
  y: number
  width: number
  height: number
  material: Exclude<TerrainMaterialId, 0>
}

export function playerCountForMode(mode: unknown): number {
  if (mode !== '1v1' && mode !== '2v2' && mode !== '3v3')
    throw new Error(`Unsupported map mode: ${String(mode)}.`)
  return PLAYER_COUNT_BY_MODE[mode]
}

export function spawnSeatForIndex(index: number): Pick<SpawnDefinition, 'teamId' | 'teamSlot' | 'facing'> {
  const teamId = (index % 2) as TeamId
  return {
    teamId,
    teamSlot: Math.floor(index / 2),
    facing: teamId === 0 ? 1 : -1,
  }
}

type ShapeMapSource = Omit<MapDocument, 'format' | 'formatVersion' | 'terrain' | 'objects'> & {
  terrainScale: number
  rectangles: readonly MaterialRectangle[]
  objects?: readonly MapObjectDefinition[]
}

const DOCUMENT_KEYS_V1 = [
  'format',
  'formatVersion',
  'id',
  'revision',
  'mode',
  'displayName',
  'description',
  'label',
  'width',
  'height',
  'theme',
  'spawns',
  'terrain',
] as const
const DOCUMENT_KEYS_V2 = [...DOCUMENT_KEYS_V1, 'objects'] as const
const THEME_KEYS = [
  'sky',
  'sun',
  'backHill',
  'terrain',
  'surface',
  'dust',
  'brick',
  'stone',
  'steel',
] as const
const SPAWN_KEYS = ['x', 'y', 'teamId', 'teamSlot', 'facing'] as const
const TERRAIN_KEYS = ['encoding', 'cellSize', 'rows'] as const
const REFLECTOR_KEYS = [
  'id',
  'type',
  'start',
  'end',
  'thickness',
  'velocityRetention',
] as const
const VECTOR_KEYS = ['x', 'y'] as const

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys)
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value)))
    throw new Error(`${label} contains unsupported or missing fields.`)
}

function cloneVector(value: unknown, label: string): Vector {
  const source = record(value, label)
  exactKeys(source, VECTOR_KEYS, label)
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y))
    throw new Error(`${label} must contain finite coordinates.`)
  return { x: source.x as number, y: source.y as number }
}

function cloneObject(value: unknown): MapObjectDefinition {
  const source = record(value, 'Map object')
  if (source.type !== 'reflector-wall')
    throw new Error(`Unsupported map object type: ${String(source.type)}.`)
  exactKeys(source, REFLECTOR_KEYS, 'Reflector wall')
  return {
    id: source.id as string,
    type: 'reflector-wall',
    start: cloneVector(source.start, 'Reflector start'),
    end: cloneVector(source.end, 'Reflector end'),
    thickness: source.thickness as number,
    velocityRetention: source.velocityRetention as number,
  }
}

function compareObjectIds(left: MapObjectDefinition, right: MapObjectDefinition): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function migrateMapDocument(value: unknown): MapDocument {
  const source = record(value, 'Map document')
  const version = source.formatVersion
  if (source.format !== 'mossfire-map' || (version !== 1 && version !== MAP_FORMAT_VERSION))
    throw new Error('Unsupported map document format.')
  exactKeys(source, version === 1 ? DOCUMENT_KEYS_V1 : DOCUMENT_KEYS_V2, 'Map document')

  const theme = record(source.theme, 'Map theme')
  exactKeys(theme, THEME_KEYS, 'Map theme')
  const terrain = record(source.terrain, 'Map terrain')
  exactKeys(terrain, TERRAIN_KEYS, 'Map terrain')
  if (!Array.isArray(source.spawns) || !Array.isArray(terrain.rows))
    throw new Error('Map spawns and terrain rows must be arrays.')

  const spawns = source.spawns.map((value, index) => {
    const spawn = record(value, `Map spawn ${index}`)
    exactKeys(spawn, SPAWN_KEYS, `Map spawn ${index}`)
    return { ...spawn } as SpawnDefinition
  })
  const objects = (version === 1 ? [] : source.objects)
  if (!Array.isArray(objects)) throw new Error('Map objects must be an array.')

  return {
    format: 'mossfire-map',
    formatVersion: MAP_FORMAT_VERSION,
    id: source.id as string,
    revision: source.revision as number,
    mode: source.mode as MatchMode,
    displayName: source.displayName as string,
    description: source.description as string,
    label: source.label as string,
    width: source.width as number,
    height: source.height as number,
    theme: { ...theme } as MapTheme,
    spawns,
    terrain: {
      encoding: terrain.encoding as 'row-rle-v1',
      cellSize: terrain.cellSize as number,
      rows: terrain.rows.map((row) => (Array.isArray(row) ? [...row] : row)) as number[][],
    },
    objects: objects.map(cloneObject).sort(compareObjectIds),
  }
}

function pointSegmentDistance(point: Vector, start: Vector, end: Vector): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`
}

export function mapContentHash(document: MapDocument): string {
  let hash = 0xcbf29ce484222325n
  const input = canonical(document)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function encodeMaterialRows(cells: Uint8Array, width: number, height: number): number[][] {
  const rows: number[][] = []
  for (let y = 0; y < height; y += 1) {
    const runs: number[] = []
    let material = cells[y * width] ?? TERRAIN_MATERIAL.empty
    let count = 1
    for (let x = 1; x < width; x += 1) {
      const next = cells[y * width + x]
      if (next === material) count += 1
      else {
        runs.push(material, count)
        material = next
        count = 1
      }
    }
    runs.push(material, count)
    rows.push(runs)
  }
  return rows
}

export function resolveMapDocument(value: unknown): ResolvedMap {
  const document = migrateMapDocument(value)
  if (!Number.isSafeInteger(document.revision) || document.revision < 1)
    throw new Error('Map revision must be a positive integer.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id) || document.id.length > 64)
    throw new Error('Map ID must be a bounded lowercase slug.')
  if (
    typeof document.displayName !== 'string' ||
    document.displayName.length < 1 ||
    document.displayName.length > 64 ||
    typeof document.description !== 'string' ||
    document.description.length > 240 ||
    typeof document.label !== 'string' ||
    document.label.length < 1 ||
    document.label.length > 64
  )
    throw new Error('Map presentation metadata is invalid.')
  if (
    !Number.isSafeInteger(document.width) ||
    !Number.isSafeInteger(document.height) ||
    document.width < 320 ||
    document.height < 180 ||
    document.width > 4096 ||
    document.height > 2304
  )
    throw new Error('Map dimensions are outside the supported range.')
  if (
    THEME_KEYS.some((key) => {
      const color = document.theme[key]
      return !Number.isSafeInteger(color) || color < 0 || color > 0xffffff
    })
  )
    throw new Error('Map theme contains an invalid color.')
  const { cellSize, rows } = document.terrain
  if (
    document.terrain.encoding !== 'row-rle-v1' ||
    !Number.isSafeInteger(cellSize) ||
    cellSize < 1 ||
    document.width % cellSize !== 0 ||
    document.height % cellSize !== 0
  )
    throw new Error('Map dimensions must align to the terrain cell size.')
  const terrainWidth = document.width / cellSize
  const terrainHeight = document.height / cellSize
  if (terrainWidth * terrainHeight > 2_500_000)
    throw new Error('Map terrain exceeds the supported cell budget.')
  if (rows.length !== terrainHeight) throw new Error('Map terrain row count is invalid.')
  const terrainCells = new Uint8Array(terrainWidth * terrainHeight)
  rows.forEach((runs, y) => {
    if (runs.length === 0 || runs.length % 2 !== 0)
      throw new Error(`Map terrain row ${y} has invalid runs.`)
    let x = 0
    let previousMaterial: number | null = null
    for (let index = 0; index < runs.length; index += 2) {
      const material = runs[index]
      const count = runs[index + 1]
      if (!isTerrainMaterialId(material) || !Number.isSafeInteger(count) || count < 1)
        throw new Error(`Map terrain row ${y} contains an invalid material run.`)
      if (material === previousMaterial)
        throw new Error(`Map terrain row ${y} must use canonical material runs.`)
      if (x + count > terrainWidth) throw new Error(`Map terrain row ${y} is too wide.`)
      terrainCells.fill(material, y * terrainWidth + x, y * terrainWidth + x + count)
      x += count
      previousMaterial = material
    }
    if (x !== terrainWidth) throw new Error(`Map terrain row ${y} is too short.`)
  })
  const expectedPlayers = playerCountForMode(document.mode)
  if (document.spawns.length !== expectedPlayers)
    throw new Error(`Map mode ${document.mode} requires ${expectedPlayers} spawns.`)
  for (const [index, spawn] of document.spawns.entries()) {
    const seat = spawnSeatForIndex(index)
    if (spawn.teamId !== seat.teamId || spawn.teamSlot !== seat.teamSlot)
      throw new Error('Map spawns must use canonical seat order A1, B1, A2, B2, A3, B3.')
    if (
      !Number.isFinite(spawn.x) ||
      !Number.isFinite(spawn.y) ||
      spawn.x <= 20 ||
      spawn.x >= document.width - 20 ||
      spawn.y <= 30 ||
      spawn.y >= document.height ||
      ![-1, 1].includes(spawn.facing)
    )
      throw new Error('Map contains an out-of-bounds spawn.')
    const cellX = Math.floor(spawn.x / cellSize)
    const supportY = Math.floor(spawn.y / cellSize)
    const headY = Math.floor((spawn.y - 30) / cellSize)
    if (
      terrainCells[supportY * terrainWidth + cellX] === TERRAIN_MATERIAL.empty ||
      terrainCells[headY * terrainWidth + cellX] !== TERRAIN_MATERIAL.empty
    )
      throw new Error('Map spawn does not have safe support and headroom.')
  }
  if (
    document.spawns.some((spawn, index) =>
      document.spawns
        .slice(index + 1)
        .some((other) => Math.hypot(other.x - spawn.x, other.y - spawn.y) <= 60),
    )
  )
    throw new Error('Map spawns are too close together.')
  if (document.objects.length > MAX_MAP_OBJECTS)
    throw new Error(`Maps support at most ${MAX_MAP_OBJECTS} objects.`)
  const objectIds = new Set<string>()
  let totalReflectorLength = 0
  for (const object of document.objects) {
    if (
      typeof object.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(object.id) ||
      object.id.length > 64
    )
      throw new Error('Map object ID must be a bounded lowercase slug.')
    if (objectIds.has(object.id)) throw new Error(`Duplicate map object ID: ${object.id}.`)
    objectIds.add(object.id)
    const length = Math.hypot(object.end.x - object.start.x, object.end.y - object.start.y)
    if (!Number.isFinite(length) || length < MIN_REFLECTOR_LENGTH || length > MAX_REFLECTOR_LENGTH)
      throw new Error(`Reflector ${object.id} has an invalid length.`)
    if (
      !Number.isFinite(object.thickness) ||
      object.thickness < MIN_REFLECTOR_THICKNESS ||
      object.thickness > MAX_REFLECTOR_THICKNESS
    )
      throw new Error(`Reflector ${object.id} has an invalid thickness.`)
    if (
      !Number.isFinite(object.velocityRetention) ||
      object.velocityRetention < MIN_REFLECTOR_VELOCITY_RETENTION ||
      object.velocityRetention > MAX_REFLECTOR_VELOCITY_RETENTION
    )
      throw new Error(`Reflector ${object.id} has invalid velocity retention.`)
    const margin = object.thickness / 2
    if (
      [object.start, object.end].some(
        (point) =>
          point.x < margin ||
          point.x > document.width - margin ||
          point.y < margin ||
          point.y > document.height - margin,
      )
    )
      throw new Error(`Reflector ${object.id} is outside the map bounds.`)
    if (
      document.spawns.some(
        (spawn) =>
          pointSegmentDistance({ x: spawn.x, y: spawn.y - 15 }, object.start, object.end) <=
          SPAWN_OBJECT_CLEARANCE + margin,
      )
    )
      throw new Error(`Reflector ${object.id} overlaps a spawn safety volume.`)
    totalReflectorLength += length
  }
  if (totalReflectorLength > MAX_REFLECTOR_TOTAL_LENGTH)
    throw new Error('Map objects exceed the supported total complexity.')
  return {
    ...document,
    terrainScale: cellSize,
    terrainWidth,
    terrainHeight,
    terrainCells,
    spawnPoints: document.spawns,
    contentHash: mapContentHash(document),
  }
}

export function createHeightFieldDocument(source: HeightFieldSource): MapDocument {
  const terrainWidth = source.width / source.terrainScale
  const terrainHeight = source.height / source.terrainScale
  const cells = new Uint8Array(terrainWidth * terrainHeight)
  for (let x = 0; x < terrainWidth; x += 1) {
    const yStart = Math.max(
      0,
      Math.floor(source.surfaceAt(x * source.terrainScale) / source.terrainScale),
    )
    for (let y = yStart; y < terrainHeight; y += 1)
      cells[y * terrainWidth + x] = TERRAIN_MATERIAL.soil
  }
  const spawns = source.spawnXs.map((x, index) => ({
    x,
    y: materialSurfaceY(cells, terrainWidth, terrainHeight, source.terrainScale, x, 0) ?? source.height,
    ...spawnSeatForIndex(index),
  }))
  return {
    format: 'mossfire-map',
    formatVersion: MAP_FORMAT_VERSION,
    id: source.id,
    revision: source.revision,
    mode: source.mode,
    displayName: source.displayName,
    description: source.description,
    label: source.label,
    width: source.width,
    height: source.height,
    theme: source.theme,
    spawns,
    objects: source.objects ? source.objects.map(cloneObject).sort(compareObjectIds) : [],
    terrain: {
      encoding: 'row-rle-v1',
      cellSize: source.terrainScale,
      rows: encodeMaterialRows(cells, terrainWidth, terrainHeight),
    },
  }
}

export function createShapeMapDocument(source: ShapeMapSource): MapDocument {
  const terrainWidth = source.width / source.terrainScale
  const terrainHeight = source.height / source.terrainScale
  const cells = new Uint8Array(terrainWidth * terrainHeight)
  for (const rectangle of source.rectangles) {
    const left = Math.max(0, Math.floor(rectangle.x / source.terrainScale))
    const top = Math.max(0, Math.floor(rectangle.y / source.terrainScale))
    const right = Math.min(
      terrainWidth,
      Math.ceil((rectangle.x + rectangle.width) / source.terrainScale),
    )
    const bottom = Math.min(
      terrainHeight,
      Math.ceil((rectangle.y + rectangle.height) / source.terrainScale),
    )
    for (let y = top; y < bottom; y += 1)
      cells.fill(rectangle.material, y * terrainWidth + left, y * terrainWidth + right)
  }
  return {
    format: 'mossfire-map',
    formatVersion: MAP_FORMAT_VERSION,
    id: source.id,
    revision: source.revision,
    mode: source.mode,
    displayName: source.displayName,
    description: source.description,
    label: source.label,
    width: source.width,
    height: source.height,
    theme: source.theme,
    spawns: source.spawns,
    objects: source.objects ? source.objects.map(cloneObject).sort(compareObjectIds) : [],
    terrain: {
      encoding: 'row-rle-v1',
      cellSize: source.terrainScale,
      rows: encodeMaterialRows(cells, terrainWidth, terrainHeight),
    },
  }
}

export function materialSurfaceY(
  cells: Uint8Array,
  width: number,
  height: number,
  scale: number,
  worldX: number,
  fromWorldY = 0,
): number | null {
  const x = Math.floor(worldX / scale)
  if (x < 0 || x >= width) return null
  for (let y = Math.max(0, Math.floor(fromWorldY / scale)); y < height; y += 1)
    if (cells[y * width + x] !== TERRAIN_MATERIAL.empty) return y * scale
  return null
}

export function mapSurfaceY(map: ResolvedMap, worldX: number, fromWorldY = 0): number | null {
  return materialSurfaceY(
    map.terrainCells,
    map.terrainWidth,
    map.terrainHeight,
    map.terrainScale,
    worldX,
    fromWorldY,
  )
}
