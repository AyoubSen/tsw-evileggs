import { describe, expect, it } from 'vitest'
import { MatchSimulation, reconstructTerrain } from './MatchSimulation'
import type { MatchCommand, MatchCommandInput } from './MatchCommand'
import { SIMULATION_HZ } from './MatchState'
import {
  deserializeMatchState,
  matchStateChecksum,
  restoreMatchSimulation,
  serializeMatchState,
} from '../serialization/matchSerialization'
import { replayChecksum, replayMatch, type MatchReplay } from '../replay/replay'
import { TERRAIN_MATERIAL } from '../../terrain/materials'
import { getMap } from '../../maps/registry'
import type { SimProjectile } from './MatchState'
import { DEFAULT_PLAYER_APPEARANCES } from '../../players/appearanceRegistry'

const config = {
  mode: '1v1' as const,
  playerNames: ['Lumen', 'Morrow'] as const,
  playerAppearances: DEFAULT_PLAYER_APPEARANCES.slice(0, 2),
  mapId: 'rolling-hills' as const,
  projectileBoundaryMode: 'open' as const,
  turnDurationSeconds: 30 as const,
}

function command(
  simulation: MatchSimulation,
  value: MatchCommandInput,
  sequence = simulation.state.lastCommandSequence + 1,
): MatchCommand {
  return {
    ...value,
    sequence,
    expectedTurn: simulation.state.turnNumber,
    playerId: simulation.activePlayer.id,
  } as MatchCommand
}

function fireDown(
  simulation: MatchSimulation,
  sequence = simulation.state.lastCommandSequence + 1,
) {
  return simulation.applyCommand(
    command(
      simulation,
      {
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: { x: 0, y: 1 }, power: 30 },
      },
      sequence,
    ),
  )
}

function placeActiveProjectileNextToPlayer(simulation: MatchSimulation, playerIndex: number): void {
  const projectile = simulation.state.projectiles[0]
  const target = simulation.state.players[playerIndex]
  projectile.position = {
    x: target.position.x - target.radius - projectile.radius - 1,
    y: target.position.y,
  }
  projectile.velocity = { x: 120, y: 0 }
}

function placeActiveProjectileInTerrain(simulation: MatchSimulation, x = 400): void {
  const projectile = simulation.state.projectiles[0]
  projectile.position = { x, y: simulation.getTerrain().surfaceY(x)! }
  projectile.velocity = { x: 0, y: 0 }
}

describe('authoritative commands', () => {
  it('rejects non-active players, invalid power, duplicate fire, and stale turns', () => {
    const simulation = new MatchSimulation(config)
    const nonActiveMove = {
      ...command(simulation, { type: 'move', direction: -1, pressed: true }),
      playerId: 'player-2',
    }
    expect(simulation.applyCommand(nonActiveMove)).toMatchObject({
      accepted: false,
      reason: 'not-active-player',
    })
    const nonActiveFire = {
      ...command(simulation, {
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: { x: -1, y: 0 }, power: 50 },
      }),
      playerId: 'player-2',
    }
    expect(simulation.applyCommand(nonActiveFire)).toMatchObject({
      accepted: false,
      reason: 'not-active-player',
    })
    expect(
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'directional', aimDirection: { x: 1, y: 0 }, power: 101 },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'invalid-power' })
    expect(fireDown(simulation).accepted).toBe(true)
    expect(fireDown(simulation)).toMatchObject({
      accepted: false,
      reason: 'match-not-accepting-input',
    })

    const timeout = new MatchSimulation({ ...config, turnDurationSeconds: 20 })
    const oldTurn = timeout.state.turnNumber
    timeout.step(20 * SIMULATION_HZ + 43)
    expect(timeout.state.turnNumber).toBeGreaterThan(oldTurn)
    const stale = { ...command(timeout, { type: 'jump' }), expectedTurn: oldTurn }
    expect(timeout.applyCommand(stale)).toMatchObject({ accepted: false, reason: 'stale-turn' })
  })

  it('rejects an invalid Teleporter target without consuming ammunition', () => {
    const simulation = new MatchSimulation(config)
    expect(
      simulation.applyCommand(
        command(simulation, { type: 'select-weapon', weaponId: 'teleporter' }),
      ).accepted,
    ).toBe(true)
    const before = simulation.activePlayer.inventory.teleporter
    expect(
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'target-position', target: { x: -10, y: 20 } },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'invalid-target' })
    expect(simulation.activePlayer.inventory.teleporter).toBe(before)

    const empty = new MatchSimulation(config)
    empty.activePlayer.inventory.teleporter = 0
    expect(
      empty.applyCommand(command(empty, { type: 'select-weapon', weaponId: 'teleporter' })),
    ).toMatchObject({ accepted: false, reason: 'no-ammunition' })
  })
})

describe('fixed-step timing', () => {
  it('decrements input time, freezes while paused, and stops timer after firing', () => {
    const simulation = new MatchSimulation(config)
    simulation.step(60)
    expect(simulation.timerRemainingSeconds).toBe(29)
    simulation.setPaused(true)
    simulation.step(120)
    expect(simulation.timerRemainingSeconds).toBe(29)
    simulation.setPaused(false)
    fireDown(simulation)
    const remaining = simulation.state.timerRemainingTicks
    simulation.step(5)
    expect(simulation.state.timerRemainingTicks).toBe(remaining)
  })

  it('expires and switches exactly once without racing a fire command', () => {
    const timeout = new MatchSimulation(config)
    timeout.state.timerRemainingTicks = 1
    timeout.step()
    expect(timeout.state.phase).toBe('expired')
    expect(timeout.drainEvents().filter((event) => event.type === 'turn-expired')).toHaveLength(1)
    timeout.step(42)
    expect(timeout.state.turnNumber).toBe(2)
    timeout.step(10)
    expect(timeout.state.turnNumber).toBe(2)

    const fired = new MatchSimulation(config)
    fired.state.timerRemainingTicks = 1
    expect(fireDown(fired).accepted).toBe(true)
    fired.step()
    expect(fired.drainEvents().some((event) => event.type === 'turn-expired')).toBe(false)
  })

  it('produces the same state under different render-frame chunking', () => {
    const fine = new MatchSimulation(config)
    const coarse = new MatchSimulation(config)
    fine.applyCommand(command(fine, { type: 'move', direction: 1, pressed: true }))
    coarse.applyCommand(command(coarse, { type: 'move', direction: 1, pressed: true }))
    for (let frame = 0; frame < 60; frame += 1) fine.advance(1 / 60)
    for (let frame = 0; frame < 10; frame += 1) coarse.advance(0.1)
    expect(fine.state.tick).toBe(60)
    expect(matchStateChecksum(fine.state)).toBe(matchStateChecksum(coarse.state))
  })
})

describe('framework-independent weapons', () => {
  it('reflects every physical projectile kind before weapon-specific impact handling', () => {
    const cases: Array<[SimProjectile['weaponId'], SimProjectile['kind']]> = [
      ['basic-rocket', 'primary'],
      ['precision-cannon', 'primary'],
      ['high-arc-mortar', 'primary'],
      ['timed-grenade', 'primary'],
      ['cluster-charge', 'primary'],
      ['cluster-charge', 'cluster-child'],
      ['terrain-boring-drill', 'primary'],
      ['bomb-beacon', 'primary'],
      ['bomb-beacon', 'beacon-bomb'],
      ['fork-rocket', 'primary'],
      ['fork-rocket', 'fork-child'],
      ['old-shoe', 'primary'],
      ['siege-bazooka', 'primary'],
      ['cryo-shot', 'primary'],
    ]
    const map = getMap('ruined-foundry')
    const object = map.objects[0]
    const dx = object.end.x - object.start.x
    const dy = object.end.y - object.start.y
    const length = Math.hypot(dx, dy)
    const normal = { x: -dy / length, y: dx / length }
    const midpoint = {
      x: (object.start.x + object.end.x) / 2,
      y: (object.start.y + object.end.y) / 2,
    }

    for (const [weaponId, kind] of cases) {
      const simulation = new MatchSimulation({
        mode: '2v2',
        playerNames: ['A', 'B', 'C', 'D'],
        mapId: 'ruined-foundry',
        turnDurationSeconds: 30,
      })
      simulation.state.phase = 'projectile'
      simulation.state.wind = 0
      simulation.state.projectiles = [{
        id: 'projectile-test',
        actionId: 'action-test',
        ownerId: 'player-1',
        weaponId,
        kind,
        position: { x: midpoint.x + normal.x * 30, y: midpoint.y + normal.y * 30 },
        velocity: { x: -normal.x * 2400, y: -normal.y * 2400 },
        radius: weaponId === 'terrain-boring-drill' || kind === 'beacon-bomb' ? 6 : kind === 'primary' ? 5 : 4,
        fuseTicks: weaponId === 'timed-grenade' ? 120 : 0,
      }]
      simulation.step()
      expect(simulation.state.projectiles, `${weaponId}:${kind}`).toHaveLength(1)
      expect(simulation.state.projectiles[0].id).toBe('projectile-test')
      expect(simulation.state.beacons).toHaveLength(0)
      expect(simulation.state.terrainOperations).toHaveLength(0)
      const event = simulation.drainEvents().find((candidate) => candidate.type === 'projectile-reflected')
      expect(event).toMatchObject({ objectId: object.id, projectileId: 'projectile-test' })
      expect(
        simulation.state.projectiles[0].velocity.x * normal.x +
          simulation.state.projectiles[0].velocity.y * normal.y,
      ).toBeGreaterThan(0)
    }
  })

  it('resolves rocket and grenade terrain destruction inside simulation', () => {
    for (const weaponId of ['basic-rocket', 'timed-grenade'] as const) {
      const simulation = new MatchSimulation(config)
      if (weaponId !== 'basic-rocket')
        simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId }))
      expect(fireDown(simulation).accepted).toBe(true)
      simulation.step(240)
      expect(simulation.state.terrainOperations.length).toBeGreaterThan(0)
      expect(simulation.state.projectiles).toHaveLength(0)
    }
  })

  it('reflects Timed Grenades from terrain walls and ceilings', () => {
    const launchedGrenade = () => {
      const simulation = new MatchSimulation(config)
      simulation.applyCommand(
        command(simulation, { type: 'select-weapon', weaponId: 'timed-grenade' }),
      )
      expect(fireDown(simulation).accepted).toBe(true)
      return simulation
    }

    const wall = launchedGrenade()
    const wallTerrain = wall.getTerrain()
    const wallCellX = Math.floor(400 / wallTerrain.scale)
    for (let y = 0; y < wallTerrain.height; y += 1)
      wallTerrain.cells[y * wallTerrain.width + wallCellX] = TERRAIN_MATERIAL.soil
    wall.state.projectiles[0].position = { x: 397, y: 100 }
    wall.state.projectiles[0].velocity = { x: 300, y: 0 }
    wall.step()
    expect(wall.state.projectiles[0].velocity.x).toBeLessThan(0)
    expect(wall.state.projectiles[0].position.x).toBeLessThan(400)

    const ceiling = launchedGrenade()
    const ceilingTerrain = ceiling.getTerrain()
    const ceilingCellY = Math.floor(80 / ceilingTerrain.scale)
    for (let x = 0; x < ceilingTerrain.width; x += 1)
      ceilingTerrain.cells[ceilingCellY * ceilingTerrain.width + x] = TERRAIN_MATERIAL.soil
    ceiling.state.projectiles[0].position = { x: 400, y: 83 }
    ceiling.state.projectiles[0].velocity = { x: 0, y: -300 }
    ceiling.step()
    expect(ceiling.state.projectiles[0].velocity.y).toBeGreaterThan(0)
    expect(ceiling.state.projectiles[0].position.y).toBeGreaterThan(80)
  })

  it('resolves scatter damage and cluster children inside simulation', () => {
    const scatter = new MatchSimulation(config)
    scatter.state.players[1].position = {
      x: scatter.state.players[0].position.x + 70,
      y: scatter.state.players[0].position.y,
    }
    scatter.applyCommand(command(scatter, { type: 'select-weapon', weaponId: 'scatter-shot' }))
    scatter.applyCommand(
      command(scatter, {
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: { x: 1, y: 0 }, power: 50 },
      }),
    )
    expect(scatter.state.players[1].health).toBeLessThan(100)
    expect(scatter.state.projectiles).toHaveLength(0)

    const cluster = new MatchSimulation(config)
    cluster.applyCommand(command(cluster, { type: 'select-weapon', weaponId: 'cluster-charge' }))
    fireDown(cluster)
    cluster.step(400)
    expect(cluster.state.terrainOperations.length).toBeGreaterThan(0)
    expect(cluster.state.nextProjectileId).toBeGreaterThan(2)
  })

  it('resolves a canonical Teleporter surface target and activates it', () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId: 'teleporter' }))
    const x = 400
    const destination = simulation.resolveTeleportTarget({ x, y: 0 })
    expect(destination).toEqual({ x, y: simulation.getTerrain().surfaceY(x)! - 14 })
    expect(simulation.isValidTeleport(destination!)).toBe(true)
    expect(
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'target-position', target: destination! },
        }),
      ).accepted,
    ).toBe(true)
    expect(simulation.activePlayer.position.x).toBe(x)
    expect(simulation.activePlayer.inventory.teleporter).toBe(1)
  })

  it('gives the Precision Cannon and High-Arc Mortar distinct ballistic profiles', () => {
    const launch = (weaponId: 'precision-cannon' | 'high-arc-mortar') => {
      const simulation = new MatchSimulation(config)
      simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId }))
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'directional', aimDirection: { x: 0.8, y: -0.6 }, power: 60 },
        }),
      )
      const initial = { ...simulation.state.projectiles[0].velocity }
      simulation.step()
      return { initial, after: { ...simulation.state.projectiles[0].velocity } }
    }

    const cannon = launch('precision-cannon')
    const mortar = launch('high-arc-mortar')
    expect(cannon.initial.x).toBeGreaterThan(mortar.initial.x)
    expect(mortar.after.y - mortar.initial.y).toBeGreaterThan(
      cannon.after.y - cannon.initial.y,
    )
  })

  it('records multiple ordered terrain operations for the Terrain-Boring Drill', () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(
      command(simulation, { type: 'select-weapon', weaponId: 'terrain-boring-drill' }),
    )
    expect(fireDown(simulation).accepted).toBe(true)
    simulation.step()
    expect(simulation.state.terrainOperations.length).toBeGreaterThan(2)
    expect(
      new Set(simulation.state.terrainOperations.map((operation) => operation.sourceActionId)).size,
    ).toBe(1)
  })

  it('persists an authoritative deployed mine through a snapshot restore', () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(
      command(simulation, { type: 'select-weapon', weaponId: 'deployable-mine' }),
    )
    expect(
      simulation.applyCommand(
        command(simulation, { type: 'activate-weapon', activation: { kind: 'self' } }),
      ).accepted,
    ).toBe(true)
    expect(simulation.state.mines).toHaveLength(1)
    expect(simulation.state.nextMineId).toBe(2)

    const restored = new MatchSimulation(undefined, { snapshot: simulation.snapshot() })
    expect(restored.state.mines).toEqual(simulation.state.mines)
    expect(restored.state.nextMineId).toBe(2)
  })

  it('lets the Pocket Knife hit at close range but stops it at terrain', () => {
    const close = new MatchSimulation(config)
    const closeSurface = close.getTerrain().surfaceY(300)!
    close.state.players[0].position = { x: 300, y: closeSurface - 60 }
    close.state.players[1].position = { x: 328, y: closeSurface - 60 }
    close.applyCommand(command(close, { type: 'select-weapon', weaponId: 'pocket-knife' }))
    expect(
      close.applyCommand(
        command(close, {
          type: 'activate-weapon',
          activation: { kind: 'directional', aimDirection: { x: 1, y: 0 }, power: 50 },
        }),
      ).accepted,
    ).toBe(true)
    expect(close.state.players[1].health).toBe(64)
    expect(close.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'melee-struck',
        targetPlayerId: 'player-2',
        result: 'player',
      }),
    )

    const blocked = new MatchSimulation(config)
    const blockedSurface = blocked.getTerrain().surfaceY(400)!
    blocked.state.players[0].position = { x: 400, y: blockedSurface - 20 }
    blocked.state.players[1].position = { x: 400, y: blockedSurface + 18 }
    blocked.applyCommand(command(blocked, { type: 'select-weapon', weaponId: 'pocket-knife' }))
    blocked.applyCommand(
      command(blocked, {
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: { x: 0, y: 1 }, power: 50 },
      }),
    )
    expect(blocked.state.players[1].health).toBe(100)
    expect(blocked.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'melee-struck', targetPlayerId: null, result: 'terrain' }),
    )
  })

  it('delays a Bomb Beacon barrage and preserves the beacon in snapshots', () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId: 'bomb-beacon' }))
    expect(fireDown(simulation).accepted).toBe(true)
    placeActiveProjectileInTerrain(simulation)
    simulation.step()
    expect(simulation.state.beacons).toHaveLength(1)
    expect(simulation.state.projectiles).toHaveLength(0)

    const restored = new MatchSimulation(undefined, { snapshot: simulation.snapshot() })
    expect(restored.state.beacons).toEqual(simulation.state.beacons)
    expect(restored.state.nextBeaconId).toBe(2)
    restored.state.beacons[0].remainingTicks = 1
    restored.step()
    expect(restored.state.beacons).toHaveLength(0)
    expect(restored.state.projectiles.map((projectile) => projectile.kind)).toEqual([
      'beacon-bomb',
      'beacon-bomb',
      'beacon-bomb',
    ])
  })

  it('triggers a Fork Rocket once into two child projectiles', () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId: 'fork-rocket' }))
    expect(fireDown(simulation).accepted).toBe(true)
    expect(simulation.state.projectiles.map((projectile) => projectile.kind)).toEqual(['primary'])
    expect(simulation.applyCommand(command(simulation, { type: 'trigger-weapon' })).accepted).toBe(
      true,
    )
    expect(simulation.state.projectiles.map((projectile) => projectile.kind)).toEqual([
      'fork-child',
      'fork-child',
    ])
    expect(simulation.applyCommand(command(simulation, { type: 'trigger-weapon' }))).toMatchObject({
      accepted: false,
      reason: 'cannot-trigger',
    })
    expect(simulation.state.projectiles).toHaveLength(2)
  })

  it('resolves an Old Shoe hit with low damage and knockback', () => {
    const resolveHit = (weaponId: 'basic-rocket' | 'old-shoe') => {
      const simulation = new MatchSimulation(config)
      if (weaponId !== 'basic-rocket')
        simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId }))
      fireDown(simulation)
      placeActiveProjectileNextToPlayer(simulation, 1)
      simulation.step()
      return simulation.state.players[1]
    }
    const rocketTarget = resolveHit('basic-rocket')
    const shoeTarget = resolveHit('old-shoe')
    expect(shoeTarget.health).toBeLessThan(100)
    expect(shoeTarget.health).toBeGreaterThan(rocketTarget.health)
    expect(shoeTarget.velocity.x).toBeGreaterThan(rocketTarget.velocity.x)
  })

  it('gives the Siege Bazooka a larger terrain effect than the Basic Rocket', () => {
    const terrainRadius = (weaponId: 'basic-rocket' | 'siege-bazooka') => {
      const simulation = new MatchSimulation(config)
      if (weaponId !== 'basic-rocket')
        simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId }))
      fireDown(simulation)
      placeActiveProjectileInTerrain(simulation)
      simulation.step()
      return simulation.state.terrainOperations[0].radius
    }

    expect(terrainRadius('siege-bazooka')).toBeGreaterThan(terrainRadius('basic-rocket'))
  })

  it("locks a Cryo Shot victim's movement for their next turn but allows activation", () => {
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId: 'cryo-shot' }))
    fireDown(simulation)
    placeActiveProjectileNextToPlayer(simulation, 1)
    simulation.step()
    expect(simulation.state.players[1]).toMatchObject({
      frozenTurnsRemaining: 1,
      frozenAppliedTurn: 1,
    })

    for (const player of simulation.state.players) {
      player.position.y = simulation.getTerrain().surfaceY(player.position.x)! - player.radius
      player.velocity = { x: 0, y: 0 }
      player.grounded = true
    }
    simulation.state.settlingTicks = 0
    simulation.step(27)
    expect(simulation.state.turnNumber).toBe(2)
    expect(simulation.activePlayer.id).toBe('player-2')
    expect(
      simulation.applyCommand(command(simulation, { type: 'move', direction: 1, pressed: true })),
    ).toMatchObject({ accepted: false, reason: 'movement-locked' })
    expect(simulation.applyCommand(command(simulation, { type: 'jump' }))).toMatchObject({
      accepted: false,
      reason: 'movement-locked',
    })
    expect(fireDown(simulation).accepted).toBe(true)
  })
})

describe('terrain, snapshots, and replay', () => {
  it('records ordered operations and reconstructs exact occupancy', () => {
    const simulation = new MatchSimulation(config)
    fireDown(simulation)
    simulation.step(30)
    const operations = simulation.state.terrainOperations
    expect(operations[0]).toMatchObject({ sequence: 1, type: 'subtract-circle' })
    const reconstructed = reconstructTerrain(simulation.state.mapId, operations)
    expect([...reconstructed.cells]).toEqual([...simulation.getTerrain().cells])
  })

  it('round-trips state and continues with reconstructed terrain', () => {
    const simulation = new MatchSimulation(config, { seed: 77 })
    fireDown(simulation)
    simulation.step(20)
    const payload = serializeMatchState(simulation.state)
    expect(deserializeMatchState(payload).version).toBe(7)
    const restored = restoreMatchSimulation(payload)
    expect(matchStateChecksum(restored.state)).toBe(matchStateChecksum(simulation.state))
    expect([...restored.getTerrain().cells]).toEqual([...simulation.getTerrain().cells])
  })

  it('preserves partial fixed-step time when restoring a live snapshot', () => {
    const simulation = new MatchSimulation(config)
    simulation.advance(1 / 120)
    const restored = new MatchSimulation(undefined, { snapshot: simulation.snapshot() })
    simulation.advance(1 / 120)
    restored.advance(1 / 120)
    expect(restored.state.tick).toBe(simulation.state.tick)
    expect(matchStateChecksum(restored.state)).toBe(matchStateChecksum(simulation.state))
  })

  it('rejects snapshot and replay restoration when installed map content differs', () => {
    const simulation = new MatchSimulation(config)
    const snapshot = simulation.snapshot()
    snapshot.state.mapContentHash = '0000000000000000'
    expect(() => new MatchSimulation(undefined, { snapshot })).toThrow(/installed map revision/)

    const map = getMap(config.mapId)
    expect(() =>
      replayMatch({
        version: 1,
        seed: 42,
        config,
        mapRevision: map.revision,
        mapContentHash: '0000000000000000',
        commands: [],
        endTick: 1,
      }),
    ).toThrow(/installed map content/)
  })

  it('replays deterministically without Phaser and changes checksum when a command changes', () => {
    const base: MatchReplay = {
      version: 1,
      seed: 42,
      config,
      mapRevision: getMap(config.mapId).revision,
      mapContentHash: getMap(config.mapId).contentHash,
      endTick: 120,
      commands: [
        {
          tick: 0,
          command: {
            type: 'move',
            sequence: 1,
            expectedTurn: 1,
            playerId: 'player-1',
            direction: 1,
            pressed: true,
          },
        },
      ],
    }
    expect(replayChecksum(base)).toBe(replayChecksum(base))
    const altered: MatchReplay = {
      ...base,
      commands: [
        { tick: 0, command: { ...base.commands[0].command, direction: -1 } as MatchCommand },
      ],
    }
    expect(replayChecksum(altered)).not.toBe(replayChecksum(base))
    expect(replayMatch(base).state.tick).toBe(120)
  })
})

describe('match lifecycle', () => {
  it('emits victory once and preserves the existing simultaneous-death draw rule', () => {
    const win = new MatchSimulation(config)
    win.state.players[1].alive = false
    win.state.players[1].health = 0
    win.step()
    expect(win.state.winnerPlayerId).toBe('player-1')
    expect(win.drainEvents().filter((event) => event.type === 'match-ended')).toHaveLength(1)
    win.step(10)
    expect(win.drainEvents().filter((event) => event.type === 'match-ended')).toHaveLength(0)

    const draw = new MatchSimulation(config)
    draw.state.players.forEach((player) => {
      player.alive = false
      player.health = 0
    })
    draw.step()
    expect(draw.state.isDraw).toBe(true)
    expect(draw.state.winnerPlayerId).toBeNull()
  })

  it('creates clean independent state for restart', () => {
    const played = new MatchSimulation(config)
    fireDown(played)
    played.step(20)
    const restarted = new MatchSimulation(config)
    expect(restarted.state.tick).toBe(0)
    expect(restarted.state.projectiles).toHaveLength(0)
    expect(restarted.state.terrainOperations).toHaveLength(0)
    expect(restarted.state.players.every((player) => player.health === 100)).toBe(true)
  })
})
