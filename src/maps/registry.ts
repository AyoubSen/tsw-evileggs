import { GAME_HEIGHT, GAME_WIDTH } from '../shared/constants'
import { TerrainMask } from '../terrain/TerrainMask'

export type MapId = 'rolling-hills' | 'twin-peaks' | 'broken-crossing' | 'crater-basin'
export const MAP_REGISTRY_VERSION = 'maps-1'
export type MapDefinition = {
  id: MapId
  displayName: string
  description: string
  spawnPoints: readonly [number, number]
  surfaceAt: (x: number) => number
}

export const MAP_ORDER: MapId[] = ['rolling-hills', 'twin-peaks', 'broken-crossing', 'crater-basin']
export const MAPS: Record<MapId, MapDefinition> = {
  'rolling-hills': {
    id: 'rolling-hills',
    displayName: 'Rolling Hills',
    description: 'Broad slopes and forgiving long arcs.',
    spawnPoints: [175, 785],
    surfaceAt: (x) => 385 + Math.sin(x / 105) * 25 + Math.sin(x / 43) * 10,
  },
  'twin-peaks': {
    id: 'twin-peaks',
    displayName: 'Twin Peaks',
    description: 'High flanks overlook a deep central valley.',
    spawnPoints: [160, 800],
    surfaceAt: (x) =>
      420 -
      90 * Math.exp(-((x - 160) ** 2) / 18000) -
      90 * Math.exp(-((x - 800) ** 2) / 18000) +
      28 * Math.exp(-((x - 480) ** 2) / 40000),
  },
  'broken-crossing': {
    id: 'broken-crossing',
    displayName: 'Broken Crossing',
    description: 'A fractured low crossing rewards careful footing.',
    spawnPoints: [180, 780],
    surfaceAt: (x) => 390 + Math.sin(x / 75) * 18 + (x > 400 && x < 560 ? 60 : 0),
  },
  'crater-basin': {
    id: 'crater-basin',
    displayName: 'Crater Basin',
    description: 'Uneven ridges surround a close central bowl.',
    spawnPoints: [275, 685],
    surfaceAt: (x) => 350 + 80 * Math.exp(-((x - 480) ** 2) / 70000) + Math.sin(x / 48) * 13,
  },
}

export function getMap(id: string | undefined): MapDefinition {
  return id && id in MAPS ? MAPS[id as MapId] : MAPS['rolling-hills']
}

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && value in MAPS
}

export function createMapTerrain(map: MapDefinition, scale = 2): TerrainMask {
  const terrain = new TerrainMask(GAME_WIDTH / scale, GAME_HEIGHT / scale, scale)
  terrain.fillBelow(map.surfaceAt)
  return terrain
}

export function hasSafeSpawns(map: MapDefinition): boolean {
  const terrain = createMapTerrain(map)
  const [left, right] = map.spawnPoints
  return (
    [left, right].every((x) => x > 20 && x < GAME_WIDTH - 20 && terrain.surfaceY(x) !== null) &&
    Math.abs(right - left) > 60 &&
    GAME_HEIGHT > 0
  )
}
