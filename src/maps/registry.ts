import { TerrainMask } from '../terrain/TerrainMask'
import { TERRAIN_MATERIAL, type TerrainMaterialId } from '../terrain/materials'
import {
  MAP_FORMAT_VERSION,
  createHeightFieldDocument,
  createShapeMapDocument,
  encodeMaterialRows,
  mapSurfaceY,
  playerCountForMode,
  resolveMapDocument,
  spawnSeatForIndex,
  DEFAULT_PROJECTILE_BOUNDARY,
  type MapDocument,
  type MapObjectDefinition,
  type ProjectileBoundary,
  type MapTheme,
  type MatchMode,
  type ResolvedMap,
  type SpawnDefinition,
} from './mapDocument'

export type MapId =
  | 'rolling-hills'
  | 'twin-peaks'
  | 'broken-crossing'
  | 'sunken-garden'
  | 'canopy-rift'
  | 'ruined-foundry'
  | 'switchback-quarry'
  | 'dry-aqueduct'
  | 'triad-reach'
  | 'sundered-crown'
  | 'lantern-vault'
  | 'fossil-wake'
  | 'custom-draft'

export const MAP_REGISTRY_VERSION = 'maps-9'
export type MapDefinition = Omit<ResolvedMap, 'id'> & { id: MapId }
export type { MapDocument, MapTheme, MatchMode, SpawnDefinition, TeamId } from './mapDocument'

const TERRAIN_SCALE = 2
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

type SolidMaterial = Exclude<TerrainMaterialId, 0>
type Point = readonly [x: number, y: number]

type RasterPainter = {
  surface: (surfaceAt: (x: number) => number, material?: SolidMaterial) => void
  rect: (x: number, y: number, width: number, height: number, material: SolidMaterial) => void
  ramp: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number,
    material: SolidMaterial,
  ) => void
  ellipse: (
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    material: SolidMaterial,
  ) => void
  carveRect: (x: number, y: number, width: number, height: number) => void
  carveEllipse: (centerX: number, centerY: number, radiusX: number, radiusY: number) => void
}

type RasterMapSource = Omit<MapDocument, 'format' | 'formatVersion' | 'terrain' | 'objects' | 'projectileBoundary'> & {
  paint: (painter: RasterPainter) => void
  objects?: readonly MapObjectDefinition[]
  projectileBoundary?: ProjectileBoundary
}

const registeredMap = (map: ResolvedMap): MapDefinition => map as MapDefinition
const theme = (overrides: Partial<MapTheme>): MapTheme => ({ ...DEFAULT_THEME, ...overrides })

const canonicalSpawns = (points: readonly Point[]): SpawnDefinition[] =>
  points.map(([x, y], index) => ({ x, y, ...spawnSeatForIndex(index) }))

function createRasterMap(source: RasterMapSource): MapDefinition {
  const terrainWidth = source.width / TERRAIN_SCALE
  const terrainHeight = source.height / TERRAIN_SCALE
  const cells = new Uint8Array(terrainWidth * terrainHeight)
  const bounds = (x: number, y: number, width: number, height: number) => ({
    left: Math.max(0, Math.floor(x / TERRAIN_SCALE)),
    top: Math.max(0, Math.floor(y / TERRAIN_SCALE)),
    right: Math.min(terrainWidth, Math.ceil((x + width) / TERRAIN_SCALE)),
    bottom: Math.min(terrainHeight, Math.ceil((y + height) / TERRAIN_SCALE)),
  })
  const fillRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    material: TerrainMaterialId,
  ) => {
    const { left, top, right, bottom } = bounds(x, y, width, height)
    for (let cellY = top; cellY < bottom; cellY += 1)
      cells.fill(material, cellY * terrainWidth + left, cellY * terrainWidth + right)
  }
  const paintEllipse = (
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    material: TerrainMaterialId,
  ) => {
    const { left, top, right, bottom } = bounds(
      centerX - radiusX,
      centerY - radiusY,
      radiusX * 2,
      radiusY * 2,
    )
    for (let y = top; y < bottom; y += 1) {
      const worldY = (y + 0.5) * TERRAIN_SCALE
      for (let x = left; x < right; x += 1) {
        const worldX = (x + 0.5) * TERRAIN_SCALE
        const dx = (worldX - centerX) / radiusX
        const dy = (worldY - centerY) / radiusY
        if (dx * dx + dy * dy <= 1) cells[y * terrainWidth + x] = material
      }
    }
  }
  const painter: RasterPainter = {
    surface: (surfaceAt, material = TERRAIN_MATERIAL.soil) => {
      for (let x = 0; x < terrainWidth; x += 1) {
        const top = Math.max(
          0,
          Math.min(
            terrainHeight,
            Math.floor(surfaceAt((x + 0.5) * TERRAIN_SCALE) / TERRAIN_SCALE),
          ),
        )
        for (let y = top; y < terrainHeight; y += 1)
          cells[y * terrainWidth + x] = material
      }
    },
    rect: fillRect,
    ramp: (x1, y1, x2, y2, thickness, material) => {
      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const start = Math.max(0, Math.floor(left / TERRAIN_SCALE))
      const end = Math.min(terrainWidth, Math.ceil(right / TERRAIN_SCALE))
      for (let x = start; x < end; x += 1) {
        const worldX = (x + 0.5) * TERRAIN_SCALE
        const t = x2 === x1 ? 0 : (worldX - x1) / (x2 - x1)
        const top = y1 + (y2 - y1) * t
        fillRect(worldX - TERRAIN_SCALE / 2, top, TERRAIN_SCALE, thickness, material)
      }
    },
    ellipse: paintEllipse,
    carveRect: (x, y, width, height) =>
      fillRect(x, y, width, height, TERRAIN_MATERIAL.empty),
    carveEllipse: (centerX, centerY, radiusX, radiusY) =>
      paintEllipse(centerX, centerY, radiusX, radiusY, TERRAIN_MATERIAL.empty),
  }
  source.paint(painter)
  return registeredMap(resolveMapDocument({
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
    objects: source.objects ? [...source.objects] : [],
    projectileBoundary: source.projectileBoundary ?? DEFAULT_PROJECTILE_BOUNDARY,
    terrain: {
      encoding: 'row-rle-v1',
      cellSize: TERRAIN_SCALE,
      rows: encodeMaterialRows(cells, terrainWidth, terrainHeight),
    },
  }))
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
  theme?: MapTheme
  surfaceAt: (x: number) => number
  objects?: readonly MapObjectDefinition[]
}) =>
  registeredMap(resolveMapDocument(
    createHeightFieldDocument({
      ...source,
      revision: source.revision ?? 1,
      terrainScale: TERRAIN_SCALE,
      theme: source.theme ?? DEFAULT_THEME,
    }),
  ))

const maps: Record<MapId, MapDefinition> = {
  'rolling-hills': heightMap({
    id: 'rolling-hills',
    revision: 1,
    mode: '1v1',
    displayName: 'Rolling Hills',
    description: 'Broad slopes and forgiving long arcs.',
    label: 'Open lanes',
    width: CLASSIC_WIDTH,
    height: CLASSIC_HEIGHT,
    spawnXs: [175, 785],
    surfaceAt: (x) => 385 + Math.sin(x / 105) * 25 + Math.sin(x / 43) * 10,
  }),
  'twin-peaks': createRasterMap({
    id: 'twin-peaks',
    revision: 3,
    mode: '1v1',
    displayName: 'Twin Peaks',
    description: 'Reinforced mesas meet at a destructible central saddle.',
    label: 'Twin mesas',
    width: 1280,
    height: 720,
    theme: theme({ terrain: 0x8b6948, surface: 0x667c50, dust: 0xb99a6e }),
    spawns: canonicalSpawns([[230, 280], [1050, 280]]),
    objects: [
      {
        id: 'central-transit-pair',
        type: 'projectile-portal',
        entrance: {
          start: { x: 500, y: 380 },
          end: { x: 610, y: 380 },
          thickness: 12,
        },
        exit: {
          start: { x: 780, y: 270 },
          end: { x: 780, y: 380 },
          thickness: 12,
        },
        velocityRetention: 0.9,
      },
    ],
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 570 - 54 * Math.cos((x - 640) / 205), TERRAIN_MATERIAL.soil)
      ellipse(230, 500, 230, 220, TERRAIN_MATERIAL.soil)
      ellipse(1050, 500, 230, 220, TERRAIN_MATERIAL.soil)
      ellipse(230, 530, 155, 185, TERRAIN_MATERIAL.stone)
      ellipse(1050, 530, 155, 185, TERRAIN_MATERIAL.stone)
      rect(150, 280, 160, 24, TERRAIN_MATERIAL.stone)
      rect(970, 280, 160, 24, TERRAIN_MATERIAL.stone)
      ramp(300, 322, 540, 430, 24, TERRAIN_MATERIAL.brick)
      rect(540, 430, 200, 24, TERRAIN_MATERIAL.brick)
      ramp(740, 430, 980, 322, 24, TERRAIN_MATERIAL.brick)
      ramp(70, 430, 165, 310, 20, TERRAIN_MATERIAL.stone)
      ramp(1115, 310, 1210, 430, 20, TERRAIN_MATERIAL.stone)
    },
  }),
  'broken-crossing': createRasterMap({
    id: 'broken-crossing',
    revision: 2,
    mode: '1v1',
    displayName: 'Broken Crossing',
    description: 'A fractured upper causeway hangs over a dependable lower route.',
    label: 'Two routes',
    width: 1280,
    height: 720,
    theme: theme({ sky: 0xa8d5d5, backHill: 0x6ca58d, brick: 0x9d4f3d }),
    spawns: canonicalSpawns([[190, 300], [1090, 300]]),
    paint: ({ surface, rect, ramp }) => {
      surface((x) => 585 + Math.sin(x / 94) * 12, TERRAIN_MATERIAL.soil)
      ramp(0, 566, 360, 548, 28, TERRAIN_MATERIAL.stone)
      ramp(360, 548, 640, 586, 28, TERRAIN_MATERIAL.soil)
      ramp(640, 586, 920, 548, 28, TERRAIN_MATERIAL.soil)
      ramp(920, 548, 1280, 566, 28, TERRAIN_MATERIAL.stone)
      rect(105, 300, 230, 26, TERRAIN_MATERIAL.brick)
      ramp(335, 300, 470, 330, 24, TERRAIN_MATERIAL.brick)
      rect(500, 346, 150, 24, TERRAIN_MATERIAL.brick)
      rect(688, 346, 92, 24, TERRAIN_MATERIAL.brick)
      ramp(810, 330, 945, 300, 24, TERRAIN_MATERIAL.brick)
      rect(945, 300, 230, 26, TERRAIN_MATERIAL.brick)
      rect(145, 326, 22, 222, TERRAIN_MATERIAL.steel)
      rect(1113, 326, 22, 222, TERRAIN_MATERIAL.steel)
      ramp(285, 326, 400, 500, 18, TERRAIN_MATERIAL.stone)
      ramp(880, 500, 995, 326, 18, TERRAIN_MATERIAL.stone)
    },
  }),
  'sunken-garden': createRasterMap({
    id: 'sunken-garden',
    revision: 2,
    mode: '1v1',
    displayName: 'Sunken Garden',
    description: 'Terraced ramps descend into a sheltered garden floor.',
    label: 'Amphitheater',
    width: 1440,
    height: 810,
    theme: theme({
      sky: 0x8fcfd3,
      sun: 0xffd879,
      backHill: 0x648f7d,
      terrain: 0x796044,
      surface: 0x6e9a5c,
      dust: 0xb39665,
    }),
    spawns: canonicalSpawns([[210, 390], [1230, 390]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1440 - x)
        if (edge < 280) return 390
        if (edge < 500) return 390 + (edge - 280) * 0.82
        if (edge < 620) return 570 + (edge - 500) * 0.58
        return 640
      }, TERRAIN_MATERIAL.soil)
      rect(80, 390, 245, 24, TERRAIN_MATERIAL.stone)
      rect(1115, 390, 245, 24, TERRAIN_MATERIAL.stone)
      ramp(280, 414, 500, 594, 22, TERRAIN_MATERIAL.stone)
      ramp(940, 594, 1160, 414, 22, TERRAIN_MATERIAL.stone)
      rect(500, 570, 130, 22, TERRAIN_MATERIAL.brick)
      rect(810, 570, 130, 22, TERRAIN_MATERIAL.brick)
      ramp(620, 592, 700, 640, 20, TERRAIN_MATERIAL.brick)
      ramp(740, 640, 820, 592, 20, TERRAIN_MATERIAL.brick)
      ellipse(720, 690, 145, 48, TERRAIN_MATERIAL.stone)
      rect(405, 522, 46, 48, TERRAIN_MATERIAL.brick)
      rect(989, 522, 46, 48, TERRAIN_MATERIAL.brick)
      rect(650, 602, 42, 38, TERRAIN_MATERIAL.brick)
      rect(748, 602, 42, 38, TERRAIN_MATERIAL.brick)
    },
  }),
  'canopy-rift': createRasterMap({
    id: 'canopy-rift',
    revision: 2,
    mode: '2v2',
    displayName: 'Canopy Rift',
    description: 'Mirrored root shelves trade exposed crests for protected inner ground.',
    label: 'Root shelves',
    width: 1600,
    height: 900,
    theme: theme({
      sky: 0x8cc8bd,
      sun: 0xffdf84,
      backHill: 0x416f63,
      terrain: 0x66533d,
      surface: 0x4e8a58,
      dust: 0x9c835f,
    }),
    spawns: canonicalSpawns([[210, 390], [1390, 390], [510, 620], [1090, 620]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1600 - x)
        if (edge < 280) return 390
        if (edge < 510) return 390 + (edge - 280)
        if (edge < 720) return 620 + (edge - 510) * 0.66
        return 760
      }, TERRAIN_MATERIAL.soil)
      ellipse(250, 625, 230, 235, TERRAIN_MATERIAL.stone)
      ellipse(1350, 625, 230, 235, TERRAIN_MATERIAL.stone)
      ellipse(430, 780, 260, 150, TERRAIN_MATERIAL.soil)
      ellipse(1170, 780, 260, 150, TERRAIN_MATERIAL.soil)
      rect(145, 390, 140, 24, TERRAIN_MATERIAL.soil)
      rect(1315, 390, 140, 24, TERRAIN_MATERIAL.soil)
      ramp(280, 414, 510, 644, 24, TERRAIN_MATERIAL.stone)
      ramp(1090, 644, 1320, 414, 24, TERRAIN_MATERIAL.stone)
      rect(450, 620, 125, 24, TERRAIN_MATERIAL.brick)
      rect(1025, 620, 125, 24, TERRAIN_MATERIAL.brick)
      ramp(575, 644, 735, 748, 22, TERRAIN_MATERIAL.brick)
      ramp(865, 748, 1025, 644, 22, TERRAIN_MATERIAL.brick)
    },
  }),
  'ruined-foundry': registeredMap(resolveMapDocument(
    createShapeMapDocument({
      id: 'ruined-foundry',
      revision: 2,
      mode: '2v2',
      displayName: 'Ruined Foundry',
      description: 'Brick workshops, steel frames, interior floors, and a shattered central span.',
      label: 'Multi-level 2v2',
      width: 1440,
      height: 810,
      terrainScale: TERRAIN_SCALE,
      theme: theme({
        sky: 0xb8c2bd,
        sun: 0xf6c56f,
        backHill: 0x596964,
        terrain: 0x70563e,
        surface: 0x738259,
        dust: 0x9b765a,
        brick: 0xa94f3c,
        stone: 0x74736f,
        steel: 0x344951,
      }),
      spawns: [
        { x: 220, y: 320, teamId: 0, teamSlot: 0, facing: 1 },
        { x: 1220, y: 320, teamId: 1, teamSlot: 0, facing: -1 },
        { x: 390, y: 456, teamId: 0, teamSlot: 1, facing: 1 },
        { x: 1050, y: 456, teamId: 1, teamSlot: 1, facing: -1 },
      ],
      objects: [
        {
          id: 'central-left-plate',
          type: 'reflector-wall',
          start: { x: 630, y: 472 },
          end: { x: 690, y: 400 },
          thickness: 14,
          velocityRetention: 0.82,
        },
        {
          id: 'central-right-plate',
          type: 'reflector-wall',
          start: { x: 750, y: 400 },
          end: { x: 810, y: 472 },
          thickness: 14,
          velocityRetention: 0.82,
        },
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
  )),
  'switchback-quarry': createRasterMap({
    id: 'switchback-quarry',
    revision: 1,
    mode: '2v2',
    displayName: 'Switchback Quarry',
    description: 'Open quarry benches switch back around a permanent central outcrop.',
    label: 'Stepped quarry',
    width: 1600,
    height: 900,
    theme: theme({
      sky: 0xd5c3a0,
      sun: 0xffdc8b,
      backHill: 0x9b8065,
      terrain: 0x8a684b,
      surface: 0x98825c,
      dust: 0xb99369,
    }),
    spawns: canonicalSpawns([[180, 380], [1420, 380], [590, 650], [1010, 650]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1600 - x)
        if (edge < 260) return 380
        if (edge < 400) return 460
        if (edge < 560) return 650
        if (edge < 700) return 735
        return 775
      }, TERRAIN_MATERIAL.soil)
      rect(70, 380, 220, 24, TERRAIN_MATERIAL.stone)
      rect(1310, 380, 220, 24, TERRAIN_MATERIAL.stone)
      ramp(260, 404, 400, 460, 24, TERRAIN_MATERIAL.brick)
      ramp(1200, 460, 1340, 404, 24, TERRAIN_MATERIAL.brick)
      rect(350, 460, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1070, 460, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(400, 484, 560, 650, 24, TERRAIN_MATERIAL.stone)
      ramp(1040, 650, 1200, 484, 24, TERRAIN_MATERIAL.stone)
      rect(470, 650, 180, 24, TERRAIN_MATERIAL.soil)
      rect(950, 650, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(620, 674, 730, 735, 22, TERRAIN_MATERIAL.brick)
      ramp(870, 735, 980, 674, 22, TERRAIN_MATERIAL.brick)
      ellipse(800, 700, 138, 196, TERRAIN_MATERIAL.stone)
      rect(735, 510, 130, 24, TERRAIN_MATERIAL.steel)
      ellipse(800, 650, 65, 42, TERRAIN_MATERIAL.soil)
    },
  }),
  'dry-aqueduct': createRasterMap({
    id: 'dry-aqueduct',
    revision: 1,
    mode: '2v2',
    displayName: 'Dry Aqueduct',
    description: 'Broken upper decks cross stone arches above a continuous dry channel.',
    label: 'Aqueduct lanes',
    width: 1536,
    height: 864,
    theme: theme({
      sky: 0xd8c7a4,
      sun: 0xffe2a0,
      backHill: 0x9d8b72,
      terrain: 0x927052,
      surface: 0xb09562,
      dust: 0xc19c72,
      brick: 0xa65b42,
    }),
    spawns: canonicalSpawns([[220, 390], [1316, 390], [560, 710], [976, 710]]),
    paint: ({ surface, rect, ramp, ellipse, carveRect, carveEllipse }) => {
      surface((x) => 710 + 15 * Math.cos((x - 768) / 150), TERRAIN_MATERIAL.soil)
      rect(0, 710, 1536, 30, TERRAIN_MATERIAL.soil)
      rect(120, 390, 250, 26, TERRAIN_MATERIAL.brick)
      rect(1166, 390, 250, 26, TERRAIN_MATERIAL.brick)
      rect(402, 420, 230, 24, TERRAIN_MATERIAL.brick)
      rect(904, 420, 230, 24, TERRAIN_MATERIAL.brick)
      rect(666, 455, 84, 22, TERRAIN_MATERIAL.brick)
      rect(786, 455, 84, 22, TERRAIN_MATERIAL.brick)
      ramp(300, 416, 500, 686, 22, TERRAIN_MATERIAL.stone)
      ramp(1036, 686, 1236, 416, 22, TERRAIN_MATERIAL.stone)
      rect(174, 416, 28, 294, TERRAIN_MATERIAL.stone)
      rect(1334, 416, 28, 294, TERRAIN_MATERIAL.stone)
      rect(484, 444, 26, 266, TERRAIN_MATERIAL.stone)
      rect(1026, 444, 26, 266, TERRAIN_MATERIAL.stone)
      ellipse(768, 610, 170, 155, TERRAIN_MATERIAL.stone)
      carveEllipse(768, 650, 105, 95)
      carveRect(590, 620, 85, 80)
      carveRect(861, 620, 85, 80)
      rect(650, 700, 236, 18, TERRAIN_MATERIAL.steel)
    },
  }),
  'triad-reach': createRasterMap({
    id: 'triad-reach',
    revision: 2,
    mode: '3v3',
    displayName: 'Triad Reach',
    description: 'Three open ridge ranges descend toward broad central shelves.',
    label: 'Three ranges',
    width: 1920,
    height: 1080,
    theme: theme({
      sky: 0x91c8d6,
      sun: 0xffd98a,
      backHill: 0x587f79,
      terrain: 0x765b43,
      surface: 0x5f8e5d,
      dust: 0xad8b66,
    }),
    spawns: canonicalSpawns([
      [180, 470],
      [1740, 470],
      [480, 600],
      [1440, 600],
      [720, 740],
      [1200, 740],
    ]),
    paint: ({ surface, rect, ramp }) => {
      surface((x) => {
        const edge = Math.min(x, 1920 - x)
        if (edge < 260) return 470
        if (edge < 480) return 470 + (edge - 260) * 0.59
        if (edge < 720) return 600 + (edge - 480) * 0.58
        if (edge < 900) return 740 + (edge - 720) * 0.32
        return 798
      }, TERRAIN_MATERIAL.soil)
      rect(80, 470, 210, 22, TERRAIN_MATERIAL.soil)
      rect(1630, 470, 210, 22, TERRAIN_MATERIAL.soil)
      ramp(250, 495, 480, 625, 20, TERRAIN_MATERIAL.stone)
      ramp(1440, 625, 1670, 495, 20, TERRAIN_MATERIAL.stone)
      rect(410, 600, 150, 22, TERRAIN_MATERIAL.brick)
      rect(1360, 600, 150, 22, TERRAIN_MATERIAL.brick)
      ramp(520, 625, 720, 765, 20, TERRAIN_MATERIAL.stone)
      ramp(1200, 765, 1400, 625, 20, TERRAIN_MATERIAL.stone)
      rect(650, 740, 150, 22, TERRAIN_MATERIAL.soil)
      rect(1120, 740, 150, 22, TERRAIN_MATERIAL.soil)
      ramp(790, 765, 930, 798, 18, TERRAIN_MATERIAL.brick)
      ramp(990, 798, 1130, 765, 18, TERRAIN_MATERIAL.brick)
      ramp(0, 515, 480, 645, 18, TERRAIN_MATERIAL.stone)
      ramp(480, 645, 960, 828, 18, TERRAIN_MATERIAL.stone)
      ramp(960, 828, 1440, 645, 18, TERRAIN_MATERIAL.stone)
      ramp(1440, 645, 1920, 515, 18, TERRAIN_MATERIAL.stone)
    },
  }),
  'sundered-crown': createRasterMap({
    id: 'sundered-crown',
    revision: 1,
    mode: '3v3',
    displayName: 'Sundered Crown',
    description: 'A broken crown joins upper lanes above a permanent lower passage.',
    label: 'Crown routes',
    width: 1920,
    height: 1080,
    theme: theme({
      sky: 0xb8a9c1,
      sun: 0xffd69a,
      backHill: 0x70667e,
      terrain: 0x765747,
      surface: 0x77724f,
      dust: 0xaa846a,
      stone: 0x686570,
    }),
    spawns: canonicalSpawns([
      [180, 760],
      [1740, 760],
      [520, 500],
      [1400, 500],
      [720, 828],
      [1200, 828],
    ]),
    paint: ({ surface, rect, ramp, ellipse, carveRect, carveEllipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1920 - x)
        if (edge < 260) return 760
        if (edge < 600) return 760 + (edge - 260) * 0.2
        return 828
      }, TERRAIN_MATERIAL.soil)
      rect(60, 760, 250, 24, TERRAIN_MATERIAL.stone)
      rect(1610, 760, 250, 24, TERRAIN_MATERIAL.stone)
      ramp(280, 760, 500, 524, 24, TERRAIN_MATERIAL.brick)
      ramp(1420, 524, 1640, 760, 24, TERRAIN_MATERIAL.brick)
      rect(450, 500, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1290, 500, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(620, 524, 820, 410, 22, TERRAIN_MATERIAL.stone)
      ramp(1100, 410, 1300, 524, 22, TERRAIN_MATERIAL.stone)
      ellipse(960, 650, 220, 292, TERRAIN_MATERIAL.stone)
      rect(850, 370, 220, 26, TERRAIN_MATERIAL.steel)
      ramp(800, 420, 920, 370, 22, TERRAIN_MATERIAL.brick)
      ramp(1000, 370, 1120, 420, 22, TERRAIN_MATERIAL.brick)
      carveEllipse(960, 795, 145, 100)
      carveRect(730, 730, 105, 98)
      carveRect(1085, 730, 105, 98)
      rect(805, 828, 310, 22, TERRAIN_MATERIAL.steel)
      rect(660, 700, 125, 24, TERRAIN_MATERIAL.soil)
      rect(1135, 700, 125, 24, TERRAIN_MATERIAL.soil)
    },
  }),
  'lantern-vault': createRasterMap({
    id: 'lantern-vault',
    revision: 1,
    mode: '3v3',
    displayName: 'Lantern Vault',
    description: 'Cavern galleries climb through three broad ceiling shafts.',
    label: 'Cavern galleries',
    width: 1920,
    height: 1080,
    theme: theme({
      sky: 0x253844,
      sun: 0xf6b95b,
      backHill: 0x334f55,
      terrain: 0x51463d,
      surface: 0x6b7352,
      dust: 0x8f765c,
      brick: 0x9a5c42,
      stone: 0x5e625f,
      steel: 0x33464d,
    }),
    spawns: canonicalSpawns([
      [180, 880],
      [1740, 880],
      [460, 650],
      [1460, 650],
      [720, 400],
      [1200, 400],
    ]),
    paint: ({ surface, rect, ramp, ellipse, carveEllipse }) => {
      surface(() => 880, TERRAIN_MATERIAL.stone)
      rect(0, 0, 1920, 180, TERRAIN_MATERIAL.stone)
      ellipse(270, 160, 290, 120, TERRAIN_MATERIAL.stone)
      ellipse(960, 150, 350, 135, TERRAIN_MATERIAL.stone)
      ellipse(1650, 160, 290, 120, TERRAIN_MATERIAL.stone)
      carveEllipse(400, 115, 105, 150)
      carveEllipse(960, 105, 130, 165)
      carveEllipse(1520, 115, 105, 150)
      rect(70, 880, 250, 26, TERRAIN_MATERIAL.soil)
      rect(1600, 880, 250, 26, TERRAIN_MATERIAL.soil)
      ramp(260, 880, 500, 650, 26, TERRAIN_MATERIAL.stone)
      ramp(1420, 650, 1660, 880, 26, TERRAIN_MATERIAL.stone)
      rect(390, 650, 220, 26, TERRAIN_MATERIAL.brick)
      rect(1310, 650, 220, 26, TERRAIN_MATERIAL.brick)
      ramp(540, 650, 760, 400, 26, TERRAIN_MATERIAL.brick)
      ramp(1160, 400, 1380, 650, 26, TERRAIN_MATERIAL.brick)
      rect(650, 400, 220, 26, TERRAIN_MATERIAL.stone)
      rect(1050, 400, 220, 26, TERRAIN_MATERIAL.stone)
      ramp(840, 426, 940, 520, 22, TERRAIN_MATERIAL.steel)
      ramp(980, 520, 1080, 426, 22, TERRAIN_MATERIAL.steel)
      rect(870, 520, 180, 24, TERRAIN_MATERIAL.brick)
      rect(610, 690, 110, 22, TERRAIN_MATERIAL.brick)
      rect(1200, 690, 110, 22, TERRAIN_MATERIAL.brick)
    },
  }),
  'fossil-wake': createRasterMap({
    id: 'fossil-wake',
    revision: 1,
    mode: '3v3',
    displayName: 'Fossil Wake',
    description: 'Permanent fossil ribs rise through a destructible basin and broken scaffolds.',
    label: 'Ribbed basin',
    width: 2048,
    height: 1152,
    theme: theme({
      sky: 0xc9d5c0,
      sun: 0xffdfa0,
      backHill: 0x81917c,
      terrain: 0x8b694e,
      surface: 0x8b8d62,
      dust: 0xb49a78,
      brick: 0x9b624b,
      stone: 0x77766d,
    }),
    spawns: canonicalSpawns([
      [180, 920],
      [1868, 920],
      [560, 690],
      [1488, 690],
      [820, 500],
      [1228, 500],
    ]),
    paint: ({ surface, rect, ramp, ellipse, carveEllipse }) => {
      surface((x) => 950 + 30 * Math.cos((x - 1024) / 250), TERRAIN_MATERIAL.soil)
      rect(70, 920, 240, 24, TERRAIN_MATERIAL.soil)
      rect(1738, 920, 240, 24, TERRAIN_MATERIAL.soil)
      ramp(260, 920, 600, 690, 28, TERRAIN_MATERIAL.stone)
      ramp(1448, 690, 1788, 920, 28, TERRAIN_MATERIAL.stone)
      rect(490, 690, 220, 26, TERRAIN_MATERIAL.brick)
      rect(1338, 690, 220, 26, TERRAIN_MATERIAL.brick)
      ramp(650, 690, 860, 500, 28, TERRAIN_MATERIAL.stone)
      ramp(1188, 500, 1398, 690, 28, TERRAIN_MATERIAL.stone)
      rect(750, 500, 220, 26, TERRAIN_MATERIAL.brick)
      rect(1078, 500, 220, 26, TERRAIN_MATERIAL.brick)
      ellipse(1024, 830, 400, 235, TERRAIN_MATERIAL.stone)
      carveEllipse(1024, 830, 335, 178)
      ramp(625, 840, 860, 620, 22, TERRAIN_MATERIAL.stone)
      ramp(860, 620, 1024, 560, 22, TERRAIN_MATERIAL.stone)
      ramp(1024, 560, 1188, 620, 22, TERRAIN_MATERIAL.stone)
      ramp(1188, 620, 1423, 840, 22, TERRAIN_MATERIAL.stone)
      rect(365, 790, 105, 22, TERRAIN_MATERIAL.brick)
      rect(500, 750, 80, 22, TERRAIN_MATERIAL.brick)
      rect(1468, 750, 80, 22, TERRAIN_MATERIAL.brick)
      rect(1578, 790, 105, 22, TERRAIN_MATERIAL.brick)
      rect(920, 650, 86, 20, TERRAIN_MATERIAL.brick)
      rect(1042, 650, 86, 20, TERRAIN_MATERIAL.brick)
    },
  }),
  'custom-draft': registeredMap(resolveMapDocument(
    createShapeMapDocument({
      id: 'custom-draft',
      revision: 1,
      mode: '1v1',
      displayName: 'Custom Draft',
      description: 'Session-only map editor draft.',
      label: 'Editor draft',
      width: 960,
      height: 540,
      terrainScale: TERRAIN_SCALE,
      theme: DEFAULT_THEME,
      spawns: [
        { x: 180, y: 380, teamId: 0, teamSlot: 0, facing: 1 },
        { x: 780, y: 380, teamId: 1, teamSlot: 0, facing: -1 },
      ],
      rectangles: [
        { x: 0, y: 380, width: 960, height: 160, material: TERRAIN_MATERIAL.soil },
      ],
    }),
  )),
}

export const MAP_ORDER: MapId[] = [
  'rolling-hills',
  'twin-peaks',
  'broken-crossing',
  'sunken-garden',
  'canopy-rift',
  'ruined-foundry',
  'switchback-quarry',
  'dry-aqueduct',
  'triad-reach',
  'sundered-crown',
  'lantern-vault',
  'fossil-wake',
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

export function setCustomDraftMap(document: MapDocument): MapDefinition {
  if (document.mode !== '1v1' && document.mode !== '2v2' && document.mode !== '3v3')
    throw new Error('The editor supports only 1v1, 2v2, and 3v3 maps.')
  const map = registeredMap(resolveMapDocument({ ...document, id: 'custom-draft' }))
  maps['custom-draft'] = map
  return map
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
  const expectedPlayers = playerCountForMode(map.mode)
  const seatsAreCanonical = map.spawnPoints.every((spawn, index) => {
    const seat = spawnSeatForIndex(index)
    return (
      spawn.teamId === seat.teamId &&
      spawn.teamSlot === seat.teamSlot &&
      spawn.facing === seat.facing
    )
  })
  return (
    map.spawnPoints.length === expectedPlayers &&
    seatsAreCanonical &&
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
