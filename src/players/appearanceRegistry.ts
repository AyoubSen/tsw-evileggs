export const PLAYER_APPEARANCE_REGISTRY_VERSION = 'appearances-3.0.3' as const

const immutableCatalog = <const T extends readonly object[]>(entries: T): T =>
  Object.freeze(entries.map((entry) => Object.freeze(entry))) as unknown as T

const rig = (shoulderY: number, faceY: number, accessoryY: number, accessoryScale = 1, accessoryX = 0) => Object.freeze({
  shoulder: Object.freeze({ x: 61, y: shoulderY }),
  rearHand: Object.freeze({ x: 68, y: shoulderY + 7 }),
  frontHand: Object.freeze({ x: 74, y: shoulderY + 2 }),
  weaponGrip: Object.freeze({ x: 67, y: shoulderY + 7 }),
  faceSafe: Object.freeze({ x: 64, y: faceY }),
  accessory: Object.freeze({ x: 64, y: accessoryY }),
  accessoryFit: Object.freeze({ x: accessoryX, y: accessoryY - 29, scale: accessoryScale }),
})

export const PLAYER_BODIES = immutableCatalog([
  { id: 'classic', label: 'Classic', recipe: Object.freeze({ shape: 'egg', scale: 1, rig: rig(78, 64, 29) }) },
  { id: 'round', label: 'Round', recipe: Object.freeze({ shape: 'round', scale: 1.04, rig: rig(76, 63, 31, 1.08) }) },
  { id: 'tall', label: 'Tall', recipe: Object.freeze({ shape: 'tall', scale: 1, rig: rig(77, 62, 26, 0.92) }) },
  { id: 'scrambled', label: 'Scrambled', recipe: Object.freeze({ shape: 'scrambled', scale: 0.98, rig: rig(78, 64, 30, 1.1, -1) }) },
] as const)

export const PLAYER_PRIMARY_COLORS = immutableCatalog([
  { id: 'shell', label: 'Shell', color: '#f3e5c8' },
  { id: 'yolk', label: 'Yolk', color: '#f5b82e' },
  { id: 'tomato', label: 'Tomato', color: '#df554b' },
  { id: 'berry', label: 'Berry', color: '#a84f78' },
  { id: 'grape', label: 'Grape', color: '#7957a8' },
  { id: 'sky', label: 'Sky', color: '#579ac8' },
  { id: 'ocean', label: 'Ocean', color: '#35739b' },
  { id: 'mint', label: 'Mint', color: '#58a982' },
  { id: 'leaf', label: 'Leaf', color: '#6f963f' },
  { id: 'cocoa', label: 'Cocoa', color: '#80553d' },
  { id: 'slate', label: 'Slate', color: '#596273' },
  { id: 'charcoal', label: 'Charcoal', color: '#30343d' },
] as const)

export const PLAYER_ACCENT_COLORS = immutableCatalog([
  { id: 'cream', label: 'Cream', color: '#fff1cf' },
  { id: 'gold', label: 'Gold', color: '#f2c14e' },
  { id: 'coral', label: 'Coral', color: '#ef7968' },
  { id: 'pink', label: 'Pink', color: '#e58caf' },
  { id: 'violet', label: 'Violet', color: '#9a7bd1' },
  { id: 'cyan', label: 'Cyan', color: '#67c6d7' },
  { id: 'lime', label: 'Lime', color: '#a5c95d' },
  { id: 'ink', label: 'Ink', color: '#252936' },
] as const)

export const PLAYER_PATTERNS = immutableCatalog([
  { id: 'solid', label: 'Solid', recipe: Object.freeze({ kind: 'solid', compactReadable: false }) },
  { id: 'spots', label: 'Spots', recipe: Object.freeze({ kind: 'spots', compactReadable: true }) },
  { id: 'stripes', label: 'Stripes', recipe: Object.freeze({ kind: 'stripes', compactReadable: true }) },
  { id: 'split', label: 'Split', recipe: Object.freeze({ kind: 'split', compactReadable: true }) },
  { id: 'zigzag', label: 'Zigzag', recipe: Object.freeze({ kind: 'zigzag', compactReadable: true }) },
  { id: 'speckled', label: 'Speckled', recipe: Object.freeze({ kind: 'speckled', compactReadable: true }) },
] as const)

export const PLAYER_FACES = immutableCatalog([
  { id: 'smile', label: 'Smile', recipe: Object.freeze({ expression: 'smile' }) },
  { id: 'grin', label: 'Grin', recipe: Object.freeze({ expression: 'grin' }) },
  { id: 'determined', label: 'Determined', recipe: Object.freeze({ expression: 'determined' }) },
  { id: 'surprised', label: 'Surprised', recipe: Object.freeze({ expression: 'surprised' }) },
  { id: 'sleepy', label: 'Sleepy', recipe: Object.freeze({ expression: 'sleepy' }) },
  { id: 'mischief', label: 'Mischief', recipe: Object.freeze({ expression: 'mischief' }) },
  { id: 'stoic', label: 'Stoic', recipe: Object.freeze({ expression: 'stoic' }) },
  { id: 'cheery', label: 'Cheery', recipe: Object.freeze({ expression: 'cheery' }) },
] as const)

export const PLAYER_VICTORY_STYLES = immutableCatalog([
  { id: 'proud', label: 'Proud', recipe: Object.freeze({ expression: 'proud' }) },
  { id: 'excited', label: 'Excited', recipe: Object.freeze({ expression: 'excited' }) },
  { id: 'smug', label: 'Smug', recipe: Object.freeze({ expression: 'smug' }) },
  { id: 'calm', label: 'Calm', recipe: Object.freeze({ expression: 'calm' }) },
] as const)

export const PLAYER_ACCESSORIES = immutableCatalog([
  { id: 'none', label: 'None', recipe: Object.freeze({ kind: 'none', category: 'front', occludesEyes: 0, occludesMouth: false, compactMark: 'none' }) },
  { id: 'cap', label: 'Cap', recipe: Object.freeze({ kind: 'cap', category: 'head', occludesEyes: 0, occludesMouth: false, compactMark: 'brim' }) },
  { id: 'crown', label: 'Crown', recipe: Object.freeze({ kind: 'crown', category: 'head', occludesEyes: 0, occludesMouth: false, compactMark: 'points' }) },
  { id: 'headband', label: 'Headband', recipe: Object.freeze({ kind: 'headband', category: 'head', occludesEyes: 0, occludesMouth: false, compactMark: 'band' }) },
  { id: 'glasses', label: 'Glasses', recipe: Object.freeze({ kind: 'glasses', category: 'face', occludesEyes: 0, occludesMouth: false, compactMark: 'double-ring' }) },
  { id: 'eyepatch', label: 'Eye Patch', recipe: Object.freeze({ kind: 'eyepatch', category: 'face', occludesEyes: 1, occludesMouth: false, compactMark: 'single-ring' }) },
  { id: 'bow', label: 'Bow', recipe: Object.freeze({ kind: 'bow', category: 'rear', occludesEyes: 0, occludesMouth: false, compactMark: 'bow' }) },
  { id: 'mohawk', label: 'Mohawk', recipe: Object.freeze({ kind: 'mohawk', category: 'head', occludesEyes: 0, occludesMouth: false, compactMark: 'spikes' }) },
] as const)

export const PLAYER_PREVIEW_BACKGROUNDS = Object.freeze([
  Object.freeze({ teamId: 0 as const, label: 'Comet team', color: '#cce8ee' }),
  Object.freeze({ teamId: 1 as const, label: 'Ember team', color: '#f8d4d9' }),
])

export type PlayerBodyId = (typeof PLAYER_BODIES)[number]['id']
export type PlayerPrimaryColorId = (typeof PLAYER_PRIMARY_COLORS)[number]['id']
export type PlayerAccentColorId = (typeof PLAYER_ACCENT_COLORS)[number]['id']
export type PlayerPatternId = (typeof PLAYER_PATTERNS)[number]['id']
export type PlayerFaceId = (typeof PLAYER_FACES)[number]['id']
export type PlayerVictoryStyleId = (typeof PLAYER_VICTORY_STYLES)[number]['id']
export type PlayerAccessoryId = (typeof PLAYER_ACCESSORIES)[number]['id']

export type PlayerAppearance = {
  version: 2
  body: PlayerBodyId
  primaryColor: PlayerPrimaryColorId
  accentColor: PlayerAccentColorId
  pattern: PlayerPatternId
  face: PlayerFaceId
  victoryStyle: PlayerVictoryStyleId
  accessory: PlayerAccessoryId
}

const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255
export function relativeLuminance(hex: string): number {
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5))
}

export function colorContrast(first: string, second: string): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

export type AppearanceReadability = Readonly<{
  primaryAccentContrast: number
  inkContrast: number
  faceContrast: number
  teamOutlineContrast: readonly Readonly<{ teamId: 0 | 1; ratio: number }>[]
  backgroundContrast: readonly Readonly<{ teamId: 0 | 1; ratio: number }>[]
  highContrastSafe: boolean
  compactSafe: boolean
  silhouetteCue: boolean
  patternCue: boolean
  faceSafe: boolean
  warnings: readonly string[]
}>

export function analyzeAppearanceReadability(appearance: Readonly<PlayerAppearance>): AppearanceReadability {
  const primary = PLAYER_PRIMARY_COLORS.find((entry) => entry.id === appearance.primaryColor)!.color
  const accent = PLAYER_ACCENT_COLORS.find((entry) => entry.id === appearance.accentColor)!.color
  const accessory = PLAYER_ACCESSORIES.find((entry) => entry.id === appearance.accessory)!.recipe
  const pattern = PLAYER_PATTERNS.find((entry) => entry.id === appearance.pattern)!.recipe
  const primaryAccentContrast = colorContrast(primary, accent)
  const inkContrast = colorContrast(primary, '#24313a')
  const faceContrast = colorContrast(primary, '#fff1c9')
  const teamOutlineContrast = PLAYER_PREVIEW_BACKGROUNDS.map((background) => Object.freeze({ teamId: background.teamId, ratio: colorContrast(primary, background.teamId === 0 ? '#17447f' : '#aa392b') }))
  const backgroundContrast = PLAYER_PREVIEW_BACKGROUNDS.map((background) => Object.freeze({ teamId: background.teamId, ratio: colorContrast(primary, background.color) }))
  const faceSafe = accessory.occludesEyes < 2 && !accessory.occludesMouth
  const silhouetteCue = appearance.body !== 'classic' || accessory.compactMark !== 'none'
  const compactSafe = silhouetteCue || pattern.compactReadable || primaryAccentContrast >= 3
  const highContrastSafe = colorContrast('#b8b8b8', '#080808') >= 4.5 && colorContrast('#ffffff', '#080808') >= 4.5
  const warnings: string[] = []
  if (primaryAccentContrast < 2) warnings.push(`Primary and accent contrast is low (${primaryAccentContrast.toFixed(1)}:1). Pattern details may blend together.`)
  if (!faceSafe) warnings.push('This accessory would hide the full expression.')
  if (inkContrast < 3) warnings.push(`Body and resolved ink contrast is low (${inkContrast.toFixed(1)}:1).`)
  if (faceContrast < 1.5) warnings.push(`Face fill and body contrast is low (${faceContrast.toFixed(1)}:1).`)
  if (teamOutlineContrast.some((item) => item.ratio < 1.5)) warnings.push('A team outline may blend into this body color.')
  if (backgroundContrast.some((item) => item.ratio < 1.5)) warnings.push('This look may blend into a team background.')
  if (!compactSafe) warnings.push('This look relies on color alone in compact HUD and timeline views. Add a pattern or silhouette accessory.')
  return Object.freeze({
    primaryAccentContrast,
    inkContrast,
    faceContrast,
    teamOutlineContrast: Object.freeze(teamOutlineContrast),
    backgroundContrast: Object.freeze(backgroundContrast),
    highContrastSafe,
    compactSafe,
    silhouetteCue,
    patternCue: pattern.compactReadable,
    faceSafe,
    warnings: Object.freeze(warnings),
  })
}

const ids = <T extends readonly { id: string }[]>(catalog: T) =>
  new Set<string>(catalog.map((entry) => entry.id))
const bodyIds = ids(PLAYER_BODIES)
const primaryColorIds = ids(PLAYER_PRIMARY_COLORS)
const accentColorIds = ids(PLAYER_ACCENT_COLORS)
const patternIds = ids(PLAYER_PATTERNS)
const faceIds = ids(PLAYER_FACES)
const victoryStyleIds = ids(PLAYER_VICTORY_STYLES)
const accessoryIds = ids(PLAYER_ACCESSORIES)

const makeAppearance = (
  primaryColor: PlayerPrimaryColorId,
  accentColor: PlayerAccentColorId,
  pattern: PlayerPatternId,
  face: PlayerFaceId,
  accessory: PlayerAccessoryId,
  body: PlayerBodyId = 'classic',
): Readonly<PlayerAppearance> =>
  Object.freeze({ version: 2, body, primaryColor, accentColor, pattern, face, victoryStyle: 'proud', accessory })

export const DEFAULT_PLAYER_APPEARANCES: readonly Readonly<PlayerAppearance>[] = Object.freeze([
  makeAppearance('shell', 'gold', 'solid', 'smile', 'none'),
  makeAppearance('tomato', 'cream', 'stripes', 'grin', 'cap', 'round'),
  makeAppearance('sky', 'ink', 'spots', 'determined', 'headband', 'tall'),
  makeAppearance('mint', 'cream', 'split', 'cheery', 'glasses'),
  makeAppearance('grape', 'pink', 'zigzag', 'mischief', 'bow', 'scrambled'),
  makeAppearance('charcoal', 'cyan', 'speckled', 'stoic', 'crown', 'tall'),
])

export function validatePlayerAppearance(value: unknown): value is PlayerAppearance {
  if (!value || typeof value !== 'object') return false
  const appearance = value as Record<string, unknown>
  const keys = Object.keys(appearance)
  if (keys.length !== 8 || keys.some((key) => !['version', 'body', 'primaryColor', 'accentColor', 'pattern', 'face', 'victoryStyle', 'accessory'].includes(key)))
    return false
  return (
    appearance.version === 2 &&
    typeof appearance.body === 'string' && bodyIds.has(appearance.body) &&
    typeof appearance.primaryColor === 'string' && primaryColorIds.has(appearance.primaryColor) &&
    typeof appearance.accentColor === 'string' && accentColorIds.has(appearance.accentColor) &&
    typeof appearance.pattern === 'string' && patternIds.has(appearance.pattern) &&
    typeof appearance.face === 'string' && faceIds.has(appearance.face) &&
    typeof appearance.victoryStyle === 'string' && victoryStyleIds.has(appearance.victoryStyle) &&
    typeof appearance.accessory === 'string' && accessoryIds.has(appearance.accessory)
  )
}

export function clonePlayerAppearance(appearance: Readonly<PlayerAppearance>): PlayerAppearance {
  return { ...appearance }
}

export function sanitizePlayerAppearance(
  value: unknown,
  fallback: Readonly<PlayerAppearance> = DEFAULT_PLAYER_APPEARANCES[0],
): PlayerAppearance {
  if (validatePlayerAppearance(value)) return clonePlayerAppearance(value)
  if (validatePlayerAppearanceV1(value)) {
    const appearance = value as Record<string, unknown>
    const migrated = { ...appearance, version: 2, victoryStyle: 'proud' }
    return clonePlayerAppearance(migrated as PlayerAppearance)
  }
  return clonePlayerAppearance(fallback)
}

export function validatePlayerAppearanceV1(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const appearance = value as Record<string, unknown>
  const expected = ['version', 'body', 'primaryColor', 'accentColor', 'pattern', 'face', 'accessory']
  const keys = Object.keys(appearance)
  return keys.length === expected.length && keys.every((key) => expected.includes(key)) &&
    appearance.version === 1 && typeof appearance.body === 'string' && bodyIds.has(appearance.body) &&
    typeof appearance.primaryColor === 'string' && primaryColorIds.has(appearance.primaryColor) &&
    typeof appearance.accentColor === 'string' && accentColorIds.has(appearance.accentColor) &&
    typeof appearance.pattern === 'string' && patternIds.has(appearance.pattern) &&
    typeof appearance.face === 'string' && faceIds.has(appearance.face) &&
    typeof appearance.accessory === 'string' && accessoryIds.has(appearance.accessory)
}

export function migratePlayerAppearance(value: unknown): PlayerAppearance | null {
  if (validatePlayerAppearance(value)) return clonePlayerAppearance(value)
  if (!validatePlayerAppearanceV1(value)) return null
  const appearance = value as Record<string, unknown>
  return { ...appearance, version: 2, victoryStyle: 'proud' } as PlayerAppearance
}

export function randomPlayerAppearance(random: () => number = Math.random): PlayerAppearance {
  const pick = <T extends readonly { id: string }[]>(catalog: T): T[number]['id'] =>
    catalog[Math.min(catalog.length - 1, Math.floor(Math.max(0, random()) * catalog.length))].id
  return {
    version: 2,
    body: pick(PLAYER_BODIES),
    primaryColor: pick(PLAYER_PRIMARY_COLORS),
    accentColor: pick(PLAYER_ACCENT_COLORS),
    pattern: pick(PLAYER_PATTERNS),
    face: pick(PLAYER_FACES),
    victoryStyle: pick(PLAYER_VICTORY_STYLES),
    accessory: pick(PLAYER_ACCESSORIES),
  }
}
