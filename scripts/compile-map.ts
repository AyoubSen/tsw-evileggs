import { readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import {
  MAP_FORMAT_VERSION,
  encodeMaterialRows,
  resolveMapDocument,
  type MapDocument,
  type MapTheme,
} from '../src/maps/mapDocument'
import { TERRAIN_MATERIAL, type TerrainMaterialId } from '../src/terrain/materials'

type CompilerMetadata = Omit<MapDocument, 'format' | 'formatVersion' | 'width' | 'height' | 'terrain' | 'theme'> & {
  cellSize: number
  theme: { [Key in keyof MapTheme]: number | string }
}

const METADATA_KEYS = [
  'id',
  'revision',
  'mode',
  'displayName',
  'description',
  'label',
  'cellSize',
  'spawns',
  'objects',
  'projectileBoundary',
  'theme',
] as const
const THEME_KEYS: Array<keyof MapTheme> = [
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

function requireExactKeys(value: object, keys: readonly string[], label: string): void {
  const record = value as Record<string, unknown>
  const allowed = new Set(keys)
  if (Object.keys(record).some((key) => !allowed.has(key)) || keys.some((key) => !(key in record)))
    throw new Error(`${label} contains unsupported or missing fields.`)
}

const SOURCE_PALETTE = new Map<string, TerrainMaterialId>([
  ['000000', TERRAIN_MATERIAL.empty],
  ['8a5a3b', TERRAIN_MATERIAL.soil],
  ['b5523b', TERRAIN_MATERIAL.brick],
  ['7a7770', TERRAIN_MATERIAL.stone],
  ['344951', TERRAIN_MATERIAL.steel],
])

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
  return upDistance <= upperLeftDistance ? up : upperLeft
}

function decodePng(buffer: Buffer): { width: number; height: number; rgba: Uint8Array } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Terrain source is not a PNG file.')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = -1
  let bitDepth = -1
  let interlace = -1
  const compressed: Buffer[] = []
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') compressed.push(data)
    else if (type === 'IEND') break
    offset += length + 12
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0)
    throw new Error('Use a non-interlaced 8-bit RGB or RGBA PNG terrain source.')
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(compressed))
  if (inflated.length !== (stride + 1) * height) throw new Error('PNG scanline data is invalid.')
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * (stride + 1)
    const filter = inflated[sourceStart]
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceStart + 1 + x]
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      const value =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + up
              : filter === 3
                ? raw + Math.floor((left + up) / 2)
                : filter === 4
                  ? raw + paeth(left, up, upperLeft)
                  : Number.NaN
      if (!Number.isFinite(value)) throw new Error(`PNG row ${y} uses an unsupported filter.`)
      pixels[y * stride + x] = value & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = pixels[pixel * channels]
    rgba[pixel * 4 + 1] = pixels[pixel * channels + 1]
    rgba[pixel * 4 + 2] = pixels[pixel * channels + 2]
    rgba[pixel * 4 + 3] = channels === 4 ? pixels[pixel * channels + 3] : 255
  }
  return { width, height, rgba }
}

function parseColor(value: number | string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
    return Number.parseInt(value.slice(1), 16)
  throw new Error(`Invalid theme color: ${String(value)}`)
}

async function main(): Promise<void> {
  const [imagePath, metadataPath, outputPath] = process.argv.slice(2)
  if (!imagePath || !metadataPath || !outputPath)
    throw new Error('Usage: pnpm map:compile <terrain.png> <metadata.json> <output.map.json>')
  const [image, metadataText] = await Promise.all([
    readFile(imagePath),
    readFile(metadataPath, 'utf8'),
  ])
  const metadata = JSON.parse(metadataText) as CompilerMetadata
  if (!metadata || typeof metadata !== 'object' || !metadata.theme || typeof metadata.theme !== 'object')
    throw new Error('Map metadata is invalid.')
  requireExactKeys(metadata, METADATA_KEYS, 'Map metadata')
  requireExactKeys(metadata.theme, THEME_KEYS, 'Map metadata theme')
  if (!Number.isSafeInteger(metadata.cellSize) || metadata.cellSize < 1)
    throw new Error('Map metadata cellSize must be a positive integer.')
  const decoded = decodePng(image)
  const cells = new Uint8Array(decoded.width * decoded.height)
  for (let pixel = 0; pixel < cells.length; pixel += 1) {
    const alpha = decoded.rgba[pixel * 4 + 3]
    if (alpha === 0) continue
    const color = [decoded.rgba[pixel * 4], decoded.rgba[pixel * 4 + 1], decoded.rgba[pixel * 4 + 2]]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    const material = SOURCE_PALETTE.get(color)
    if (material === undefined) {
      const x = pixel % decoded.width
      const y = Math.floor(pixel / decoded.width)
      throw new Error(`Unknown terrain color #${color} at ${x},${y}. Disable antialiasing.`)
    }
    cells[pixel] = material
  }
  const theme = Object.fromEntries(
    Object.entries(metadata.theme).map(([key, value]) => [key, parseColor(value)]),
  ) as MapTheme
  const document: MapDocument = {
    format: 'mossfire-map',
    formatVersion: MAP_FORMAT_VERSION,
    id: metadata.id,
    revision: metadata.revision,
    mode: metadata.mode,
    displayName: metadata.displayName,
    description: metadata.description,
    label: metadata.label,
    width: decoded.width * metadata.cellSize,
    height: decoded.height * metadata.cellSize,
    theme,
    spawns: metadata.spawns,
    objects: metadata.objects,
    projectileBoundary: metadata.projectileBoundary,
    terrain: {
      encoding: 'row-rle-v1',
      cellSize: metadata.cellSize,
      rows: encodeMaterialRows(cells, decoded.width, decoded.height),
    },
  }
  resolveMapDocument(document)
  await writeFile(outputPath, `${JSON.stringify(document)}\n`, 'utf8')
}

await main()
