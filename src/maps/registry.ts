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
  | 'glasshouse-divide'
  | 'iron-trestle'
  | 'echo-caldera'
  | 'salt-flats'
  | 'split-orchard'
  | 'tideworks'
  | 'ember-steps'
  | 'open-skyline'
  | 'delta-spires'
  | 'custom-draft'

export const MAP_REGISTRY_VERSION = 'maps-12'
export type MapDefinition = Omit<ResolvedMap, 'id'> & { id: MapId }
export type { MapDocument, MapTheme, MatchMode, SpawnDefinition, TeamId } from './mapDocument'

const TERRAIN_SCALE = 2
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
    revision: 2,
    mode: '1v1',
    displayName: 'Rolling Hills',
    description: 'Broad slopes and forgiving long arcs.',
    label: 'Open lanes',
    width: 1120,
    height: CLASSIC_HEIGHT,
    spawnXs: [190, 930],
    surfaceAt: (x) => {
      if (Math.abs(x - 190) < 65 || Math.abs(x - 930) < 65) return 382
      const centerRidge = 52 * Math.exp(-(((x - 560) / 82) ** 2))
      const sideValleys = 24 * Math.exp(-(((x - 350) / 78) ** 2)) + 24 * Math.exp(-(((x - 770) / 78) ** 2))
      return 392 - centerRidge + sideValleys + Math.sin(x / 150) * 8
    },
  }),
  'twin-peaks': createRasterMap({
    id: 'twin-peaks',
    revision: 4,
    mode: '1v1',
    displayName: 'Twin Peaks',
    description: 'Reinforced mesas meet at a destructible central saddle.',
    label: 'Twin mesas',
    width: 1280,
    height: 720,
    theme: theme({ terrain: 0x8b6948, surface: 0x667c50, dust: 0xb99a6e }),
    spawns: canonicalSpawns([[230, 330], [1050, 330]]),
    paint: ({ surface, rect, ramp, ellipse, carveRect }) => {
      surface((x) => 590 - 30 * Math.cos((x - 640) / 220), TERRAIN_MATERIAL.soil)
      ellipse(230, 535, 180, 190, TERRAIN_MATERIAL.soil)
      ellipse(1050, 535, 180, 190, TERRAIN_MATERIAL.soil)
      ellipse(230, 575, 108, 125, TERRAIN_MATERIAL.stone)
      ellipse(1050, 575, 108, 125, TERRAIN_MATERIAL.stone)
      rect(165, 330, 130, 22, TERRAIN_MATERIAL.soil)
      rect(985, 330, 130, 22, TERRAIN_MATERIAL.soil)
      ramp(295, 370, 500, 470, 22, TERRAIN_MATERIAL.brick)
      rect(500, 470, 280, 22, TERRAIN_MATERIAL.brick)
      ramp(780, 470, 985, 370, 22, TERRAIN_MATERIAL.brick)
      carveRect(570, 490, 140, 120)
    },
  }),
  'broken-crossing': createRasterMap({
    id: 'broken-crossing',
    revision: 3,
    mode: '1v1',
    displayName: 'Broken Crossing',
    description: 'A fractured upper causeway hangs over a dependable lower route.',
    label: 'Two routes',
    width: 1280,
    height: 720,
    theme: theme({ sky: 0xa8d5d5, backHill: 0x6ca58d, brick: 0x9d4f3d }),
    spawns: canonicalSpawns([[220, 326], [1060, 326]]),
    paint: ({ surface, rect, ramp }) => {
      surface((x) => 585 + Math.sin(x / 94) * 12, TERRAIN_MATERIAL.soil)
      ramp(0, 566, 360, 548, 28, TERRAIN_MATERIAL.stone)
      ramp(360, 548, 640, 586, 28, TERRAIN_MATERIAL.soil)
      ramp(640, 586, 920, 548, 28, TERRAIN_MATERIAL.soil)
      ramp(920, 548, 1280, 566, 28, TERRAIN_MATERIAL.stone)
      rect(130, 326, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(310, 326, 455, 355, 22, TERRAIN_MATERIAL.brick)
      rect(500, 370, 120, 22, TERRAIN_MATERIAL.brick)
      rect(660, 370, 120, 22, TERRAIN_MATERIAL.brick)
      ramp(825, 355, 970, 326, 22, TERRAIN_MATERIAL.brick)
      rect(970, 326, 180, 24, TERRAIN_MATERIAL.brick)
      rect(260, 440, 18, 108, TERRAIN_MATERIAL.steel)
      rect(1002, 440, 18, 108, TERRAIN_MATERIAL.steel)
      ramp(300, 500, 405, 390, 18, TERRAIN_MATERIAL.brick)
      ramp(875, 390, 980, 500, 18, TERRAIN_MATERIAL.brick)
    },
  }),
  'sunken-garden': createRasterMap({
    id: 'sunken-garden',
    revision: 3,
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
    spawns: canonicalSpawns([[250, 440], [1190, 440]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1440 - x)
        if (edge < 320) return 440
        if (edge < 560) return 440 + (edge - 320) * 0.58
        return 580
      }, TERRAIN_MATERIAL.soil)
      rect(160, 440, 180, 22, TERRAIN_MATERIAL.soil)
      rect(1100, 440, 180, 22, TERRAIN_MATERIAL.soil)
      ramp(320, 462, 560, 602, 22, TERRAIN_MATERIAL.brick)
      ramp(880, 602, 1120, 462, 22, TERRAIN_MATERIAL.brick)
      rect(500, 550, 110, 20, TERRAIN_MATERIAL.brick)
      rect(830, 550, 110, 20, TERRAIN_MATERIAL.brick)
      ellipse(650, 600, 58, 28, TERRAIN_MATERIAL.soil)
      ellipse(790, 600, 58, 28, TERRAIN_MATERIAL.soil)
      rect(400, 548, 64, 32, TERRAIN_MATERIAL.brick)
      rect(976, 548, 64, 32, TERRAIN_MATERIAL.brick)
    },
  }),
  'canopy-rift': createRasterMap({
    id: 'canopy-rift',
    revision: 3,
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
    spawns: canonicalSpawns([[210, 390], [1390, 390], [540, 620], [1060, 620]]),
    paint: ({ surface, rect, ramp, ellipse, carveEllipse }) => {
      surface((x) => {
        const edge = Math.min(x, 1600 - x)
        if (edge < 280) return 390
        if (edge < 510) return 390 + (edge - 280)
        if (edge < 720) return 620 + (edge - 510) * 0.66
        return 760
      }, TERRAIN_MATERIAL.soil)
      ellipse(250, 625, 175, 185, TERRAIN_MATERIAL.stone)
      ellipse(1350, 625, 175, 185, TERRAIN_MATERIAL.stone)
      ellipse(430, 780, 260, 150, TERRAIN_MATERIAL.soil)
      ellipse(1170, 780, 260, 150, TERRAIN_MATERIAL.soil)
      rect(145, 390, 140, 24, TERRAIN_MATERIAL.soil)
      rect(1315, 390, 140, 24, TERRAIN_MATERIAL.soil)
      ramp(280, 414, 510, 644, 24, TERRAIN_MATERIAL.brick)
      ramp(1090, 644, 1320, 414, 24, TERRAIN_MATERIAL.brick)
      rect(455, 620, 170, 24, TERRAIN_MATERIAL.brick)
      rect(975, 620, 170, 24, TERRAIN_MATERIAL.brick)
      ramp(625, 644, 735, 748, 22, TERRAIN_MATERIAL.brick)
      ramp(865, 748, 975, 644, 22, TERRAIN_MATERIAL.brick)
      rect(690, 690, 80, 20, TERRAIN_MATERIAL.soil)
      rect(830, 690, 80, 20, TERRAIN_MATERIAL.soil)
      carveEllipse(350, 520, 58, 70)
      carveEllipse(1250, 520, 58, 70)
    },
  }),
  'ruined-foundry': registeredMap(resolveMapDocument(
    createShapeMapDocument({
      id: 'ruined-foundry',
      revision: 3,
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
        { x: 430, y: 476, teamId: 0, teamSlot: 1, facing: 1 },
        { x: 1010, y: 476, teamId: 1, teamSlot: 1, facing: -1 },
      ],
      objects: [
        {
          id: 'central-left-plate',
          type: 'reflector-wall',
          start: { x: 610, y: 500 },
          end: { x: 670, y: 430 },
          thickness: 14,
          velocityRetention: 0.82,
        },
        {
          id: 'central-right-plate',
          type: 'reflector-wall',
          start: { x: 770, y: 430 },
          end: { x: 830, y: 500 },
          thickness: 14,
          velocityRetention: 0.82,
        },
      ],
      rectangles: [
        { x: 0, y: 650, width: 1440, height: 160, material: TERRAIN_MATERIAL.soil },
        { x: 70, y: 620, width: 460, height: 30, material: TERRAIN_MATERIAL.stone },
        { x: 910, y: 620, width: 460, height: 30, material: TERRAIN_MATERIAL.stone },
        { x: 130, y: 320, width: 180, height: 24, material: TERRAIN_MATERIAL.brick },
        { x: 1130, y: 320, width: 180, height: 24, material: TERRAIN_MATERIAL.brick },
        { x: 335, y: 476, width: 190, height: 22, material: TERRAIN_MATERIAL.brick },
        { x: 915, y: 476, width: 190, height: 22, material: TERRAIN_MATERIAL.brick },
        { x: 120, y: 344, width: 20, height: 276, material: TERRAIN_MATERIAL.brick },
        { x: 1300, y: 344, width: 20, height: 276, material: TERRAIN_MATERIAL.brick },
        { x: 540, y: 540, width: 100, height: 18, material: TERRAIN_MATERIAL.brick },
        { x: 800, y: 540, width: 100, height: 18, material: TERRAIN_MATERIAL.brick },
      ],
    }),
  )),
  'switchback-quarry': createRasterMap({
    id: 'switchback-quarry',
    revision: 2,
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
    paint: ({ surface, rect, ramp, ellipse, carveRect }) => {
      surface((x) => {
        const edge = Math.min(x, 1600 - x)
        if (edge < 260) return 380
        if (edge < 440) return 380 + (edge - 260) * 0.44
        if (edge < 560) return 460 + (edge - 440) * 1.58
        if (edge < 680) return 650
        if (edge < 700) return 650 + (edge - 680) * 4.25
        return 775
      }, TERRAIN_MATERIAL.soil)
      rect(70, 380, 220, 24, TERRAIN_MATERIAL.stone)
      rect(1310, 380, 220, 24, TERRAIN_MATERIAL.stone)
      ramp(260, 404, 400, 460, 24, TERRAIN_MATERIAL.brick)
      ramp(1200, 460, 1340, 404, 24, TERRAIN_MATERIAL.brick)
      rect(350, 460, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1070, 460, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(400, 484, 560, 650, 24, TERRAIN_MATERIAL.brick)
      ramp(1040, 650, 1200, 484, 24, TERRAIN_MATERIAL.brick)
      rect(500, 650, 180, 24, TERRAIN_MATERIAL.soil)
      rect(920, 650, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(620, 674, 730, 735, 22, TERRAIN_MATERIAL.brick)
      ramp(870, 735, 980, 674, 22, TERRAIN_MATERIAL.brick)
      ellipse(800, 720, 95, 135, TERRAIN_MATERIAL.stone)
      rect(750, 585, 100, 20, TERRAIN_MATERIAL.brick)
      carveRect(750, 660, 100, 120)
    },
  }),
  'dry-aqueduct': createRasterMap({
    id: 'dry-aqueduct',
    revision: 2,
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
    spawns: canonicalSpawns([[250, 390], [1286, 390], [570, 650], [966, 650]]),
    paint: ({ surface, rect, ramp, ellipse, carveRect, carveEllipse }) => {
      surface((x) => 710 + 15 * Math.cos((x - 768) / 150), TERRAIN_MATERIAL.soil)
      rect(0, 650, 1536, 90, TERRAIN_MATERIAL.soil)
      rect(160, 390, 180, 26, TERRAIN_MATERIAL.brick)
      rect(1196, 390, 180, 26, TERRAIN_MATERIAL.brick)
      rect(402, 420, 230, 24, TERRAIN_MATERIAL.brick)
      rect(904, 420, 230, 24, TERRAIN_MATERIAL.brick)
      rect(666, 455, 84, 22, TERRAIN_MATERIAL.brick)
      rect(786, 455, 84, 22, TERRAIN_MATERIAL.brick)
      ramp(300, 416, 500, 626, 22, TERRAIN_MATERIAL.brick)
      ramp(1036, 626, 1236, 416, 22, TERRAIN_MATERIAL.brick)
      rect(174, 500, 28, 150, TERRAIN_MATERIAL.stone)
      rect(1334, 500, 28, 150, TERRAIN_MATERIAL.stone)
      rect(484, 500, 26, 150, TERRAIN_MATERIAL.stone)
      rect(1026, 500, 26, 150, TERRAIN_MATERIAL.stone)
      ellipse(768, 565, 150, 125, TERRAIN_MATERIAL.stone)
      carveEllipse(768, 590, 115, 90)
      carveRect(570, 500, 120, 150)
      carveRect(846, 500, 120, 150)
      carveRect(718, 500, 100, 150)
      rect(650, 650, 70, 18, TERRAIN_MATERIAL.stone)
      rect(816, 650, 70, 18, TERRAIN_MATERIAL.stone)
    },
  }),
  'triad-reach': createRasterMap({
    id: 'triad-reach',
    revision: 3,
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
      ramp(250, 495, 480, 625, 20, TERRAIN_MATERIAL.brick)
      ramp(1440, 625, 1670, 495, 20, TERRAIN_MATERIAL.brick)
      rect(410, 600, 150, 22, TERRAIN_MATERIAL.brick)
      rect(1360, 600, 150, 22, TERRAIN_MATERIAL.brick)
      ramp(520, 625, 720, 765, 20, TERRAIN_MATERIAL.brick)
      ramp(1200, 765, 1400, 625, 20, TERRAIN_MATERIAL.brick)
      rect(650, 740, 150, 22, TERRAIN_MATERIAL.soil)
      rect(1120, 740, 150, 22, TERRAIN_MATERIAL.soil)
      ramp(790, 765, 930, 798, 18, TERRAIN_MATERIAL.brick)
      ramp(990, 798, 1130, 765, 18, TERRAIN_MATERIAL.brick)
      rect(145, 492, 70, 18, TERRAIN_MATERIAL.stone)
      rect(445, 622, 70, 18, TERRAIN_MATERIAL.stone)
      rect(685, 762, 70, 18, TERRAIN_MATERIAL.stone)
      rect(1165, 762, 70, 18, TERRAIN_MATERIAL.stone)
      rect(1405, 622, 70, 18, TERRAIN_MATERIAL.stone)
      rect(1705, 492, 70, 18, TERRAIN_MATERIAL.stone)
      rect(850, 770, 70, 28, TERRAIN_MATERIAL.soil)
      rect(1000, 770, 70, 28, TERRAIN_MATERIAL.soil)
    },
  }),
  'sundered-crown': createRasterMap({
    id: 'sundered-crown',
    revision: 2,
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
    spawns: canonicalSpawns([[180, 760], [1740, 760], [500, 520], [1420, 520], [670, 800], [1250, 800]]),
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
      rect(420, 520, 160, 24, TERRAIN_MATERIAL.brick)
      rect(1340, 520, 160, 24, TERRAIN_MATERIAL.brick)
      ramp(580, 544, 800, 440, 22, TERRAIN_MATERIAL.brick)
      ramp(1120, 440, 1340, 544, 22, TERRAIN_MATERIAL.brick)
      ellipse(960, 665, 180, 230, TERRAIN_MATERIAL.stone)
      rect(820, 425, 80, 24, TERRAIN_MATERIAL.brick)
      rect(1020, 425, 80, 24, TERRAIN_MATERIAL.brick)
      carveEllipse(960, 770, 165, 130)
      carveRect(680, 690, 140, 140)
      carveRect(1100, 690, 140, 140)
      rect(810, 830, 50, 18, TERRAIN_MATERIAL.stone)
      rect(1060, 830, 50, 18, TERRAIN_MATERIAL.stone)
      rect(600, 800, 140, 22, TERRAIN_MATERIAL.soil)
      rect(1180, 800, 140, 22, TERRAIN_MATERIAL.soil)
    },
  }),
  'lantern-vault': createRasterMap({
    id: 'lantern-vault',
    revision: 2,
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
      [680, 420],
      [1240, 420],
    ]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface(() => 880, TERRAIN_MATERIAL.soil)
      ellipse(180, 25, 180, 80, TERRAIN_MATERIAL.stone)
      ellipse(960, 20, 210, 70, TERRAIN_MATERIAL.stone)
      ellipse(1740, 25, 180, 80, TERRAIN_MATERIAL.stone)
      rect(70, 880, 250, 26, TERRAIN_MATERIAL.soil)
      rect(1600, 880, 250, 26, TERRAIN_MATERIAL.soil)
      ramp(260, 880, 500, 650, 26, TERRAIN_MATERIAL.brick)
      ramp(1420, 650, 1660, 880, 26, TERRAIN_MATERIAL.brick)
      rect(390, 650, 220, 26, TERRAIN_MATERIAL.brick)
      rect(1310, 650, 220, 26, TERRAIN_MATERIAL.brick)
      ramp(540, 650, 760, 400, 26, TERRAIN_MATERIAL.brick)
      ramp(1160, 400, 1380, 650, 26, TERRAIN_MATERIAL.brick)
      rect(600, 420, 160, 26, TERRAIN_MATERIAL.brick)
      rect(1160, 420, 160, 26, TERRAIN_MATERIAL.brick)
      ramp(760, 446, 900, 550, 22, TERRAIN_MATERIAL.brick)
      ramp(1020, 550, 1160, 446, 22, TERRAIN_MATERIAL.brick)
      rect(900, 550, 40, 22, TERRAIN_MATERIAL.brick)
      rect(980, 550, 40, 22, TERRAIN_MATERIAL.brick)
      rect(610, 690, 110, 22, TERRAIN_MATERIAL.brick)
      rect(1200, 690, 110, 22, TERRAIN_MATERIAL.brick)
    },
  }),
  'fossil-wake': createRasterMap({
    id: 'fossil-wake',
    revision: 2,
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
      [520, 700],
      [1528, 700],
      [790, 540],
      [1258, 540],
    ]),
    paint: ({ surface, rect, ramp, ellipse, carveEllipse, carveRect }) => {
      surface((x) => 950 + 30 * Math.cos((x - 1024) / 250), TERRAIN_MATERIAL.soil)
      rect(70, 920, 240, 24, TERRAIN_MATERIAL.soil)
      rect(1738, 920, 240, 24, TERRAIN_MATERIAL.soil)
      ramp(260, 920, 600, 690, 28, TERRAIN_MATERIAL.stone)
      ramp(1448, 690, 1788, 920, 28, TERRAIN_MATERIAL.stone)
      rect(435, 700, 170, 26, TERRAIN_MATERIAL.brick)
      rect(1443, 700, 170, 26, TERRAIN_MATERIAL.brick)
      ramp(605, 700, 830, 540, 26, TERRAIN_MATERIAL.brick)
      ramp(1218, 540, 1443, 700, 26, TERRAIN_MATERIAL.brick)
      rect(710, 540, 160, 26, TERRAIN_MATERIAL.brick)
      rect(1178, 540, 160, 26, TERRAIN_MATERIAL.brick)
      ellipse(1024, 850, 330, 200, TERRAIN_MATERIAL.stone)
      carveEllipse(1024, 850, 280, 150)
      carveRect(630, 775, 150, 150)
      carveRect(1268, 775, 150, 150)
      ramp(700, 850, 880, 650, 20, TERRAIN_MATERIAL.brick)
      ramp(1168, 650, 1348, 850, 20, TERRAIN_MATERIAL.brick)
      rect(330, 790, 170, 22, TERRAIN_MATERIAL.brick)
      rect(1548, 790, 170, 22, TERRAIN_MATERIAL.brick)
    },
  }),
  'glasshouse-divide': createRasterMap({
    id: 'glasshouse-divide',
    revision: 2,
    mode: '1v1',
    displayName: 'Glasshouse Divide',
    description: 'Break open mirrored conservatories or fight through the garden floor.',
    label: 'Layered greenhouse',
    width: 1280,
    height: 720,
    theme: theme({ sky: 0xbce7df, sun: 0xffe59a, backHill: 0x75aa8d, terrain: 0x806047, surface: 0x4f8a65, brick: 0xb86654, stone: 0x718083, steel: 0x38545b }),
    spawns: canonicalSpawns([[220, 390], [1060, 390]]),
    paint: ({ surface, rect, ramp, carveRect }) => {
      surface((x) => 585 + 16 * Math.cos(x / 92), TERRAIN_MATERIAL.soil)
      rect(130, 390, 180, 26, TERRAIN_MATERIAL.brick)
      rect(970, 390, 180, 26, TERRAIN_MATERIAL.brick)
      rect(110, 500, 20, 85, TERRAIN_MATERIAL.steel)
      rect(1150, 500, 20, 85, TERRAIN_MATERIAL.steel)
      ramp(110, 270, 170, 245, 20, TERRAIN_MATERIAL.brick)
      ramp(1110, 245, 1170, 270, 20, TERRAIN_MATERIAL.brick)
      rect(365, 500, 180, 24, TERRAIN_MATERIAL.brick)
      rect(735, 500, 180, 24, TERRAIN_MATERIAL.brick)
      carveRect(470, 520, 340, 160)
      rect(560, 555, 60, 26, TERRAIN_MATERIAL.stone)
      rect(660, 555, 60, 26, TERRAIN_MATERIAL.stone)
    },
  }),
  'iron-trestle': createRasterMap({
    id: 'iron-trestle',
    revision: 2,
    mode: '2v2',
    displayName: 'Iron Trestle',
    description: 'High bridge gunners and sheltered crews contest a broken industrial span.',
    label: 'Broken steel bridge',
    width: 1600,
    height: 900,
    theme: theme({ sky: 0xd4c4a5, sun: 0xffca66, backHill: 0x857b68, terrain: 0x735844, surface: 0x8b7650, brick: 0x9f4d3d, stone: 0x676765, steel: 0x304650 }),
    spawns: canonicalSpawns([[230, 380], [1370, 380], [520, 650], [1080, 650]]),
    paint: ({ surface, rect, ramp }) => {
      surface((x) => 790 + 20 * Math.cos(x / 130), TERRAIN_MATERIAL.soil)
      rect(140, 380, 180, 26, TERRAIN_MATERIAL.brick)
      rect(1280, 380, 180, 26, TERRAIN_MATERIAL.brick)
      rect(145, 620, 28, 170, TERRAIN_MATERIAL.steel)
      rect(1427, 620, 28, 170, TERRAIN_MATERIAL.steel)
      rect(420, 650, 200, 26, TERRAIN_MATERIAL.brick)
      rect(980, 650, 200, 26, TERRAIN_MATERIAL.brick)
      ramp(320, 430, 650, 510, 24, TERRAIN_MATERIAL.brick)
      ramp(950, 510, 1280, 430, 24, TERRAIN_MATERIAL.brick)
      rect(650, 510, 90, 22, TERRAIN_MATERIAL.brick)
      rect(860, 510, 90, 22, TERRAIN_MATERIAL.brick)
      ramp(560, 760, 720, 650, 22, TERRAIN_MATERIAL.brick)
      ramp(880, 650, 1040, 760, 22, TERRAIN_MATERIAL.brick)
    },
  }),
  'echo-caldera': createRasterMap({
    id: 'echo-caldera',
    revision: 2,
    mode: '3v3',
    displayName: 'Echo Caldera',
    description: 'Six firing tiers surround a hollow stone heart and paired transit gates.',
    label: 'Tiered volcanic bowl',
    width: 2048,
    height: 1152,
    theme: theme({ sky: 0x302d45, sun: 0xff9f5c, backHill: 0x51445b, terrain: 0x745044, surface: 0xb16b4e, dust: 0xca8260, brick: 0x8e443f, stone: 0x56515b, steel: 0x29343d }),
    spawns: canonicalSpawns([[170, 420], [1878, 420], [470, 650], [1578, 650], [860, 820], [1188, 820]]),
    objects: [{
      id: 'caldera-transit', type: 'projectile-portal',
      entrance: { start: { x: 748, y: 760 }, end: { x: 748, y: 880 }, thickness: 12 },
      exit: { start: { x: 1300, y: 760 }, end: { x: 1300, y: 880 }, thickness: 12 },
      velocityRetention: 0.85,
    }],
    paint: ({ surface, rect, ramp, ellipse, carveEllipse, carveRect }) => {
      surface((x) => 1010 + 34 * Math.cos((x - 1024) / 250), TERRAIN_MATERIAL.soil)
      ellipse(1024, 855, 260, 235, TERRAIN_MATERIAL.stone)
      carveEllipse(1024, 870, 215, 175)
      carveRect(674, 755, 170, 140)
      carveRect(1204, 755, 170, 140)
      rect(80, 420, 240, 28, TERRAIN_MATERIAL.stone)
      rect(1728, 420, 240, 28, TERRAIN_MATERIAL.stone)
      ramp(280, 448, 610, 650, 28, TERRAIN_MATERIAL.brick)
      ramp(1438, 650, 1768, 448, 28, TERRAIN_MATERIAL.brick)
      rect(430, 650, 240, 28, TERRAIN_MATERIAL.brick)
      rect(1378, 650, 240, 28, TERRAIN_MATERIAL.brick)
      ramp(620, 678, 820, 820, 26, TERRAIN_MATERIAL.brick)
      ramp(1228, 820, 1428, 678, 26, TERRAIN_MATERIAL.brick)
      rect(700, 820, 200, 28, TERRAIN_MATERIAL.brick)
      rect(1148, 820, 200, 28, TERRAIN_MATERIAL.brick)
      rect(900, 610, 60, 24, TERRAIN_MATERIAL.brick)
      rect(1088, 610, 60, 24, TERRAIN_MATERIAL.brick)
      carveRect(736, 755, 24, 140)
      carveRect(1288, 755, 24, 140)
    },
  }),
  'salt-flats': createRasterMap({
    id: 'salt-flats',
    revision: 1,
    mode: '1v1',
    displayName: 'Salt Flats',
    description: 'Long open shots cross low mineral shelves and a breakable center seam.',
    label: 'Open duel',
    width: 1120,
    height: 630,
    theme: theme({ sky: 0xb9dfe4, sun: 0xffe7a3, backHill: 0x8aaeb0, terrain: 0xa58468, surface: 0xd1c19a, dust: 0xd8b98a, stone: 0x817d78 }),
    spawns: canonicalSpawns([[190, 410], [930, 410]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 500 + 10 * Math.cos((x - 560) / 120), TERRAIN_MATERIAL.soil)
      rect(120, 410, 140, 22, TERRAIN_MATERIAL.soil)
      rect(860, 410, 140, 22, TERRAIN_MATERIAL.soil)
      ramp(260, 432, 380, 485, 20, TERRAIN_MATERIAL.brick)
      ramp(740, 485, 860, 432, 20, TERRAIN_MATERIAL.brick)
      ellipse(495, 490, 45, 25, TERRAIN_MATERIAL.soil)
      ellipse(625, 490, 45, 25, TERRAIN_MATERIAL.soil)
      rect(535, 465, 50, 18, TERRAIN_MATERIAL.brick)
      rect(155, 432, 70, 14, TERRAIN_MATERIAL.stone)
      rect(895, 432, 70, 14, TERRAIN_MATERIAL.stone)
    },
  }),
  'split-orchard': createRasterMap({
    id: 'split-orchard',
    revision: 1,
    mode: '1v1',
    displayName: 'Split Orchard',
    description: 'Two garden terraces overlook a wide, destructible central hollow.',
    label: 'Terrace duel',
    width: 1280,
    height: 720,
    theme: theme({ sky: 0xaedbd0, sun: 0xffdc83, backHill: 0x6f9b79, terrain: 0x795b3e, surface: 0x56804c, dust: 0xad8d62, brick: 0x9e5e47 }),
    spawns: canonicalSpawns([[210, 400], [1070, 400]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 600 + 12 * Math.cos((x - 640) / 110), TERRAIN_MATERIAL.soil)
      rect(120, 400, 180, 24, TERRAIN_MATERIAL.soil)
      rect(980, 400, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(300, 424, 500, 560, 22, TERRAIN_MATERIAL.brick)
      ramp(780, 560, 980, 424, 22, TERRAIN_MATERIAL.brick)
      rect(440, 535, 120, 20, TERRAIN_MATERIAL.brick)
      rect(720, 535, 120, 20, TERRAIN_MATERIAL.brick)
      ellipse(570, 590, 55, 28, TERRAIN_MATERIAL.soil)
      ellipse(710, 590, 55, 28, TERRAIN_MATERIAL.soil)
      rect(600, 575, 80, 18, TERRAIN_MATERIAL.brick)
    },
  }),
  'tideworks': createRasterMap({
    id: 'tideworks',
    revision: 1,
    mode: '2v2',
    displayName: 'Tideworks',
    description: 'Open flood-control decks connect high banks to a broad lower channel.',
    label: 'Open waterworks',
    width: 1600,
    height: 900,
    theme: theme({ sky: 0x9fd3dc, sun: 0xffdc8c, backHill: 0x668f93, terrain: 0x75634d, surface: 0x67876b, dust: 0xb39a78, brick: 0x9b634d, stone: 0x6e7776, steel: 0x38545b }),
    spawns: canonicalSpawns([[190, 400], [1410, 400], [520, 650], [1080, 650]]),
    paint: ({ surface, rect, ramp }) => {
      surface((x) => 790 + 12 * Math.cos((x - 800) / 150), TERRAIN_MATERIAL.soil)
      rect(100, 400, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1320, 400, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(280, 424, 500, 650, 22, TERRAIN_MATERIAL.brick)
      ramp(1100, 650, 1320, 424, 22, TERRAIN_MATERIAL.brick)
      rect(430, 650, 180, 24, TERRAIN_MATERIAL.soil)
      rect(990, 650, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(610, 674, 730, 750, 20, TERRAIN_MATERIAL.brick)
      ramp(870, 750, 990, 674, 20, TERRAIN_MATERIAL.brick)
      rect(690, 735, 80, 18, TERRAIN_MATERIAL.stone)
      rect(830, 735, 80, 18, TERRAIN_MATERIAL.stone)
      rect(170, 424, 40, 30, TERRAIN_MATERIAL.steel)
      rect(1390, 424, 40, 30, TERRAIN_MATERIAL.steel)
    },
  }),
  'ember-steps': createRasterMap({
    id: 'ember-steps',
    revision: 1,
    mode: '2v2',
    displayName: 'Ember Steps',
    description: 'Staggered volcanic shelves provide clear arcs above a shallow center bowl.',
    label: 'Staggered shelves',
    width: 1664,
    height: 936,
    theme: theme({ sky: 0x514457, sun: 0xffa45f, backHill: 0x66505b, terrain: 0x735044, surface: 0xa9664c, dust: 0xca8563, brick: 0x8e453d, stone: 0x57515a }),
    spawns: canonicalSpawns([[200, 410], [1464, 410], [560, 660], [1104, 660]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 825 + 18 * Math.cos((x - 832) / 170), TERRAIN_MATERIAL.soil)
      rect(110, 410, 180, 24, TERRAIN_MATERIAL.soil)
      rect(1374, 410, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(290, 434, 520, 660, 22, TERRAIN_MATERIAL.brick)
      ramp(1144, 660, 1374, 434, 22, TERRAIN_MATERIAL.brick)
      rect(470, 660, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1014, 660, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(650, 684, 760, 780, 20, TERRAIN_MATERIAL.brick)
      ramp(904, 780, 1014, 684, 20, TERRAIN_MATERIAL.brick)
      ellipse(832, 810, 70, 36, TERRAIN_MATERIAL.soil)
      rect(792, 760, 80, 18, TERRAIN_MATERIAL.stone)
    },
  }),
  'open-skyline': createRasterMap({
    id: 'open-skyline',
    revision: 1,
    mode: '3v3',
    displayName: 'Open Skyline',
    description: 'Six broad firing pads descend through open ridges with uninterrupted sky.',
    label: 'Open 3v3',
    width: 2016,
    height: 1134,
    theme: theme({ sky: 0x94cadb, sun: 0xffda8d, backHill: 0x607f86, terrain: 0x765e48, surface: 0x61885b, dust: 0xb18f6c }),
    spawns: canonicalSpawns([[180, 430], [1836, 430], [530, 650], [1486, 650], [820, 830], [1196, 830]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 1000 + 20 * Math.cos((x - 1008) / 220), TERRAIN_MATERIAL.soil)
      rect(90, 430, 180, 24, TERRAIN_MATERIAL.soil)
      rect(1746, 430, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(270, 454, 500, 650, 22, TERRAIN_MATERIAL.brick)
      ramp(1516, 650, 1746, 454, 22, TERRAIN_MATERIAL.brick)
      rect(440, 650, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1396, 650, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(620, 674, 790, 830, 22, TERRAIN_MATERIAL.brick)
      ramp(1226, 830, 1396, 674, 22, TERRAIN_MATERIAL.brick)
      rect(730, 830, 180, 24, TERRAIN_MATERIAL.soil)
      rect(1106, 830, 180, 24, TERRAIN_MATERIAL.soil)
      ellipse(958, 930, 65, 34, TERRAIN_MATERIAL.soil)
      ellipse(1058, 930, 65, 34, TERRAIN_MATERIAL.soil)
      rect(978, 900, 60, 18, TERRAIN_MATERIAL.stone)
    },
  }),
  'delta-spires': createRasterMap({
    id: 'delta-spires',
    revision: 1,
    mode: '3v3',
    displayName: 'Delta Spires',
    description: 'Three team terraces face narrow stone markers across a wide branching delta.',
    label: 'Three open lanes',
    width: 2112,
    height: 1188,
    theme: theme({ sky: 0xa6d5d3, sun: 0xffdf91, backHill: 0x678d83, terrain: 0x766149, surface: 0x5d8a64, dust: 0xb59670, brick: 0x9c654e, stone: 0x6d716b }),
    spawns: canonicalSpawns([[180, 450], [1932, 450], [540, 690], [1572, 690], [850, 880], [1262, 880]]),
    paint: ({ surface, rect, ramp, ellipse }) => {
      surface((x) => 1050 + 24 * Math.cos((x - 1056) / 260), TERRAIN_MATERIAL.soil)
      rect(90, 450, 180, 24, TERRAIN_MATERIAL.soil)
      rect(1842, 450, 180, 24, TERRAIN_MATERIAL.soil)
      ramp(270, 474, 510, 690, 22, TERRAIN_MATERIAL.brick)
      ramp(1602, 690, 1842, 474, 22, TERRAIN_MATERIAL.brick)
      rect(450, 690, 180, 24, TERRAIN_MATERIAL.brick)
      rect(1482, 690, 180, 24, TERRAIN_MATERIAL.brick)
      ramp(630, 714, 820, 880, 22, TERRAIN_MATERIAL.brick)
      ramp(1292, 880, 1482, 714, 22, TERRAIN_MATERIAL.brick)
      rect(760, 880, 180, 24, TERRAIN_MATERIAL.soil)
      rect(1172, 880, 180, 24, TERRAIN_MATERIAL.soil)
      ellipse(990, 980, 55, 42, TERRAIN_MATERIAL.stone)
      ellipse(1122, 980, 55, 42, TERRAIN_MATERIAL.stone)
      rect(1026, 940, 60, 18, TERRAIN_MATERIAL.brick)
      rect(690, 930, 70, 20, TERRAIN_MATERIAL.soil)
      rect(1352, 930, 70, 20, TERRAIN_MATERIAL.soil)
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
  'glasshouse-divide',
  'iron-trestle',
  'echo-caldera',
  'salt-flats',
  'split-orchard',
  'tideworks',
  'ember-steps',
  'open-skyline',
  'delta-spires',
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
