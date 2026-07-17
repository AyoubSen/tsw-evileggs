import type { SemanticPalette } from '../game/weaponVisualRecipes'
import type { WeaponId } from '../weapons/registry'

export const COSMETIC_LOADOUT_VERSION = 1 as const

export const WEAPON_SKINS = [
  { id: 'standard', label: 'Workshop Standard', description: 'Fresh from the toybox.', entitlementId: null, price: 0 },
  { id: 'sunset-brass', label: 'Sunset Brass', description: 'Warm brass with a molten glow.', entitlementId: 'weapon-skin:sunset-brass', price: 40 },
  { id: 'void-royal', label: 'Void Royal', description: 'Deep violet wrapped in ion teal.', entitlementId: 'weapon-skin:void-royal', price: 70 },
  { id: 'hazard-pop', label: 'Hazard Pop', description: 'Safety black with loud candy accents.', entitlementId: 'weapon-skin:hazard-pop', price: 55 },
  { id: 'royal-icing', label: 'Royal Icing', description: 'Porcelain white, cobalt trim, gold details.', entitlementId: 'weapon-skin:royal-icing', price: 65 },
  { id: 'deep-sea', label: 'Deep Sea', description: 'Submarine steel lit by cold bioluminescence.', entitlementId: 'weapon-skin:deep-sea', price: 60 },
  { id: 'candy-circuit', label: 'Candy Circuit', description: 'Bubblegum hardware with electric sprinkles.', entitlementId: 'weapon-skin:candy-circuit', price: 50 },
  { id: 'scrapyard', label: 'Scrapyard', description: 'Rust, patched steel, and stubborn machinery.', entitlementId: 'weapon-skin:scrapyard', price: 45 },
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

export const PURCHASABLE_COSMETICS = WEAPON_SKINS.filter(
  (skin) => skin.entitlementId !== null,
)

export type WeaponSkinId = typeof WEAPON_SKINS[number]['id']
export type ProjectileSkinId = typeof PROJECTILE_SKINS[number]['id']
export type CosmeticLoadout = {
  version: typeof COSMETIC_LOADOUT_VERSION
  weaponSkin: WeaponSkinId
  projectileSkin: ProjectileSkinId
}

export const DEFAULT_COSMETIC_LOADOUT: CosmeticLoadout = {
  version: COSMETIC_LOADOUT_VERSION,
  weaponSkin: 'standard',
  projectileSkin: 'standard',
}

export function sanitizeCosmeticLoadout(value: unknown): CosmeticLoadout {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    version: COSMETIC_LOADOUT_VERSION,
    weaponSkin: WEAPON_SKINS.some(({ id }) => id === source.weaponSkin) ? source.weaponSkin as WeaponSkinId : 'standard',
    projectileSkin: PROJECTILE_SKINS.some(({ id }) => id === source.projectileSkin) ? source.projectileSkin as ProjectileSkinId : 'standard',
  }
}

export function isCosmeticOwned(
  kind: 'weapon' | 'projectile',
  skinId: WeaponSkinId | ProjectileSkinId,
  entitlements: ReadonlySet<string> | readonly string[],
): boolean {
  const skin = (kind === 'weapon' ? WEAPON_SKINS : PROJECTILE_SKINS).find(({ id }) => id === skinId)
  if (!skin || skin.entitlementId === null) return skin !== undefined
  return Array.isArray(entitlements)
    ? entitlements.includes(skin.entitlementId)
    : (entitlements as ReadonlySet<string>).has(skin.entitlementId)
}

export function entitlementAwareLoadout(loadout: CosmeticLoadout, entitlements: readonly string[]): CosmeticLoadout {
  return {
    ...loadout,
    weaponSkin: isCosmeticOwned('weapon', loadout.weaponSkin, entitlements) ? loadout.weaponSkin : 'standard',
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
  loadout: Pick<CosmeticLoadout, 'weaponSkin' | 'projectileSkin'>,
): SemanticPalette {
  return applyWeaponSkin(palette, loadout.weaponSkin)
}
