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
import { nextScheduledTurn, upcomingTurnIndices } from './turns/teamTurnOrder'
import { TerrainMask } from '../terrain/TerrainMask'
import { DEFAULT_POWER_PERCENT, FIXED_STEP_SECONDS, GRAVITY } from '../shared/constants'
import {
  WEAPONS,
  WEAPON_ORDER,
  canUseWeapon,
  consumeWeapon,
  createWeaponInventory,
  validateWeaponRegistry,
} from '../weapons/registry'
import {
  MAPS,
  MAP_ORDER,
  createMapTerrain,
  getMap,
  hasSafeSpawns,
  mapIdsForMode,
} from '../maps/registry'
import { PLAYER_COUNT_BY_MODE } from '../maps/mapDocument'
import { assessOfficialMap } from '../maps/mapAssessment'

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
      0,
    )
    expect(result.velocity).toEqual({ x: 30, y: 0 })
    expect(result.position).toEqual({ x: 25, y: 20 })
  })

  it('applies wind through the same helper used by live projectiles and the aim guide', () => {
    const initial = { position: { x: 0, y: 0 }, velocity: { x: 10, y: -20 }, radius: 5 }
    const guide = integratedTrajectory(initial, 10, 30, 0.5, 1)
    expect(guide[0]).toEqual(integrateProjectile(initial, 10, 0.5, 30))
    expect(guide[0].velocity.x).toBe(25)
  })

  it('builds a preview from the same fixed-step integration as a live rocket', () => {
    const initial = { position: { x: 0, y: 0 }, velocity: { x: 10, y: -20 }, radius: 5 }
    const preview = integratedTrajectory(initial, 10, 0, 0.5, 2)
    expect(preview[0]).toEqual(integrateProjectile(initial, 10, 0.5, 0))
    expect(preview[1].position).toEqual({ x: 10, y: -12.5 })
  })

  it('uses the live integration for a short local aim guide only', () => {
    const initial = { position: { x: 20, y: 40 }, velocity: { x: 300, y: -240 }, radius: 5 }
    const guide = integratedTrajectory(initial, GRAVITY, 25, FIXED_STEP_SECONDS, AIM_GUIDE_STEPS)
    expect(guide).toHaveLength(8)
    expect(guide[0]).toEqual(integrateProjectile(initial, GRAVITY, FIXED_STEP_SECONDS, 25))
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
    const speed = launchSpeed(WEAPONS['basic-rocket'].projectileSpeed, DEFAULT_POWER_PERCENT)
    let rocket = {
      position: { x: 192.7, y: 369.2 },
      velocity: { x: direction.x * speed, y: direction.y * speed },
      radius: 5,
    }
    while (rocket.position.x < 785) {
      rocket = integrateProjectile(rocket, GRAVITY, FIXED_STEP_SECONDS, 0)
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

  it('uses the drag direction as the firing direction', () => {
    expect(getPullVector({ x: 100, y: 100 }, { x: 60, y: 130 })).toEqual({ x: -40, y: 30 })
    expect(getFiringDirectionFromPull({ x: -10, y: 0 })).toEqual({ x: -1, y: 0 })
    expect(getFiringDirectionFromPull({ x: 10, y: 0 })).toEqual({ x: 1, y: 0 })
    const downLeft = getFiringDirectionFromPull({ x: -10, y: 10 })
    expect(downLeft?.x).toBeCloseTo(-Math.SQRT1_2)
    expect(downLeft?.y).toBeCloseTo(Math.SQRT1_2)
  })

  it('converts pull distance into clamped power', () => {
    const short = dragAim({ x: 100, y: 100 }, { x: 64, y: 100 }, 30, 100)
    const long = dragAim({ x: 100, y: 100 }, { x: 100, y: 100 + DRAG_MAX_DISTANCE * 2 }, 30, 100)
    expect(short).toMatchObject({ direction: { x: -1, y: 0 }, power: 30 })
    expect(Math.abs(short?.worldAngle ?? 0)).toBeCloseTo(180)
    expect(long?.direction.x).toBeCloseTo(0)
    expect(long?.direction.y).toBe(1)
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

  it('projects the same canonical team timeline used by the live scheduler', () => {
    const players = [
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: true },
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: true },
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: true },
    ]
    expect(upcomingTurnIndices(players, 0, [1, 0], 6)).toEqual([0, 1, 2, 3, 4, 5])
    const next = nextScheduledTurn(players, 0, [1, 0])
    expect(next).toEqual({ playerIndex: 1, cursors: [1, 1] })
  })

  it('skips eliminated players in projected and authoritative turn order', () => {
    const players = [
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: false },
      { teamId: 0 as const, alive: false },
      { teamId: 1 as const, alive: true },
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: true },
    ]
    expect(upcomingTurnIndices(players, 0, [1, 0], 4)).toEqual([0, 3, 4, 5])
  })

  it('projects complete repeated 3v3 cycles after eliminations', () => {
    const players = [
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: false },
      { teamId: 0 as const, alive: false },
      { teamId: 1 as const, alive: true },
      { teamId: 0 as const, alive: true },
      { teamId: 1 as const, alive: true },
    ]
    expect(upcomingTurnIndices(players, 0, [1, 0], 8)).toEqual([0, 3, 4, 5, 0, 3, 4, 5])
  })

  it('keeps alternating teams for every viable six-player elimination mask', () => {
    for (let mask = 0; mask < 64; mask += 1) {
      const players = Array.from({ length: 6 }, (_, index) => ({
        teamId: (index % 2) as 0 | 1,
        alive: (mask & (1 << index)) !== 0,
      }))
      const activePlayerIndex = players.findIndex((player) => player.alive)
      if (
        activePlayerIndex < 0 ||
        !players.some((player) => player.alive && player.teamId === 0) ||
        !players.some((player) => player.alive && player.teamId === 1)
      )
        continue
      const turns = upcomingTurnIndices(players, activePlayerIndex, [0, 0], 18)
      expect(turns).toHaveLength(18)
      expect(turns.every((index) => players[index].alive)).toBe(true)
      for (let index = 1; index < turns.length; index += 1)
        expect(players[turns[index]].teamId).not.toBe(players[turns[index - 1]].teamId)
    }
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
  it('gives each player an independent finite inventory while keeping rockets unlimited', () => {
    const first = createWeaponInventory()
    const second = createWeaponInventory()
    expect(first['basic-rocket']).toBe('unlimited')
    expect(first['timed-grenade']).toBe(3)
    const used = consumeWeapon(first, 'timed-grenade')
    expect(used['timed-grenade']).toBe(2)
    expect(second['timed-grenade']).toBe(3)
    expect(consumeWeapon(first, 'basic-rocket')['basic-rocket']).toBe('unlimited')
    expect(consumeWeapon({ ...first, 'timed-grenade': 0 }, 'timed-grenade')['timed-grenade']).toBe(0)
    expect(canUseWeapon({ ...first, teleporter: 0 }, 'teleporter')).toBe(false)
  })

  it('defines all fourteen arsenal entries with configured behaviour', () => {
    expect(validateWeaponRegistry()).toBe(true)
    expect(Object.keys(WEAPONS)).toEqual(WEAPON_ORDER)
    expect(WEAPON_ORDER).toHaveLength(14)
    expect(WEAPONS['timed-grenade'].projectileSpeed).toBeGreaterThan(0)
    expect(WEAPONS['scatter-shot'].blastRadius).toBe(0)
    expect(WEAPONS['cluster-charge'].terrainRadius).toBeGreaterThan(0)
    expect(WEAPONS['pocket-knife'].mechanic).toBe('melee')
    expect(WEAPONS['bomb-beacon'].beaconBombCount).toBe(3)
    expect(WEAPONS['fork-rocket'].mechanic).toBe('remote-split')
    expect(WEAPONS['old-shoe'].knockbackForce).toBeGreaterThan(WEAPONS['basic-rocket'].knockbackForce)
    expect(WEAPONS['siege-bazooka'].terrainRadius).toBeGreaterThan(
      WEAPONS['basic-rocket'].terrainRadius,
    )
    expect(WEAPONS['cryo-shot'].freezeTurns).toBe(1)
    expect(WEAPONS.teleporter.aimMode).toBe('target-position')
  })
})

describe('maps', () => {
  it('registers the deterministic twelve-map roster with four safe maps per mode', () => {
    expect(MAP_ORDER).toEqual([
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
    ])
    expect(new Set(MAP_ORDER).size).toBe(12)
    expect(mapIdsForMode('1v1')).toHaveLength(4)
    expect(mapIdsForMode('2v2')).toHaveLength(4)
    expect(mapIdsForMode('3v3')).toHaveLength(4)
    for (const id of MAP_ORDER) {
      const map = MAPS[id]
      expect(map.displayName.length).toBeGreaterThan(0)
      expect(map.spawnPoints).toHaveLength(PLAYER_COUNT_BY_MODE[map.mode])
      expect(hasSafeSpawns(map)).toBe(true)
      const terrain = createMapTerrain(map)
      for (const spawn of map.spawnPoints) expect(terrain.surfaceY(spawn.x)).not.toBeNull()
    }
    expect(getMap('crater-basin').id).toBe('rolling-hills')
    expect(MAPS['ruined-foundry']).toMatchObject({ revision: 2 })
    expect(MAPS['ruined-foundry'].objects).toHaveLength(2)
    const reflectors = MAPS['ruined-foundry'].objects.filter(
      (object) => object.type === 'reflector-wall',
    )
    const [left, right] = reflectors
    expect(left.id < right.id).toBe(true)
    expect(left.start.x + right.end.x).toBe(1440)
    expect(left.end.x + right.start.x).toBe(1440)
    expect(left.start.y).toBe(right.end.y)
    expect(left.end.y).toBe(right.start.y)
    expect(MAP_ORDER.filter((id) => MAPS[id].objects.length > 0)).toEqual([
      'twin-peaks',
      'ruined-foundry',
    ])
  })

  it('passes every official map through the shared balance assessment', () => {
    for (const id of MAP_ORDER) {
      const assessment = assessOfficialMap(MAPS[id])
      expect(assessment.issues, id).toEqual([])
      expect(assessment.metrics.minimumSpawnDistance, id).toBeGreaterThan(60)
    }
  })
})
