import { describe, expect, it } from 'vitest'
import { WEAPON_ORDER, type WeaponId } from '../weapons/registry'
import {
  WEAPON_PRESENTATIONS,
  getWeaponMotionPolicy,
  getWeaponPresentation,
  heldWeaponHandedness,
  normalizeDirection,
  perpendicular,
  transformLocalPoint,
  weaponModelScale,
} from './weaponPresentation'

const isColor = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffff

describe('weapon presentation registry', () => {
  it('is exhaustive for the current weapon order', () => {
    expect(Object.keys(WEAPON_PRESENTATIONS).sort()).toEqual([...WEAPON_ORDER].sort())
    for (const id of WEAPON_ORDER) expect(getWeaponPresentation(id)).toBe(WEAPON_PRESENTATIONS[id])
  })

  it('contains valid finite geometry, timings, trails, and colors', () => {
    for (const id of WEAPON_ORDER) {
      const presentation = getWeaponPresentation(id)
      const positiveDimensions = [presentation.body.length, presentation.body.width]
      const signedCoordinates = [
        presentation.grip.x,
        presentation.grip.y,
        presentation.muzzle.x,
        presentation.muzzle.y,
      ]
      const nonnegativeValues = [
        presentation.restElevation,
        presentation.recoil.durationMs,
        presentation.recoil.distance,
        presentation.trail.sampleCount,
        presentation.trail.width,
      ]
      const colors = [
        presentation.colors.primary,
        presentation.colors.accent,
        presentation.colors.flash,
        presentation.colors.impact,
        presentation.trail.color,
      ]

      expect(positiveDimensions.every((value) => Number.isFinite(value) && value > 0)).toBe(true)
      expect(signedCoordinates.every(Number.isFinite)).toBe(true)
      expect(nonnegativeValues.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
      expect(Number.isSafeInteger(presentation.trail.sampleCount)).toBe(true)
      expect(colors.every(isColor)).toBe(true)
    }
  })

  it('gives every weapon a distinct held identity and launched weapons distinct projectiles', () => {
    const heldModels = WEAPON_ORDER.map((id) => getWeaponPresentation(id).heldModel)
    const launchedWeapons: WeaponId[] = [
      'basic-rocket',
      'precision-cannon',
      'high-arc-mortar',
      'timed-grenade',
      'scatter-shot',
      'cluster-charge',
      'terrain-boring-drill',
      'bomb-beacon',
      'fork-rocket',
      'old-shoe',
      'siege-bazooka',
      'cryo-shot',
    ]
    const projectileModels = launchedWeapons.map(
      (id) => getWeaponPresentation(id).projectileModel,
    )

    expect(new Set(heldModels).size).toBe(WEAPON_ORDER.length)
    expect(projectileModels).not.toContain('none')
    expect(new Set(projectileModels).size).toBe(launchedWeapons.length)
    for (const id of ['deployable-mine', 'pocket-knife', 'teleporter'] as const)
      expect(getWeaponPresentation(id).projectileModel).toBe('none')
  })
})

describe('weapon presentation geometry', () => {
  it('normalizes directions and uses a safe fallback', () => {
    expect(normalizeDirection({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 })
    expect(normalizeDirection({ x: 0, y: 0 }, { x: -5, y: 0 })).toEqual({ x: -1, y: 0 })
    expect(normalizeDirection({ x: Number.NaN, y: 1 }, { x: 0, y: 0 })).toEqual({
      x: 1,
      y: 0,
    })
    expect(normalizeDirection({ x: Number.MAX_VALUE, y: Number.MAX_VALUE })).toEqual({
      x: 1,
      y: 0,
    })
  })

  it('rotates perpendiculars and transforms local points in the aim basis', () => {
    expect(perpendicular({ x: 3, y: 4 })).toEqual({ x: -4, y: 3 })
    expect(
      transformLocalPoint({ x: 10, y: 20 }, { x: 0, y: 2 }, { x: 4, y: 3 }),
    ).toEqual({ x: 7, y: 24 })
  })

  it('mirrors held geometry while keeping the authoritative muzzle distance', () => {
    expect(heldWeaponHandedness({ x: 1, y: 0 }, -1)).toBe(1)
    expect(heldWeaponHandedness({ x: -1, y: 0 }, 1)).toBe(-1)
    expect(heldWeaponHandedness({ x: 0, y: -1 }, -1)).toBe(-1)
    for (const id of WEAPON_ORDER)
      expect(getWeaponPresentation(id).muzzle.x * weaponModelScale(id)).toBeCloseTo(24)
  })
})

describe('weapon motion policy', () => {
  it('preserves configured motion when reduced motion is disabled', () => {
    const presentation = getWeaponPresentation('basic-rocket')
    const policy = getWeaponMotionPolicy('basic-rocket', false)

    expect(policy.recoilDurationMs).toBe(presentation.recoil.durationMs)
    expect(policy.recoilDistance).toBe(presentation.recoil.distance)
    expect(policy.trailSampleCount).toBe(presentation.trail.sampleCount)
    expect(policy.trailWidth).toBe(presentation.trail.width)
    expect(policy.pulse).toBe(true)
    expect(policy.transientDurationMs(240)).toBe(240)
  })

  it('suppresses unsafe motion while retaining explicitly safe static trails', () => {
    const rocketPolicy = getWeaponMotionPolicy('basic-rocket', true)
    const scatterPolicy = getWeaponMotionPolicy('scatter-shot', true)

    expect(rocketPolicy.recoilDurationMs).toBe(0)
    expect(rocketPolicy.recoilDistance).toBe(0)
    expect(rocketPolicy.trailSampleCount).toBe(1)
    expect(rocketPolicy.pulse).toBe(false)
    expect(rocketPolicy.transientDurationMs(240)).toBe(80)
    expect(rocketPolicy.transientDurationMs(Number.POSITIVE_INFINITY)).toBe(0)
    expect(scatterPolicy.trailSampleCount).toBe(
      getWeaponPresentation('scatter-shot').trail.sampleCount,
    )
    expect(scatterPolicy.transientDurationMs(240)).toBe(240)
  })
})
