export const PLAYER_APPEARANCE_REGISTRY_VERSION = 'appearances-2' as const

const immutableCatalog = <const T extends readonly object[]>(entries: T): T =>
  Object.freeze(entries.map((entry) => Object.freeze(entry))) as unknown as T

export const PLAYER_BODIES = immutableCatalog([
  { id: 'classic', label: 'Classic', recipe: Object.freeze({ shape: 'egg', scale: 1 }) },
  { id: 'round', label: 'Round', recipe: Object.freeze({ shape: 'round', scale: 1.04 }) },
  { id: 'tall', label: 'Tall', recipe: Object.freeze({ shape: 'tall', scale: 1 }) },
  { id: 'scrambled', label: 'Scrambled', recipe: Object.freeze({ shape: 'scrambled', scale: 0.98 }) },
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
  { id: 'solid', label: 'Solid', recipe: Object.freeze({ kind: 'solid' }) },
  { id: 'spots', label: 'Spots', recipe: Object.freeze({ kind: 'spots' }) },
  { id: 'stripes', label: 'Stripes', recipe: Object.freeze({ kind: 'stripes' }) },
  { id: 'split', label: 'Split', recipe: Object.freeze({ kind: 'split' }) },
  { id: 'zigzag', label: 'Zigzag', recipe: Object.freeze({ kind: 'zigzag' }) },
  { id: 'speckled', label: 'Speckled', recipe: Object.freeze({ kind: 'speckled' }) },
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

export const PLAYER_ACCESSORIES = immutableCatalog([
  { id: 'none', label: 'None', recipe: Object.freeze({ kind: 'none' }) },
  { id: 'cap', label: 'Cap', recipe: Object.freeze({ kind: 'cap' }) },
  { id: 'crown', label: 'Crown', recipe: Object.freeze({ kind: 'crown' }) },
  { id: 'headband', label: 'Headband', recipe: Object.freeze({ kind: 'headband' }) },
  { id: 'glasses', label: 'Glasses', recipe: Object.freeze({ kind: 'glasses' }) },
  { id: 'eyepatch', label: 'Eye Patch', recipe: Object.freeze({ kind: 'eyepatch' }) },
  { id: 'bow', label: 'Bow', recipe: Object.freeze({ kind: 'bow' }) },
  { id: 'mohawk', label: 'Mohawk', recipe: Object.freeze({ kind: 'mohawk' }) },
] as const)

export type PlayerBodyId = (typeof PLAYER_BODIES)[number]['id']
export type PlayerPrimaryColorId = (typeof PLAYER_PRIMARY_COLORS)[number]['id']
export type PlayerAccentColorId = (typeof PLAYER_ACCENT_COLORS)[number]['id']
export type PlayerPatternId = (typeof PLAYER_PATTERNS)[number]['id']
export type PlayerFaceId = (typeof PLAYER_FACES)[number]['id']
export type PlayerAccessoryId = (typeof PLAYER_ACCESSORIES)[number]['id']

export type PlayerAppearance = {
  version: 1
  body: PlayerBodyId
  primaryColor: PlayerPrimaryColorId
  accentColor: PlayerAccentColorId
  pattern: PlayerPatternId
  face: PlayerFaceId
  accessory: PlayerAccessoryId
}

const ids = <T extends readonly { id: string }[]>(catalog: T) =>
  new Set<string>(catalog.map((entry) => entry.id))
const bodyIds = ids(PLAYER_BODIES)
const primaryColorIds = ids(PLAYER_PRIMARY_COLORS)
const accentColorIds = ids(PLAYER_ACCENT_COLORS)
const patternIds = ids(PLAYER_PATTERNS)
const faceIds = ids(PLAYER_FACES)
const accessoryIds = ids(PLAYER_ACCESSORIES)

const makeAppearance = (
  primaryColor: PlayerPrimaryColorId,
  accentColor: PlayerAccentColorId,
  pattern: PlayerPatternId,
  face: PlayerFaceId,
  accessory: PlayerAccessoryId,
  body: PlayerBodyId = 'classic',
): Readonly<PlayerAppearance> =>
  Object.freeze({ version: 1, body, primaryColor, accentColor, pattern, face, accessory })

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
  return (
    appearance.version === 1 &&
    typeof appearance.body === 'string' && bodyIds.has(appearance.body) &&
    typeof appearance.primaryColor === 'string' && primaryColorIds.has(appearance.primaryColor) &&
    typeof appearance.accentColor === 'string' && accentColorIds.has(appearance.accentColor) &&
    typeof appearance.pattern === 'string' && patternIds.has(appearance.pattern) &&
    typeof appearance.face === 'string' && faceIds.has(appearance.face) &&
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
  return clonePlayerAppearance(validatePlayerAppearance(value) ? value : fallback)
}

export function randomPlayerAppearance(random: () => number = Math.random): PlayerAppearance {
  const pick = <T extends readonly { id: string }[]>(catalog: T): T[number]['id'] =>
    catalog[Math.min(catalog.length - 1, Math.floor(Math.max(0, random()) * catalog.length))].id
  return {
    version: 1,
    body: pick(PLAYER_BODIES),
    primaryColor: pick(PLAYER_PRIMARY_COLORS),
    accentColor: pick(PLAYER_ACCENT_COLORS),
    pattern: pick(PLAYER_PATTERNS),
    face: pick(PLAYER_FACES),
    accessory: pick(PLAYER_ACCESSORIES),
  }
}
