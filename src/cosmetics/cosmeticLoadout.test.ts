import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COSMETIC_LOADOUT,
  applyProjectileSkin,
  applyHeldObjectSkin,
  applyWeaponSkin,
  entitlementAwareLoadout,
  isCosmeticOwned,
  sanitizeCosmeticLoadout,
} from './cosmeticLoadout'
import { resolveWeaponPalette } from '../game/weaponVisualRecipes'

describe('cosmetic loadouts', () => {
  it('sanitizes unknown cosmetic identifiers to presentation defaults', () => {
    expect(sanitizeCosmeticLoadout({ weaponSkin: 'future', projectileSkin: 'missing' }))
      .toEqual(DEFAULT_COSMETIC_LOADOUT)
  })

  it('requires entitlements for premium finishes and preserves free finishes', () => {
    expect(isCosmeticOwned('weapon', 'standard', [])).toBe(true)
    expect(isCosmeticOwned('weapon', 'sunset-brass', [])).toBe(false)
    expect(isCosmeticOwned('weapon', 'sunset-brass', ['weapon-skin:basic-rocket:sunset-brass'], 'basic-rocket')).toBe(true)
    expect(entitlementAwareLoadout({ version: 2, weaponSkins: { 'basic-rocket': 'sunset-brass' }, projectileSkin: 'plasma-mint' }, []))
      .toMatchObject({ weaponSkins: { 'basic-rocket': 'standard' }, projectileSkin: 'standard' })
  })

  it('changes palette roles without changing visual recipes or gameplay data', () => {
    const base = resolveWeaponPalette('basic-rocket')
    expect(applyWeaponSkin(base, 'sunset-brass')).toMatchObject({ primary: 0x6f351f, accent: 0xffc857 })
    expect(applyProjectileSkin(base, 'plasma-mint')).toMatchObject({ trail: 0x64ffd2, impact: 0x26e6b1 })
    expect(applyWeaponSkin(base, 'void-royal')).toMatchObject({ primary: 0x3b1d6b, accent: 0x36e1dc })
    expect(applyWeaponSkin(base, 'hazard-pop')).toMatchObject({ accent: 0xdfff00, flash: 0xff3da5 })
    expect(applyProjectileSkin(base, 'solar-flare')).toMatchObject({ trail: 0xffc857, impact: 0xff4d00 })
    expect(applyProjectileSkin(base, 'ghost-ion')).toMatchObject({ trail: 0xd8ccff, impact: 0x9d7bff })
    expect(resolveWeaponPalette('basic-rocket')).toBe(base)
  })

  it('uses the selected finish for each held weapon', () => {
    const base = resolveWeaponPalette('old-shoe')
    const loadout = { version: 2 as const, weaponSkins: { 'old-shoe': 'hazard-pop' as const }, projectileSkin: 'ghost-ion' as const }
    expect(applyHeldObjectSkin(base, 'old-shoe', loadout))
      .toEqual(applyWeaponSkin(base, 'hazard-pop'))
    expect(applyHeldObjectSkin(base, 'basic-rocket', loadout))
      .toEqual(base)
  })
})
