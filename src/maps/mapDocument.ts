import {
  TERRAIN_MATERIAL,
  isTerrainMaterialId,
  type TerrainMaterialId,
} from '../terrain/materials'

export const MAP_FORMAT_VERSION = 1
export type MatchMode = '1v1' | '2v2' | '3v3'
export type TeamId = 0 | 1

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

export type MapDocument = {
  format: 'mossfire-map'
  formatVersion: typeof MAP_FORMAT_VERSION
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

export type ResolvedMap = Omit<MapDocument, 'terrain'> & {
  terrainScale: number
  terrainWidth: number
  terrainHeight: number
  terrainCells: Uint8Array
  spawnPoints: readonly SpawnDefinition[]
}

type HeightFieldSource = Omit<MapDocument, 'format' | 'formatVersion' | 'spawns' | 'terrain'> & {
  terrainScale: number
  spawnXs: readonly number[]
  spawnTeams: readonly TeamId[]
  surfaceAt: (x: number) => number
}

export type MaterialRectangle = {
  x: number
  y: number
  width: number
  height: number
  material: Exclude<TerrainMaterialId, 0>
}

type ShapeMapSource = Omit<MapDocument, 'format' | 'formatVersion' | 'terrain'> & {
  terrainScale: number
  rectangles: readonly MaterialRectangle[]
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

export function resolveMapDocument(document: MapDocument): ResolvedMap {
  if (document.format !== 'mossfire-map' || document.formatVersion !== MAP_FORMAT_VERSION)
    throw new Error('Unsupported map document format.')
  if (!Number.isSafeInteger(document.revision) || document.revision < 1)
    throw new Error('Map revision must be a positive integer.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id) || document.id.length > 64)
    throw new Error('Map ID must be a bounded lowercase slug.')
  if (
    !Number.isSafeInteger(document.width) ||
    !Number.isSafeInteger(document.height) ||
    document.width < 320 ||
    document.height < 180 ||
    document.width > 4096 ||
    document.height > 2304
  )
    throw new Error('Map dimensions are outside the supported range.')
  const themeKeys: Array<keyof MapTheme> = [
    'sky',
    'sun',
    'backHill',
    'terrain',
    'surface',
    'dust',
    'brick',
    'stone',
    'steel',
  ]
  if (
    themeKeys.some((key) => {
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
    for (let index = 0; index < runs.length; index += 2) {
      const material = runs[index]
      const count = runs[index + 1]
      if (!isTerrainMaterialId(material) || !Number.isSafeInteger(count) || count < 1)
        throw new Error(`Map terrain row ${y} contains an invalid material run.`)
      if (x + count > terrainWidth) throw new Error(`Map terrain row ${y} is too wide.`)
      terrainCells.fill(material, y * terrainWidth + x, y * terrainWidth + x + count)
      x += count
    }
    if (x !== terrainWidth) throw new Error(`Map terrain row ${y} is too short.`)
  })
  const expectedPlayers = document.mode === '1v1' ? 2 : document.mode === '2v2' ? 4 : 6
  if (document.spawns.length !== expectedPlayers)
    throw new Error(`Map mode ${document.mode} requires ${expectedPlayers} spawns.`)
  for (const teamId of [0, 1] as const) {
    const teamSpawns = document.spawns
      .filter((spawn) => spawn.teamId === teamId)
      .sort((left, right) => left.teamSlot - right.teamSlot)
    if (
      teamSpawns.length !== expectedPlayers / 2 ||
      teamSpawns.some((spawn, index) => spawn.teamSlot !== index)
    )
      throw new Error(`Map team ${teamId} has invalid spawn slots.`)
  }
  for (const spawn of document.spawns) {
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
  return {
    ...document,
    terrainScale: cellSize,
    terrainWidth,
    terrainHeight,
    terrainCells,
    spawnPoints: document.spawns,
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
    teamId: source.spawnTeams[index],
    teamSlot: Math.floor(index / 2),
    facing: (source.spawnTeams[index] === 0 ? 1 : -1) as -1 | 1,
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
