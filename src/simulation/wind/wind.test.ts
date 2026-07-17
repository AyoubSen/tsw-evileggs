import { describe, expect, it } from 'vitest'
import { MatchSimulation } from '../match/MatchSimulation'
import type { MatchCommand, MatchCommandInput } from '../match/MatchCommand'
import { SIMULATION_HZ, type SimProjectile } from '../match/MatchState'
import { matchStateChecksum } from '../serialization/matchSerialization'
import { replayMatch } from '../replay/replay'
import { WEAPONS, type WeaponId } from '../../weapons/registry'
import { WIND_MAX_ACCELERATION, WIND_STEP, windForTurn } from './wind'

const command = (simulation: MatchSimulation, input: MatchCommandInput): MatchCommand =>
  ({
    ...input,
    sequence: simulation.state.lastCommandSequence + 1,
    expectedTurn: simulation.state.turnNumber,
    playerId: simulation.activePlayer.id,
  }) as MatchCommand

const select = (simulation: MatchSimulation, weaponId: WeaponId) =>
  simulation.applyCommand(command(simulation, { type: 'select-weapon', weaponId }))

const fire = (simulation: MatchSimulation) =>
  simulation.applyCommand(
    command(simulation, {
      type: 'activate-weapon',
      activation: { kind: 'directional', aimDirection: { x: 0, y: -1 }, power: 60 },
    }),
  )

const airborneProjectile = (weaponId: WeaponId, kind: SimProjectile['kind']): SimProjectile => ({
  id: 'projectile-test',
  actionId: 'action-test',
  ownerId: 'player-1',
  weaponId,
  kind,
  position: { x: 400, y: 100 },
  velocity: { x: 0, y: 0 },
  radius: 4,
  fuseTicks: weaponId === 'timed-grenade' ? 120 : 0,
})

describe('authoritative wind', () => {
  it('is deterministic, bounded, quantized, and different on adjacent turns', () => {
    const first = Array.from({ length: 20 }, (_, index) => windForTurn(8241, index + 1))
    const second = Array.from({ length: 20 }, (_, index) => windForTurn(8241, index + 1))
    expect(first).toEqual(second)
    expect(first.every((wind) => Math.abs(wind) <= WIND_MAX_ACCELERATION)).toBe(true)
    expect(first.every((wind) => wind % WIND_STEP === 0)).toBe(true)
    expect(first.every((wind, index) => index === 0 || wind !== first[index - 1])).toBe(true)
  })

  it('changes only when the next interactive turn starts and stays fixed during a shot', () => {
    const simulation = new MatchSimulation(undefined, { seed: 91 })
    const firstWind = simulation.state.wind
    fire(simulation)
    simulation.step(10)
    expect(simulation.state.phase).toBe('projectile')
    expect(simulation.state.wind).toBe(firstWind)

    const timeout = new MatchSimulation(undefined, { seed: 91 })
    timeout.step(30 * SIMULATION_HZ + 43)
    expect(timeout.state.turnNumber).toBe(2)
    expect(timeout.state.wind).toBe(windForTurn(91, 2))
    expect(timeout.state.wind).not.toBe(firstWind)
  })

  it.each([
    ['basic-rocket', 'primary'],
    ['precision-cannon', 'primary'],
    ['high-arc-mortar', 'primary'],
    ['timed-grenade', 'primary'],
    ['cluster-charge', 'primary'],
    ['cluster-charge', 'cluster-child'],
    ['bomb-beacon', 'primary'],
    ['bomb-beacon', 'beacon-bomb'],
    ['fork-rocket', 'primary'],
    ['fork-rocket', 'fork-child'],
    ['old-shoe', 'primary'],
    ['siege-bazooka', 'primary'],
    ['cryo-shot', 'primary'],
  ] as const)('%s %s projectiles respond to wind while airborne', (weaponId, kind) => {
    const simulation = new MatchSimulation()
    simulation.state.wind = WIND_MAX_ACCELERATION
    simulation.state.phase = 'projectile'
    simulation.state.activeAction = { id: 'action-test', playerId: 'player-1', weaponId }
    simulation.state.projectiles = [airborneProjectile(weaponId, kind)]
    simulation.step()
    expect(simulation.state.projectiles[0].velocity.x).toBeCloseTo(
      (WIND_MAX_ACCELERATION * WEAPONS[weaponId].windSensitivity) / SIMULATION_HZ,
    )
  })

  it('keeps Scatter Shot and Teleporter independent from wind', () => {
    const scatterHealth = (wind: number) => {
      const simulation = new MatchSimulation()
      simulation.state.wind = wind
      simulation.state.players[1].position = {
        x: simulation.state.players[0].position.x + 70,
        y: simulation.state.players[0].position.y,
      }
      select(simulation, 'scatter-shot')
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'directional', aimDirection: { x: 1, y: 0 }, power: 50 },
        }),
      )
      return simulation.state.players[1].health
    }
    expect(scatterHealth(-WIND_MAX_ACCELERATION)).toBe(scatterHealth(WIND_MAX_ACCELERATION))

    const teleportX = (wind: number) => {
      const simulation = new MatchSimulation()
      simulation.state.wind = wind
      select(simulation, 'teleporter')
      const x = 400
      const target = simulation.resolveTeleportTarget({ x, y: 0 })!
      simulation.applyCommand(
        command(simulation, {
          type: 'activate-weapon',
          activation: { kind: 'target-position', target },
        }),
      )
      return simulation.activePlayer.position.x
    }
    expect(teleportX(-WIND_MAX_ACCELERATION)).toBe(teleportX(WIND_MAX_ACCELERATION))
  })

  it('preserves wind in snapshots and includes it in replay checksums', () => {
    const simulation = new MatchSimulation(undefined, { seed: 77 })
    const snapshot = simulation.snapshot()
    const restored = new MatchSimulation(undefined, { snapshot })
    expect(restored.state.wind).toBe(simulation.state.wind)
    const checksum = matchStateChecksum(simulation.state)
    simulation.state.wind += WIND_STEP
    expect(matchStateChecksum(simulation.state)).not.toBe(checksum)
    const replayed = replayMatch({
      version: 1,
      seed: 77,
      config: simulation.state.config,
      mapRevision: simulation.state.mapRevision,
      mapContentHash: simulation.state.mapContentHash,
      commands: [],
      endTick: 1,
    })
    expect(replayed.state.wind).toBe(windForTurn(77, 1))
  })
})
