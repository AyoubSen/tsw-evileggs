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

const config = {
  mode: '1v1' as const,
  playerNames: ['Lumen', 'Morrow'] as const,
  mapId: 'rolling-hills' as const,
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
      expect.objectContaining({ type: 'melee-struck', targetPlayerId: null }),
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
    const simulation = new MatchSimulation(config)
    simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId: 'old-shoe' }))
    fireDown(simulation)
    placeActiveProjectileNextToPlayer(simulation, 1)
    simulation.step()
    expect(simulation.state.players[1].health).toBeLessThan(100)
    expect(simulation.state.players[1].health).toBeGreaterThan(90)
    expect(simulation.state.players[1].velocity.x).toBeGreaterThan(0)
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
    expect(deserializeMatchState(payload).version).toBe(6)
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

  it('replays deterministically without Phaser and changes checksum when a command changes', () => {
    const base: MatchReplay = {
      seed: 42,
      config,
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
