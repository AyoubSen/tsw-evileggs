import { describe, expect, it } from 'vitest'
import { aimDirection, launchSpeed, launchVelocity } from './aim/aim'
import { explosionFalloff, knockbackVelocity } from './damage/explosion'
import {
  AIM_GUIDE_STEPS,
  canvasPointToWorld,
  canJump,
  dragAim,
  getFiringDirectionFromPull,
  getPowerFromPullDistance,
  getPullVector,
  isJumpCode,
  movementDirection,
  DRAG_MAX_DISTANCE,
} from './input/controls'
import { integrateProjectile, integratedTrajectory } from './projectile/integrate'
import {
  advanceTurnTimer,
  canAcceptPlayerInput,
  hasTurnExpired,
  nextActivePlayerIndex,
  nextTurnPhase,
  winningCharacterIndex,
} from './turns/turnMachine'
import { TerrainMask } from '../terrain/TerrainMask'
import { DEFAULT_POWER_PERCENT, FIXED_STEP_SECONDS, GRAVITY } from '../shared/constants'
import { BASIC_ROCKET, validateWeapon } from '../weapons/basicRocket'
import { WEAPONS, canUseWeapon, consumeWeapon, createWeaponInventory } from '../weapons/registry'
import { MAPS, MAP_ORDER, createMapTerrain, getMap, hasSafeSpawns } from '../maps/registry'

describe('explosions', () => {
  it('uses linear damage falloff and no damage outside the blast', () => {
    expect(explosionFalloff(100, 50, 0)).toBe(100)
    expect(explosionFalloff(100, 50, 25)).toBe(50)
    expect(explosionFalloff(100, 50, 50)).toBe(0)
  })

  it('knocks targets away from the explosion', () => {
    const velocity = knockbackVelocity({ x: 0, y: 0 }, { x: 20, y: 0 }, 100, 50)
    expect(velocity.x).toBeGreaterThan(0)
    expect(velocity.y).toBeLessThan(0)
  })
})

describe('projectile integration', () => {
  it('applies gravity before moving during a fixed step', () => {
    const result = integrateProjectile(
      { position: { x: 10, y: 20 }, velocity: { x: 30, y: -10 }, radius: 5 },
      20,
      0.5,
    )
    expect(result.velocity).toEqual({ x: 30, y: 0 })
    expect(result.position).toEqual({ x: 25, y: 20 })
  })

  it('builds a preview from the same fixed-step integration as a live rocket', () => {
    const initial = { position: { x: 0, y: 0 }, velocity: { x: 10, y: -20 }, radius: 5 }
    const preview = integratedTrajectory(initial, 10, 0.5, 2)
    expect(preview[0]).toEqual(integrateProjectile(initial, 10, 0.5))
    expect(preview[1].position).toEqual({ x: 10, y: -12.5 })
  })

  it('uses the live integration for a short local aim guide only', () => {
    const initial = { position: { x: 20, y: 40 }, velocity: { x: 300, y: -240 }, radius: 5 }
    const guide = integratedTrajectory(initial, GRAVITY, FIXED_STEP_SECONDS, AIM_GUIDE_STEPS)
    expect(guide).toHaveLength(8)
    expect(guide[0]).toEqual(integrateProjectile(initial, GRAVITY, FIXED_STEP_SECONDS))
  })
})

describe('aiming', () => {
  it('uses elevation above the facing-relative horizon', () => {
    expect(aimDirection(0, 1)).toEqual({ x: 1, y: -0 })
    expect(aimDirection(0, -1)).toEqual({ x: -1, y: -0 })
    expect(aimDirection(90, 1).x).toBeCloseTo(0)
    const leftArc = aimDirection(45, -1)
    expect(leftArc.x).toBeCloseTo(-Math.SQRT1_2)
    expect(leftArc.y).toBeCloseTo(-Math.SQRT1_2)
  })

  it('scales launch speed directly with selected power', () => {
    expect(launchSpeed(950, 30)).toBe(285)
    expect(launchSpeed(950, 100)).toBe(950)
  })

  it('creates launch velocity from the same direction and power used by preview and firing', () => {
    expect(launchVelocity({ x: 0.6, y: -0.8 }, 950, 50)).toEqual({ x: 285, y: -380 })
  })

  it('can carry the default facing-right shot to the opposing spawn', () => {
    const direction = aimDirection(45, 1)
    const speed = launchSpeed(BASIC_ROCKET.projectileSpeed, DEFAULT_POWER_PERCENT)
    let rocket = {
      position: { x: 192.7, y: 369.2 },
      velocity: { x: direction.x * speed, y: direction.y * speed },
      radius: 5,
    }
    while (rocket.position.x < 785) {
      rocket = integrateProjectile(rocket, GRAVITY, FIXED_STEP_SECONDS)
    }
    expect(rocket.position.y).toBeGreaterThan(365)
    expect(rocket.position.y).toBeLessThan(390)
  })
})

describe('input controls', () => {
  it('accepts AZERTY and QWERTY physical key aliases', () => {
    expect(movementDirection(new Set(['KeyQ']))).toBe(-1)
    expect(movementDirection(new Set(['KeyA']))).toBe(-1)
    expect(movementDirection(new Set(['KeyD']))).toBe(1)
    expect(movementDirection(new Set(['KeyA', 'KeyD']))).toBe(0)
    expect(isJumpCode('KeyZ')).toBe(true)
    expect(isJumpCode('KeyW')).toBe(true)
    expect(isJumpCode('Space')).toBe(false)
  })

  it('turns a pull-back drag into the opposite firing direction', () => {
    expect(getPullVector({ x: 100, y: 100 }, { x: 60, y: 130 })).toEqual({ x: -40, y: 30 })
    expect(getFiringDirectionFromPull({ x: -10, y: 0 })).toEqual({ x: 1, y: -0 })
    expect(getFiringDirectionFromPull({ x: 10, y: 0 })).toEqual({ x: -1, y: -0 })
    const downLeft = getFiringDirectionFromPull({ x: -10, y: 10 })
    expect(downLeft?.x).toBeCloseTo(Math.SQRT1_2)
    expect(downLeft?.y).toBeCloseTo(-Math.SQRT1_2)
  })

  it('converts pull distance into clamped power', () => {
    const short = dragAim({ x: 100, y: 100 }, { x: 64, y: 100 }, 30, 100)
    const long = dragAim({ x: 100, y: 100 }, { x: 100, y: 100 + DRAG_MAX_DISTANCE * 2 }, 30, 100)
    expect(short).toMatchObject({ direction: { x: 1, y: -0 }, power: 30 })
    expect(short?.worldAngle).toBeCloseTo(0)
    expect(long?.direction.x).toBeCloseTo(0)
    expect(long?.direction.y).toBe(-1)
    expect(long?.power).toBe(100)
    expect(dragAim({ x: 0, y: 0 }, { x: 10, y: 0 }, 30, 100)).toBeNull()
    expect(getPowerFromPullDistance(DRAG_MAX_DISTANCE * 2, 30, 100)).toBe(100)
  })

  it('maps responsive canvas client coordinates into logical world coordinates', () => {
    expect(
      canvasPointToWorld(510, 270, { left: 10, top: 20, width: 1000, height: 500 }, 960, 540),
    ).toEqual({
      x: 480,
      y: 270,
    })
  })

  it('allows a jump only during the active grounded input phase after key release', () => {
    expect(canJump('input', true, true)).toBe(true)
    expect(canJump('input', false, true)).toBe(false)
    expect(canJump('input', true, false)).toBe(false)
    expect(canJump('projectile', true, true)).toBe(false)
  })
})

describe('turn machine', () => {
  it('waits for settling and recognizes a sole survivor', () => {
    expect(nextTurnPhase('projectile', false, false)).toBe('settling')
    expect(nextTurnPhase('settling', false, false)).toBe('settling')
    expect(nextTurnPhase('settling', true, false)).toBe('input')
    expect(nextTurnPhase('input', false, true)).toBe('victory')
    expect(winningCharacterIndex([false, true])).toBe(1)
    expect(winningCharacterIndex([false, false])).toBeNull()
  })

  it('accepts player input only during the active input phase', () => {
    expect(canAcceptPlayerInput('input')).toBe(true)
    expect(canAcceptPlayerInput('projectile')).toBe(false)
    expect(canAcceptPlayerInput('settling')).toBe(false)
    expect(canAcceptPlayerInput('expired')).toBe(false)
    expect(canAcceptPlayerInput('victory')).toBe(false)
  })

  it('counts down only during input and expires without firing', () => {
    expect(advanceTurnTimer('input', 30, 0.5)).toBe(29.5)
    expect(advanceTurnTimer('projectile', 12, 5)).toBe(12)
    expect(advanceTurnTimer('input', 0.2, 1)).toBe(0)
    expect(hasTurnExpired('input', 0)).toBe(true)
    expect(hasTurnExpired('projectile', 0)).toBe(false)
    expect(nextActivePlayerIndex(0, 2)).toBe(1)
    expect(nextActivePlayerIndex(1, 2)).toBe(0)
  })
})

describe('terrain mask', () => {
  it('subtracts a circular region while preserving distant cells', () => {
    const terrain = new TerrainMask(20, 20, 1)
    terrain.fillBelow(() => 0)
    terrain.removeCircle(10, 10, 4)
    expect(terrain.isSolid(10, 10)).toBe(false)
    expect(terrain.isSolid(13, 10)).toBe(false)
    expect(terrain.isSolid(15, 10)).toBe(true)
  })
})

describe('weapons', () => {
  it('accepts the prototype rocket and rejects invalid definitions', () => {
    expect(validateWeapon(BASIC_ROCKET)).toBe(true)
    expect(validateWeapon({ ...BASIC_ROCKET, blastRadius: 0 })).toBe(false)
  })

  it('gives each player an independent finite inventory while keeping rockets unlimited', () => {
    const first = createWeaponInventory()
    const second = createWeaponInventory()
    expect(first['basic-rocket']).toBe('unlimited')
    expect(first['timed-grenade']).toBe(3)
    const used = consumeWeapon(first, 'timed-grenade')
    expect(used['timed-grenade']).toBe(2)
    expect(second['timed-grenade']).toBe(3)
    expect(consumeWeapon(first, 'basic-rocket')['basic-rocket']).toBe('unlimited')
    expect(canUseWeapon({ ...first, teleporter: 0 }, 'teleporter')).toBe(false)
  })

  it('defines five distinct arsenal entries with configured behaviour', () => {
    expect(Object.keys(WEAPONS)).toHaveLength(5)
    expect(WEAPONS['timed-grenade'].projectileSpeed).toBeGreaterThan(0)
    expect(WEAPONS['scatter-shot'].blastRadius).toBe(0)
    expect(WEAPONS['cluster-charge'].terrainRadius).toBeGreaterThan(0)
    expect(WEAPONS.teleporter.aimMode).toBe('target-position')
  })
})

describe('maps', () => {
  it('registers four distinct maps with safe supported spawns and fallback lookup', () => {
    expect(MAP_ORDER).toHaveLength(4)
    expect(new Set(MAP_ORDER).size).toBe(4)
    for (const id of MAP_ORDER) {
      const map = MAPS[id]
      expect(map.displayName.length).toBeGreaterThan(0)
      expect(map.spawnPoints).toHaveLength(2)
      expect(hasSafeSpawns(map)).toBe(true)
      const terrain = createMapTerrain(map)
      expect(terrain.surfaceY(map.spawnPoints[0])).not.toBeNull()
      expect(terrain.surfaceY(map.spawnPoints[1])).not.toBeNull()
    }
    expect(getMap('missing-map').id).toBe('rolling-hills')
  })
})
