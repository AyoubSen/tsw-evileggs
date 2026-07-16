import { TerrainMask } from '../terrain/TerrainMask'
import { TERRAIN_MATERIAL } from '../terrain/materials'
import {
  createHeightFieldDocument,
  createShapeMapDocument,
  mapSurfaceY,
  resolveMapDocument,
  type MapTheme,
  type MatchMode,
  type ResolvedMap,
  type SpawnDefinition,
  type TeamId,
} from './mapDocument'

export type MapId =
  | 'rolling-hills'
  | 'twin-peaks'
  | 'broken-crossing'
  | 'crater-basin'
  | 'sunken-garden'
  | 'canopy-rift'
  | 'ruined-foundry'
export const MAP_REGISTRY_VERSION = 'maps-4'
export type MapDefinition = ResolvedMap
export type { MapDocument, MapTheme, MatchMode, SpawnDefinition, TeamId } from './mapDocument'

const CLASSIC_WIDTH = 960
const CLASSIC_HEIGHT = 540
const DEFAULT_THEME: MapTheme = {
  sky: 0x9edce5,
  sun: 0xffedb1,
  backHill: 0x78b996,
  terrain: 0x9a673e,
  surface: 0x437c53,
  dust: 0xa88d69,
  brick: 0xa8543d,
  stone: 0x77736c,
  steel: 0x394c55,
}

const heightMap = (source: {
  id: MapId
  revision?: number
  mode: MatchMode
  displayName: string
  description: string
  label: string
  width: number
  height: number
  spawnXs: readonly number[]
  spawnTeams: readonly TeamId[]
  theme?: MapTheme
  surfaceAt: (x: number) => number
}) =>
  resolveMapDocument(
    createHeightFieldDocument({
      ...source,
      revision: source.revision ?? 1,
      terrainScale: 2,
      theme: source.theme ?? DEFAULT_THEME,
    }),
  )

const maps: Record<MapId, ResolvedMap> = {
  'rolling-hills': heightMap({
    id: 'rolling-hills',
    mode: '1v1',
    displayName: 'Rolling Hills',
    description: 'Broad slopes and forgiving long arcs.',
    label: 'Open lanes',
    width: CLASSIC_WIDTH,
    height: CLASSIC_HEIGHT,
    spawnXs: [175, 785],
    spawnTeams: [0, 1],
    surfaceAt: (x) => 385 + Math.sin(x / 105) * 25 + Math.sin(x / 43) * 10,
  }),
  'twin-peaks': heightMap({
    id: 'twin-peaks',
    mode: '1v1',
    displayName: 'Twin Peaks',
    description: 'High flanks overlook a deep central valley.',
    label: 'High ground',
    width: CLASSIC_WIDTH,
    height: CLASSIC_HEIGHT,
    spawnXs: [160, 800],
    spawnTeams: [0, 1],
    theme: { ...DEFAULT_THEME, terrain: 0x9b7951, surface: 0x557752, dust: 0xc4a273 },
    surfaceAt: (x) =>
      420 -
      90 * Math.exp(-((x - 160) ** 2) / 18000) -
      90 * Math.exp(-((x - 800) ** 2) / 18000) +
      28 * Math.exp(-((x - 480) ** 2) / 40000),
  }),
  'broken-crossing': heightMap({
    id: 'broken-crossing',
    mode: '1v1',
    displayName: 'Broken Crossing',
    description: 'A fractured low crossing rewards careful footing.',
    label: 'Risky footing',
    width: CLASSIC_WIDTH,
    height: CLASSIC_HEIGHT,
    spawnXs: [180, 780],
    spawnTeams: [0, 1],
    theme: { ...DEFAULT_THEME, sky: 0xa8d5d5, backHill: 0x6ca58d },
    surfaceAt: (x) => 390 + Math.sin(x / 75) * 18 + (x > 400 && x < 560 ? 60 : 0),
  }),
  'crater-basin': heightMap({
    id: 'crater-basin',
    mode: '1v1',
    displayName: 'Crater Basin',
    description: 'Uneven ridges surround a close central bowl.',
    label: 'Close quarters',
    width: CLASSIC_WIDTH,
    height: CLASSIC_HEIGHT,
    spawnXs: [275, 685],
    spawnTeams: [0, 1],
    theme: { ...DEFAULT_THEME, sky: 0xe4c6a3, backHill: 0xb78368, dust: 0xb77c5b },
    surfaceAt: (x) => 350 + 80 * Math.exp(-((x - 480) ** 2) / 70000) + Math.sin(x / 48) * 13,
  }),
  'sunken-garden': heightMap({
    id: 'sunken-garden',
    mode: '1v1',
    displayName: 'Sunken Garden',
    description: 'A wide arena of terraces surrounding a weathered central hollow.',
    label: 'Large arena',
    width: 1280,
    height: 720,
    spawnXs: [210, 1070],
    spawnTeams: [0, 1],
    theme: {
      ...DEFAULT_THEME,
      sky: 0x8fcfd3,
      sun: 0xffd879,
      backHill: 0x648f7d,
      terrain: 0x796044,
      surface: 0x6e9a5c,
      dust: 0xb39665,
    },
    surfaceAt: (x) =>
      515 +
      Math.sin(x / 118) * 24 +
      Math.sin(x / 47) * 8 +
      72 * Math.exp(-((x - 640) ** 2) / 68000) -
      38 * Math.exp(-((x - 225) ** 2) / 21000) -
      38 * Math.exp(-((x - 1055) ** 2) / 21000),
  }),
  'canopy-rift': heightMap({
    id: 'canopy-rift',
    mode: '2v2',
    displayName: 'Canopy Rift',
    description: 'Four staggered shelves face across a broad, overgrown divide.',
    label: '2v2 arena',
    width: 1440,
    height: 810,
    spawnXs: [180, 1260, 420, 1020],
    spawnTeams: [0, 1, 0, 1],
    theme: {
      ...DEFAULT_THEME,
      sky: 0x8cc8bd,
      sun: 0xffdf84,
      backHill: 0x416f63,
      terrain: 0x66533d,
      surface: 0x4e8a58,
      dust: 0x9c835f,
    },
    surfaceAt: (x) =>
      584 +
      Math.sin(x / 132) * 21 +
      Math.sin(x / 58) * 9 +
      88 * Math.exp(-((x - 720) ** 2) / 92000) -
      45 * Math.exp(-((x - 190) ** 2) / 18000) -
      32 * Math.exp(-((x - 420) ** 2) / 15000) -
      32 * Math.exp(-((x - 1020) ** 2) / 15000) -
      45 * Math.exp(-((x - 1250) ** 2) / 18000),
  }),
  'ruined-foundry': resolveMapDocument(
    createShapeMapDocument({
      id: 'ruined-foundry',
      revision: 1,
      mode: '2v2',
      displayName: 'Ruined Foundry',
      description: 'Brick workshops, steel frames, interior floors, and a shattered central span.',
      label: 'Multi-level 2v2',
      width: 1440,
      height: 810,
      terrainScale: 2,
      theme: {
        ...DEFAULT_THEME,
        sky: 0xb8c2bd,
        sun: 0xf6c56f,
        backHill: 0x596964,
        terrain: 0x70563e,
        surface: 0x738259,
        dust: 0x9b765a,
        brick: 0xa94f3c,
        stone: 0x74736f,
        steel: 0x344951,
      },
      spawns: [
        { x: 220, y: 320, teamId: 0, teamSlot: 0, facing: 1 },
        { x: 1220, y: 320, teamId: 1, teamSlot: 0, facing: -1 },
        { x: 390, y: 456, teamId: 0, teamSlot: 1, facing: 1 },
        { x: 1050, y: 456, teamId: 1, teamSlot: 1, facing: -1 },
      ],
      rectangles: [
        { x: 0, y: 650, width: 1440, height: 160, material: TERRAIN_MATERIAL.soil },
        { x: 70, y: 620, width: 460, height: 30, material: TERRAIN_MATERIAL.stone },
        { x: 910, y: 620, width: 460, height: 30, material: TERRAIN_MATERIAL.stone },
        { x: 110, y: 320, width: 400, height: 25, material: TERRAIN_MATERIAL.brick },
        { x: 120, y: 345, width: 25, height: 275, material: TERRAIN_MATERIAL.brick },
        { x: 475, y: 345, width: 25, height: 275, material: TERRAIN_MATERIAL.brick },
        { x: 145, y: 456, width: 330, height: 20, material: TERRAIN_MATERIAL.brick },
        { x: 930, y: 320, width: 400, height: 25, material: TERRAIN_MATERIAL.brick },
        { x: 940, y: 345, width: 25, height: 275, material: TERRAIN_MATERIAL.brick },
        { x: 1295, y: 345, width: 25, height: 275, material: TERRAIN_MATERIAL.brick },
        { x: 965, y: 456, width: 330, height: 20, material: TERRAIN_MATERIAL.brick },
        { x: 510, y: 520, width: 150, height: 18, material: TERRAIN_MATERIAL.brick },
        { x: 780, y: 520, width: 150, height: 18, material: TERRAIN_MATERIAL.brick },
        { x: 300, y: 345, width: 14, height: 275, material: TERRAIN_MATERIAL.steel },
        { x: 1126, y: 345, width: 14, height: 275, material: TERRAIN_MATERIAL.steel },
        { x: 545, y: 538, width: 14, height: 112, material: TERRAIN_MATERIAL.steel },
        { x: 880, y: 538, width: 14, height: 112, material: TERRAIN_MATERIAL.steel },
      ],
    }),
  ),
}

export const MAP_ORDER: MapId[] = [
  'rolling-hills',
  'twin-peaks',
  'broken-crossing',
  'crater-basin',
  'sunken-garden',
  'canopy-rift',
  'ruined-foundry',
]
export const MAPS: Record<MapId, MapDefinition> = maps

export const mapIdsForMode = (mode: MatchMode): MapId[] =>
  MAP_ORDER.filter((id) => MAPS[id].mode === mode)

export function defaultMapForMode(mode: MatchMode): MapDefinition {
  const id = mapIdsForMode(mode)[0]
  return id ? MAPS[id] : MAPS['rolling-hills']
}

export function getMap(id: string | undefined): MapDefinition {
  return id && id in MAPS ? MAPS[id as MapId] : MAPS['rolling-hills']
}

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && value in MAPS
}

export function createMapTerrain(map: MapDefinition): TerrainMask {
  return new TerrainMask(
    map.terrainWidth,
    map.terrainHeight,
    map.terrainScale,
    map.terrainCells,
  )
}

export function hasSafeSpawns(map: MapDefinition): boolean {
  const terrain = createMapTerrain(map)
  const expectedPlayers = map.mode === '1v1' ? 2 : map.mode === '2v2' ? 4 : 6
  const teamCounts = [0, 1].map(
    (teamId) => map.spawnPoints.filter((spawn) => spawn.teamId === teamId).length,
  )
  const teamSlotsAreValid = ([0, 1] as const).every((teamId) =>
    map.spawnPoints
      .filter((spawn) => spawn.teamId === teamId)
      .map((spawn) => spawn.teamSlot)
      .sort((left, right) => left - right)
      .every((slot, index) => slot === index),
  )
  return (
    map.spawnPoints.length === expectedPlayers &&
    teamCounts[0] === expectedPlayers / 2 &&
    teamCounts[1] === expectedPlayers / 2 &&
    teamSlotsAreValid &&
    map.spawnPoints.every(
      (spawn) =>
        spawn.x > 20 &&
        spawn.x < map.width - 20 &&
        spawn.y > 30 &&
        spawn.y < map.height &&
        terrain.isSolid(spawn.x, spawn.y) &&
        !terrain.isSolid(spawn.x, spawn.y - 30),
    ) &&
    map.spawnPoints.every((spawn, index) =>
      map.spawnPoints
        .slice(index + 1)
        .every((other) => Math.hypot(other.x - spawn.x, other.y - spawn.y) > 60),
    )
  )
}

export { mapSurfaceY }
