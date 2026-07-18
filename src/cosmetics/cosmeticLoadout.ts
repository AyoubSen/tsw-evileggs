import type { SemanticPalette } from '../game/weaponVisualRecipes'
import { WEAPON_ORDER, type WeaponId } from '../weapons/registry'
import { PLAYER_ACCESSORIES, PLAYER_FACES, PLAYER_PATTERNS, PLAYER_VICTORY_STYLES } from '../players/appearanceRegistry'

export const COSMETIC_LOADOUT_VERSION = 2 as const

export const WEAPON_SKINS = [
  { id: 'standard', label: 'Workshop Standard', description: 'Fresh from the toybox.', price: 0 },
  { id: 'sunset-brass', label: 'Sunset Brass', description: 'Warm brass with a molten glow.', price: 140 },
  { id: 'void-royal', label: 'Void Royal', description: 'Deep violet wrapped in ion teal.', price: 220 },
  { id: 'hazard-pop', label: 'Hazard Pop', description: 'Safety black with loud candy accents.', price: 175 },
  { id: 'royal-icing', label: 'Royal Icing', description: 'Porcelain white, cobalt trim, gold details.', price: 205 },
  { id: 'deep-sea', label: 'Deep Sea', description: 'Submarine steel lit by cold bioluminescence.', price: 190 },
  { id: 'candy-circuit', label: 'Candy Circuit', description: 'Bubblegum hardware with electric sprinkles.', price: 160 },
  { id: 'scrapyard', label: 'Scrapyard', description: 'Rust, patched steel, and stubborn machinery.', price: 125 },
  { id: 'garden-party', label: 'Garden Party', description: 'Leaf green, flower pink, and picnic cream.', price: 165 },
  { id: 'arctic-rescue', label: 'Arctic Rescue', description: 'Rescue orange cutting through polar blue.', price: 185 },
  { id: 'arcade-cabinet', label: 'Arcade Cabinet', description: 'Neon pixels on midnight hardware.', price: 210 },
  { id: 'eggsecutor', label: 'Eggsecutor', description: 'Black shell, yolk gold, and a dangerous red flash.', price: 240 },
] as const

export const PROJECTILE_SKINS = [
  { id: 'standard', label: 'Standard Payload', description: 'Reliable, readable, regulation issue.', entitlementId: null, price: 0 },
  { id: 'plasma-mint', label: 'Plasma Mint', description: 'A crisp green pulse with a bright trail.', entitlementId: 'projectile-skin:plasma-mint', price: 40 },
  { id: 'solar-flare', label: 'Solar Flare', description: 'Sun-hot orange with a blazing wake.', entitlementId: 'projectile-skin:solar-flare', price: 55 },
  { id: 'ghost-ion', label: 'Ghost Ion', description: 'Spectral lavender fading into the dark.', entitlementId: 'projectile-skin:ghost-ion', price: 70 },
  { id: 'frostbite', label: 'Frostbite', description: 'Glacial blue with a snow-bright flash.', entitlementId: 'projectile-skin:frostbite', price: 55 },
  { id: 'toxic-slime', label: 'Toxic Slime', description: 'Radioactive green that refuses to behave.', entitlementId: 'projectile-skin:toxic-slime', price: 50 },
  { id: 'comet-tail', label: 'Comet Tail', description: 'Midnight blue carrying a golden stardust trail.', entitlementId: 'projectile-skin:comet-tail', price: 65 },
  { id: 'confetti', label: 'Confetti Charge', description: 'Party pink with a punchy cyan wake.', entitlementId: 'projectile-skin:confetti', price: 45 },
] as const

export type WeaponSkinId = typeof WEAPON_SKINS[number]['id']
export type ProjectileSkinId = typeof PROJECTILE_SKINS[number]['id']
export type CosmeticLoadout = {
  version: typeof COSMETIC_LOADOUT_VERSION
  weaponSkins: Partial<Record<WeaponId, WeaponSkinId>>
  projectileSkin: ProjectileSkinId
}

export const DEFAULT_COSMETIC_LOADOUT: CosmeticLoadout = {
  version: COSMETIC_LOADOUT_VERSION,
  weaponSkins: {},
  projectileSkin: 'standard',
}

export function sanitizeCosmeticLoadout(value: unknown): CosmeticLoadout {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    version: COSMETIC_LOADOUT_VERSION,
    weaponSkins: Object.fromEntries(WEAPON_ORDER.map((weaponId) => {
      const stored = source.weaponSkins && typeof source.weaponSkins === 'object'
        ? (source.weaponSkins as Record<string, unknown>)[weaponId]
        : source.weaponSkin
      return [weaponId, WEAPON_SKINS.some(({ id }) => id === stored) ? stored as WeaponSkinId : 'standard']
    })),
    projectileSkin: PROJECTILE_SKINS.some(({ id }) => id === source.projectileSkin) ? source.projectileSkin as ProjectileSkinId : 'standard',
  }
}

export function isCosmeticOwned(
  kind: 'weapon' | 'projectile',
  skinId: WeaponSkinId | ProjectileSkinId,
  entitlements: ReadonlySet<string> | readonly string[],
  weaponId?: WeaponId,
): boolean {
  const skin = (kind === 'weapon' ? WEAPON_SKINS : PROJECTILE_SKINS).find(({ id }) => id === skinId)
  if (!skin || skin.id === 'standard') return skin !== undefined
  const entitlementId = kind === 'weapon' && weaponId
    ? weaponSkinEntitlementId(weaponId, skin.id as WeaponSkinId)
    : 'entitlementId' in skin ? skin.entitlementId : null
  if (!entitlementId) return false
  return Array.isArray(entitlements)
    ? entitlements.includes(entitlementId)
    : (entitlements as ReadonlySet<string>).has(entitlementId)
}

export const weaponSkinEntitlementId = (weaponId: WeaponId, skinId: WeaponSkinId) => `weapon-skin:${weaponId}:${skinId}`
export const weaponSkinFor = (loadout: CosmeticLoadout, weaponId: WeaponId): WeaponSkinId => loadout.weaponSkins[weaponId] ?? 'standard'

export function entitlementAwareLoadout(loadout: CosmeticLoadout, entitlements: readonly string[]): CosmeticLoadout {
  return {
    ...loadout,
    weaponSkins: Object.fromEntries(WEAPON_ORDER.map((weaponId) => {
      const skinId = weaponSkinFor(loadout, weaponId)
      return [weaponId, isCosmeticOwned('weapon', skinId, entitlements, weaponId) ? skinId : 'standard']
    })),
    projectileSkin: isCosmeticOwned('projectile', loadout.projectileSkin, entitlements) ? loadout.projectileSkin : 'standard',
  }
}

export function applyWeaponSkin(palette: SemanticPalette, skinId: WeaponSkinId): SemanticPalette {
  if (skinId === 'sunset-brass')
    return { ...palette, primary: 0x6f351f, accent: 0xffc857, highlight: 0xfff0b5, flash: 0xff8f3d, shadow: 0x2b1711 }
  if (skinId === 'void-royal')
    return { ...palette, primary: 0x3b1d6b, accent: 0x36e1dc, highlight: 0xc8fff8, flash: 0xf06cff, shadow: 0x130b2b, ink: 0x160d24 }
  if (skinId === 'hazard-pop')
    return { ...palette, primary: 0x232329, accent: 0xdfff00, highlight: 0xffffff, flash: 0xff3da5, shadow: 0x09090c, ink: 0x09090c }
  if (skinId === 'royal-icing')
    return { ...palette, primary: 0xf7f0dc, accent: 0x275dad, highlight: 0xffffff, flash: 0xf2c14e, shadow: 0x17345f, ink: 0x18243a }
  if (skinId === 'deep-sea')
    return { ...palette, primary: 0x183b4e, accent: 0x2ec4b6, highlight: 0xc8fff4, flash: 0x62e7f0, shadow: 0x081b29, ink: 0x071923 }
  if (skinId === 'candy-circuit')
    return { ...palette, primary: 0xe94f9d, accent: 0x55dff5, highlight: 0xfff0fa, flash: 0xffdf5d, shadow: 0x732653, ink: 0x3d1730 }
  if (skinId === 'scrapyard')
    return { ...palette, primary: 0x744a32, accent: 0xd9823b, highlight: 0xe9c89b, flash: 0xffb347, shadow: 0x30241e, ink: 0x211a17 }
  if (skinId === 'garden-party')
    return { ...palette, primary: 0x39734f, accent: 0xf08aac, highlight: 0xfff2cf, flash: 0xffd45c, shadow: 0x193c2b, ink: 0x132b20 }
  if (skinId === 'arctic-rescue')
    return { ...palette, primary: 0x287da1, accent: 0xff7138, highlight: 0xe8fbff, flash: 0xffb02e, shadow: 0x123c58, ink: 0x0d293a }
  if (skinId === 'arcade-cabinet')
    return { ...palette, primary: 0x20204a, accent: 0x39f2d0, highlight: 0xff62cf, flash: 0xffef5a, shadow: 0x0b0b25, ink: 0x09091c }
  if (skinId === 'eggsecutor')
    return { ...palette, primary: 0x26252a, accent: 0xe5ad2f, highlight: 0xffe49a, flash: 0xe43f3f, shadow: 0x0c0c0f, ink: 0x08080a }
  return palette
}

export function applyProjectileSkin(palette: SemanticPalette, skinId: ProjectileSkinId): SemanticPalette {
  if (skinId === 'plasma-mint')
    return { ...palette, primary: 0x176f68, accent: 0x64ffd2, flash: 0xe1fff5, impact: 0x26e6b1, trail: 0x64ffd2, highlight: 0xe1fff5 }
  if (skinId === 'solar-flare')
    return { ...palette, primary: 0xb92f18, accent: 0xffa62b, flash: 0xffffb3, impact: 0xff4d00, trail: 0xffc857, highlight: 0xffffff }
  if (skinId === 'ghost-ion')
    return { ...palette, primary: 0x49308f, accent: 0xbda7ff, flash: 0xffffff, impact: 0x9d7bff, trail: 0xd8ccff, highlight: 0xffffff, ink: 0x211443 }
  if (skinId === 'frostbite')
    return { ...palette, primary: 0x3973a8, accent: 0x9be7ff, flash: 0xffffff, impact: 0x63c7f2, trail: 0xd9f7ff, highlight: 0xffffff, ink: 0x16324a }
  if (skinId === 'toxic-slime')
    return { ...palette, primary: 0x3e6b22, accent: 0xb7f52a, flash: 0xefff9a, impact: 0x79d70f, trail: 0xb7f52a, highlight: 0xf6ffc9, ink: 0x1b2d12 }
  if (skinId === 'comet-tail')
    return { ...palette, primary: 0x172d59, accent: 0xf6c453, flash: 0xfff2b5, impact: 0xf39c3d, trail: 0xffd86b, highlight: 0xffffff, ink: 0x0a1733 }
  if (skinId === 'confetti')
    return { ...palette, primary: 0xdb3a86, accent: 0x43d9e6, flash: 0xfff36b, impact: 0xff5c8a, trail: 0x55e3ee, highlight: 0xffffff, ink: 0x541638 }
  return palette
}

export function applyHeldObjectSkin(
  palette: SemanticPalette,
  _weaponId: WeaponId,
  loadout: CosmeticLoadout,
): SemanticPalette {
  return applyWeaponSkin(palette, weaponSkinFor(loadout, _weaponId))
}

export const FREE_APPEARANCE_IDS = {
  pattern: new Set<string>(['solid', 'spots', 'stripes', 'split', 'zigzag', 'speckled']),
  face: new Set<string>(['smile', 'grin', 'determined', 'cheery', 'mischief', 'stoic']),
  victoryStyle: new Set<string>(['proud']),
  accessory: new Set<string>(['none', 'cap', 'headband', 'glasses', 'bow', 'crown']),
} as const

export const APPEARANCE_COSMETICS = [
  ...PLAYER_PATTERNS.filter(({ id }) => !FREE_APPEARANCE_IDS.pattern.has(id)).map(({ id, label }) => ({ kind: 'pattern' as const, id, label, description: `${label} shell pattern.`, entitlementId: `pattern:${id}`, price: 140 })),
  ...PLAYER_FACES.filter(({ id }) => !FREE_APPEARANCE_IDS.face.has(id)).map(({ id, label }) => ({ kind: 'face' as const, id, label, description: `${label} player expression.`, entitlementId: `face:${id}`, price: 120 })),
  ...PLAYER_VICTORY_STYLES.filter(({ id }) => !FREE_APPEARANCE_IDS.victoryStyle.has(id)).map(({ id, label }) => ({ kind: 'victoryStyle' as const, id, label, description: `${label} victory pose and expression.`, entitlementId: `victory-style:${id}`, price: 150 })),
  ...PLAYER_ACCESSORIES.filter(({ id }) => !FREE_APPEARANCE_IDS.accessory.has(id)).map(({ id, label }) => ({ kind: 'accessory' as const, id, label, description: `${label} for your player.`, entitlementId: `accessory:${id}`, price: 110 })),
]

export const PURCHASABLE_COSMETICS = [
  ...WEAPON_ORDER.flatMap((weaponId) => WEAPON_SKINS.filter(({ id }) => id !== 'standard').map((skin) => ({ ...skin, kind: 'weapon' as const, weaponId, entitlementId: weaponSkinEntitlementId(weaponId, skin.id) }))),
  ...APPEARANCE_COSMETICS,
]
