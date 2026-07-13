import { getMap, createMapTerrain } from '../../maps/registry'
import { validateMatchConfig, type LocalMatchConfig } from '../../match/config'
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
} from '../../shared/constants'
import type { Vector } from '../../shared/types'
import { TerrainMask } from '../../terrain/TerrainMask'
import { explosionFalloff, knockbackVelocity } from '../damage/explosion'
import { launchVelocity } from '../aim/aim'
import { integrateProjectile } from '../projectile/integrate'
import {
  WEAPON_ORDER,
  WEAPONS,
  canUseWeapon,
  consumeWeapon,
  createWeaponInventory,
  type WeaponDefinition,
  type WeaponId,
} from '../../weapons/registry'
import type { CommandRejection, CommandResult, MatchCommand } from './MatchCommand'
import type { MatchEvent, MatchEventInput, SimulationMatchResult } from './MatchEvent'
import {
  FIXED_TICK_SECONDS,
  SIMULATION_HZ,
  type MatchState,
  type SerializedMatchState,
  type SimPlayer,
  type SimProjectile,
  type TerrainOperation,
} from './MatchState'

const CHARACTER_RADIUS = 15
const TERRAIN_SCALE = 2
const MOVE_SPEED = 105
const MAX_STEP_UP = 12
const JUMP_VELOCITY = 310
const JUMP_HORIZONTAL_SPEED = 105
const SETTLE_TICKS = Math.ceil(0.45 * SIMULATION_HZ)
const EXPIRED_TICKS = Math.ceil(0.7 * SIMULATION_HZ)
const MAX_ACCUMULATED_SECONDS = 0.25
const MAX_BUFFERED_EVENTS = 2048

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))
const finiteVector = (value: unknown): value is Vector =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Vector).x) &&
  Number.isFinite((value as Vector).y)

export class MatchSimulation {
  private terrain: TerrainMask
  private events: MatchEvent[] = []
  private accumulator = 0
  readonly state: MatchState

  constructor(
    config?: Partial<LocalMatchConfig>,
    options: { seed?: number; matchId?: string; snapshot?: SerializedMatchState } = {},
  ) {
    if (options.snapshot) {
      this.state = structuredClone(options.snapshot.state)
      this.terrain = reconstructTerrain(this.state.mapId, this.state.terrainOperations)
      return
    }
    const validated = validateMatchConfig(config)
    const map = getMap(validated.mapId)
    this.terrain = createMapTerrain(map, TERRAIN_SCALE)
    const seed = (options.seed ?? 1) >>> 0 || 1
    this.state = {
      matchId: options.matchId ?? `local-${seed}`,
      seed,
      tick: 0,
      config: validated,
      mapId: validated.mapId,
      phase: 'input',
      paused: false,
      players: [
        this.createPlayer('player-1', validated.playerNames[0], map.spawnPoints[0]),
        this.createPlayer('player-2', validated.playerNames[1], map.spawnPoints[1]),
      ],
      activePlayerIndex: 0,
      turnNumber: 1,
      timerRemainingTicks: validated.turnDurationSeconds * SIMULATION_HZ,
      expiredTicks: 0,
      settlingTicks: 0,
      durationTicks: 0,
      wind: 0,
      projectiles: [],
      activeAction: null,
      pendingExplosions: [],
      terrainOperations: [],
      winnerPlayerId: null,
      isDraw: false,
      nextProjectileId: 1,
      nextActionId: 1,
      nextTerrainSequence: 1,
      nextEventSequence: 1,
      lastCommandSequence: 0,
    }
  }

  private createPlayer(id: string, name: string, x: number): SimPlayer {
    const surface = this.terrain.surfaceY(x) ?? GAME_HEIGHT
    return {
      id,
      name,
      position: { x, y: surface - CHARACTER_RADIUS },
      velocity: { x: 0, y: 0 },
      health: 100,
      radius: CHARACTER_RADIUS,
      alive: true,
      grounded: true,
      moveDirection: 0,
      selectedWeapon: 'basic-rocket',
      inventory: createWeaponInventory(),
    }
  }

  getTerrain(): TerrainMask {
    return this.terrain
  }
  get activePlayer(): SimPlayer {
    return this.state.players[this.state.activePlayerIndex]
  }
  get timerRemainingSeconds(): number {
    return this.state.timerRemainingTicks / SIMULATION_HZ
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused
    if (paused)
      this.state.players.forEach((player) => {
        player.moveDirection = 0
      })
  }

  advance(elapsedSeconds: number): number {
    if (this.state.paused || this.state.phase === 'victory') return 0
    this.accumulator = Math.min(
      this.accumulator + Math.max(0, elapsedSeconds),
      MAX_ACCUMULATED_SECONDS,
    )
    let stepped = 0
    while (this.accumulator + Number.EPSILON >= FIXED_TICK_SECONDS) {
      this.step()
      this.accumulator = Math.max(0, this.accumulator - FIXED_TICK_SECONDS)
      stepped += 1
    }
    return stepped
  }

  step(ticks = 1): void {
    for (let count = 0; count < ticks; count += 1) {
      if (this.state.paused || this.state.phase === 'victory') return
      this.state.tick += 1
      this.state.durationTicks += 1
      if (this.state.phase === 'input') {
        this.state.timerRemainingTicks = Math.max(0, this.state.timerRemainingTicks - 1)
        if (this.state.timerRemainingTicks === 0) this.expireTurn()
        else this.advanceMovementIntent()
      }
      if (this.state.phase === 'projectile') this.advanceProjectiles()
      this.advancePlayers()
      this.checkVictory()
      if (this.state.phase === 'settling') this.advanceSettling()
      if (this.state.phase === 'expired') this.advanceExpired()
    }
  }

  applyCommand(command: MatchCommand): CommandResult {
    const rejected = (reason: CommandRejection): CommandResult => ({
      accepted: false,
      sequence: command.sequence,
      reason,
    })
    if (
      !Number.isSafeInteger(command.sequence) ||
      command.sequence <= this.state.lastCommandSequence
    )
      return rejected('invalid-sequence')
    this.state.lastCommandSequence = command.sequence
    if (command.expectedTurn !== this.state.turnNumber) return rejected('stale-turn')
    const player = this.state.players.find((candidate) => candidate.id === command.playerId)
    if (!player) return rejected('unknown-player')
    if (player !== this.activePlayer) return rejected('not-active-player')
    if (!player.alive) return rejected('player-dead')
    if (this.state.phase !== 'input' || this.state.paused || this.state.timerRemainingTicks <= 0)
      return rejected('match-not-accepting-input')
    if (command.type === 'move') {
      if (![-1, 0, 1].includes(command.direction)) return rejected('invalid-command')
      player.moveDirection = command.pressed
        ? command.direction
        : player.moveDirection === command.direction
          ? 0
          : player.moveDirection
    } else if (command.type === 'jump') {
      if (!player.grounded) return rejected('cannot-jump')
      player.velocity.y = -JUMP_VELOCITY
      player.velocity.x = player.moveDirection * JUMP_HORIZONTAL_SPEED
      player.grounded = false
    } else if (command.type === 'select-weapon') {
      if (!WEAPON_ORDER.includes(command.weaponId)) return rejected('invalid-weapon')
      if (!canUseWeapon(player.inventory, command.weaponId)) return rejected('no-ammunition')
      player.selectedWeapon = command.weaponId
      this.emit({ type: 'weapon-selected', playerId: player.id, weaponId: command.weaponId })
    } else if (command.type === 'fire') {
      const reason = this.validateFire(player, command.aimDirection, command.power)
      if (reason) return rejected(reason)
      this.fire(player, command.aimDirection, command.power)
    } else if (command.type === 'teleport') {
      if (player.selectedWeapon !== 'teleporter') return rejected('invalid-weapon')
      if (!canUseWeapon(player.inventory, 'teleporter')) return rejected('no-ammunition')
      if (!this.isValidTeleport(command.destination, player.id)) return rejected('invalid-teleport')
      this.beginAction(player, 'teleporter')
      player.inventory = consumeWeapon(player.inventory, 'teleporter')
      const surface = this.terrain.surfaceY(command.destination.x, command.destination.y)
      player.position = {
        x: command.destination.x,
        y: (surface ?? command.destination.y + CHARACTER_RADIUS) - CHARACTER_RADIUS,
      }
      player.velocity = { x: 0, y: 0 }
      this.state.phase = 'settling'
      this.state.settlingTicks = 0
    } else return rejected('invalid-command')
    return { accepted: true, sequence: command.sequence }
  }

  private validateFire(
    player: SimPlayer,
    direction: Vector,
    power: number,
  ): CommandRejection | null {
    if (player.selectedWeapon === 'teleporter') return 'invalid-weapon'
    if (!canUseWeapon(player.inventory, player.selectedWeapon)) return 'no-ammunition'
    if (!finiteVector(direction)) return 'invalid-aim'
    const length = Math.hypot(direction.x, direction.y)
    if (length < 0.999 || length > 1.001) return 'invalid-aim'
    if (!Number.isFinite(power) || power < POWER_MIN_PERCENT || power > POWER_MAX_PERCENT)
      return 'invalid-power'
    return null
  }

  private fire(player: SimPlayer, direction: Vector, power: number): void {
    const weapon = WEAPONS[player.selectedWeapon]
    const actionId = this.beginAction(player, weapon.id)
    player.inventory = consumeWeapon(player.inventory, weapon.id)
    player.moveDirection = 0
    if (weapon.id === 'scatter-shot') {
      this.fireScatter(player, direction, weapon)
      this.state.phase = 'settling'
      return
    }
    const projectile = this.spawnProjectile(
      actionId,
      player.id,
      weapon.id,
      'primary',
      this.projectileOrigin(player, direction),
      launchVelocity(direction, weapon.projectileSpeed, power),
      5,
      weapon.id === 'timed-grenade' ? 3 * SIMULATION_HZ : 0,
    )
    this.state.projectiles.push(projectile)
    this.state.phase = 'projectile'
  }

  private beginAction(player: SimPlayer, weaponId: WeaponId): string {
    const id = `action-${this.state.nextActionId++}`
    this.state.activeAction = { id, playerId: player.id, weaponId }
    this.emit({ type: 'weapon-fired', playerId: player.id, weaponId, actionId: id })
    return id
  }

  private spawnProjectile(
    actionId: string,
    ownerId: string,
    weaponId: WeaponId,
    kind: SimProjectile['kind'],
    position: Vector,
    velocity: Vector,
    radius: number,
    fuseTicks = 0,
  ): SimProjectile {
    const projectile = {
      id: `projectile-${this.state.nextProjectileId++}`,
      actionId,
      ownerId,
      weaponId,
      kind,
      position: { ...position },
      velocity: { ...velocity },
      radius,
      fuseTicks,
    }
    this.emit({ type: 'projectile-spawned', projectileId: projectile.id, actionId })
    return projectile
  }

  private advanceMovementIntent(): void {
    const player = this.activePlayer
    if (player.moveDirection === 0 || !player.grounded || !player.alive) return
    const distance = MOVE_SPEED * FIXED_TICK_SECONDS
    const candidateX = clamp(
      player.position.x + player.moveDirection * distance,
      player.radius,
      GAME_WIDTH - player.radius,
    )
    const surface = this.terrain.surfaceY(candidateX, 0)
    const foot = player.position.y + player.radius
    if (surface === null || foot - surface > MAX_STEP_UP) return
    player.position.x = candidateX
    if (surface <= foot) player.position.y = surface - player.radius
    player.velocity.x = 0
  }

  private advanceProjectiles(): void {
    const nextProjectiles: SimProjectile[] = []
    for (const projectile of this.state.projectiles) {
      const weapon = WEAPONS[projectile.weaponId]
      if (projectile.fuseTicks > 0) projectile.fuseTicks -= 1
      if (projectile.weaponId === 'timed-grenade' && projectile.fuseTicks <= 0) {
        this.explode(projectile.position, weapon, projectile.actionId)
        continue
      }
      const next = integrateProjectile(
        projectile,
        GRAVITY * weapon.gravityScale,
        FIXED_TICK_SECONDS,
      )
      const impact = this.projectileCollision(projectile, next)
      if (!impact) {
        if (!this.outOfBounds(next.position)) nextProjectiles.push({ ...projectile, ...next })
        continue
      }
      if (projectile.weaponId === 'timed-grenade') {
        nextProjectiles.push({
          ...projectile,
          position: { x: impact.x, y: impact.y - 4 },
          velocity: { x: next.velocity.x * 0.45, y: -Math.abs(next.velocity.y) * 0.42 },
        })
      } else if (projectile.weaponId === 'cluster-charge' && projectile.kind === 'primary') {
        for (const angle of [-0.9, -0.45, 0, 0.45, 0.9])
          nextProjectiles.push(
            this.spawnProjectile(
              projectile.actionId,
              projectile.ownerId,
              'cluster-charge',
              'cluster-child',
              impact,
              { x: Math.cos(angle) * 230, y: -Math.sin(angle) * 230 - 160 },
              4,
            ),
          )
      } else this.explode(impact, weapon, projectile.actionId)
    }
    this.state.projectiles = nextProjectiles
    if (this.state.phase === 'projectile' && this.state.projectiles.length === 0) {
      this.state.phase = 'settling'
      this.state.settlingTicks = 0
    }
  }

  private projectileCollision(
    previous: Pick<SimProjectile, 'position' | 'radius'>,
    next: Pick<SimProjectile, 'position' | 'radius'>,
  ): Vector | null {
    const distance = Math.hypot(
      next.position.x - previous.position.x,
      next.position.y - previous.position.y,
    )
    const samples = Math.max(1, Math.ceil(distance / 3))
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples
      const point = {
        x: previous.position.x + (next.position.x - previous.position.x) * t,
        y: previous.position.y + (next.position.y - previous.position.y) * t,
      }
      const hitPlayer = this.state.players.some(
        (player) =>
          player.alive &&
          Math.hypot(player.position.x - point.x, player.position.y - point.y) <
            player.radius + next.radius,
      )
      if (this.terrain.isSolid(point.x, point.y) || hitPlayer || this.outOfBounds(point))
        return point
    }
    return null
  }

  private fireScatter(shooter: SimPlayer, direction: Vector, weapon: WeaponDefinition): void {
    for (let pellet = -3; pellet <= 3; pellet += 1) {
      const angle = Math.atan2(direction.y, direction.x) + pellet * 0.055
      const ray = { x: Math.cos(angle), y: Math.sin(angle) }
      for (let distance = 8; distance <= 250; distance += 4) {
        const point = {
          x: shooter.position.x + ray.x * distance,
          y: shooter.position.y + ray.y * distance,
        }
        if (this.terrain.isSolid(point.x, point.y)) break
        const target = this.state.players.find(
          (player) =>
            player.id !== shooter.id &&
            player.alive &&
            Math.hypot(player.position.x - point.x, player.position.y - point.y) < player.radius,
        )
        if (!target) continue
        const damage = weapon.baseDamage * (1 - distance / 300)
        this.damagePlayer(target, damage)
        target.velocity.x += ray.x * weapon.knockbackForce
        target.velocity.y += ray.y * weapon.knockbackForce - 35
        break
      }
    }
  }

  private explode(center: Vector, weapon: WeaponDefinition, actionId: string): void {
    const operation: TerrainOperation = {
      sequence: this.state.nextTerrainSequence++,
      tick: this.state.tick,
      type: 'subtract-circle',
      x: center.x,
      y: center.y,
      radius: weapon.terrainRadius,
      sourceActionId: actionId,
    }
    this.state.terrainOperations.push(operation)
    this.terrain.removeCircle(center.x, center.y, weapon.terrainRadius)
    this.emit({ type: 'terrain-destroyed', operation })
    for (const player of this.state.players) {
      if (!player.alive) continue
      const distance = Math.max(
        0,
        Math.hypot(player.position.x - center.x, player.position.y - center.y) - player.radius,
      )
      this.damagePlayer(player, explosionFalloff(weapon.baseDamage, weapon.blastRadius, distance))
      const knockback = knockbackVelocity(
        center,
        player.position,
        weapon.knockbackForce,
        weapon.blastRadius,
      )
      player.velocity.x += knockback.x
      player.velocity.y += knockback.y
    }
  }

  private damagePlayer(player: SimPlayer, amount: number): void {
    if (amount <= 0) return
    const previous = player.health
    player.health = Math.max(0, player.health - amount)
    this.emit({ type: 'player-damaged', playerId: player.id, amount: previous - player.health })
    if (player.health === 0 && player.alive) {
      player.alive = false
      this.emit({ type: 'player-died', playerId: player.id })
    }
  }

  private advancePlayers(): void {
    for (const player of this.state.players) {
      if (!player.alive) continue
      player.velocity.y += GRAVITY * FIXED_TICK_SECONDS
      player.position.x = clamp(
        player.position.x + player.velocity.x * FIXED_TICK_SECONDS,
        player.radius,
        GAME_WIDTH - player.radius,
      )
      player.position.y += player.velocity.y * FIXED_TICK_SECONDS
      player.velocity.x *= Math.pow(0.12, FIXED_TICK_SECONDS)
      const surface = this.terrain.surfaceY(
        player.position.x,
        Math.max(0, player.position.y - player.radius),
      )
      if (
        surface !== null &&
        player.position.y + player.radius >= surface &&
        player.velocity.y >= 0
      ) {
        player.position.y = surface - player.radius
        player.velocity.y = 0
        player.grounded = true
      } else player.grounded = false
      if (player.position.y > GAME_HEIGHT + 65) {
        player.health = 0
        player.alive = false
        this.emit({ type: 'player-died', playerId: player.id })
      }
    }
  }

  private advanceSettling(): void {
    const settled = this.state.players.every(
      (player) =>
        !player.alive ||
        (player.grounded && Math.abs(player.velocity.x) < 4 && Math.abs(player.velocity.y) < 4),
    )
    this.state.settlingTicks = settled ? this.state.settlingTicks + 1 : 0
    if (this.state.settlingTicks >= SETTLE_TICKS) this.beginNextTurn()
  }

  private expireTurn(): void {
    const playerId = this.activePlayer.id
    this.state.phase = 'expired'
    this.state.expiredTicks = 0
    this.activePlayer.moveDirection = 0
    this.emit({ type: 'turn-expired', playerId })
  }

  private advanceExpired(): void {
    this.state.expiredTicks += 1
    if (this.state.expiredTicks >= EXPIRED_TICKS) this.beginNextTurn()
  }

  private beginNextTurn(): void {
    this.state.activePlayerIndex = this.state.activePlayerIndex === 0 ? 1 : 0
    this.state.turnNumber += 1
    this.state.phase = 'input'
    this.state.timerRemainingTicks = this.state.config.turnDurationSeconds * SIMULATION_HZ
    this.state.expiredTicks = 0
    this.state.settlingTicks = 0
    this.state.activeAction = null
    this.state.players.forEach((player) => {
      player.moveDirection = 0
    })
    if (!canUseWeapon(this.activePlayer.inventory, this.activePlayer.selectedWeapon))
      this.activePlayer.selectedWeapon = 'basic-rocket'
    this.emit({ type: 'turn-started', playerId: this.activePlayer.id })
  }

  private checkVictory(): void {
    if (this.state.phase === 'victory') return
    const alive = this.state.players.filter((player) => player.alive)
    if (alive.length > 1) return
    this.state.phase = 'victory'
    this.state.timerRemainingTicks = 0
    this.state.players.forEach((player) => {
      player.moveDirection = 0
    })
    this.state.winnerPlayerId = alive[0]?.id ?? null
    this.state.isDraw = alive.length === 0
    this.emit({ type: 'match-ended', result: this.getResult() })
  }

  getResult(): SimulationMatchResult {
    const winnerIndex = this.state.winnerPlayerId
      ? this.state.players.findIndex((player) => player.id === this.state.winnerPlayerId)
      : null
    const winner = winnerIndex === null ? null : this.state.players[winnerIndex]
    return {
      config: this.state.config,
      winnerIndex,
      remainingHealth: winner ? Math.ceil(winner.health) : 0,
      turnsTaken: this.state.turnNumber,
      durationSeconds: Math.floor(this.state.durationTicks / SIMULATION_HZ),
    }
  }

  isValidTeleport(target: Vector, playerId = this.activePlayer.id): boolean {
    if (
      !finiteVector(target) ||
      target.x < 20 ||
      target.x > GAME_WIDTH - 20 ||
      target.y < 20 ||
      target.y > GAME_HEIGHT - 20
    )
      return false
    if (this.terrain.isSolid(target.x, target.y) || this.terrain.isSolid(target.x, target.y + 14))
      return false
    const surface = this.terrain.surfaceY(target.x, target.y)
    if (surface === null || surface - target.y > 24 || surface - target.y < 10) return false
    return !this.state.players.some(
      (player) =>
        player.id !== playerId &&
        player.alive &&
        Math.hypot(player.position.x - target.x, player.position.y - target.y) < player.radius * 2,
    )
  }

  private projectileOrigin(shooter: SimPlayer, direction: Vector): Vector {
    return {
      x: shooter.position.x + direction.x * (shooter.radius + 10),
      y: shooter.position.y + direction.y * (shooter.radius + 10),
    }
  }
  private outOfBounds(point: Vector): boolean {
    return point.x < 0 || point.x > GAME_WIDTH || point.y < 0 || point.y > GAME_HEIGHT
  }

  private emit(event: MatchEventInput): void {
    this.events.push({
      ...event,
      sequence: this.state.nextEventSequence++,
      tick: this.state.tick,
    } as MatchEvent)
    if (this.events.length > MAX_BUFFERED_EVENTS)
      this.events.splice(0, this.events.length - MAX_BUFFERED_EVENTS)
  }

  drainEvents(): MatchEvent[] {
    const events = this.events
    this.events = []
    return events
  }

  snapshot(): SerializedMatchState {
    return { version: 1, state: structuredClone(this.state) }
  }
}

export function reconstructTerrain(
  mapId: string,
  operations: readonly TerrainOperation[],
): TerrainMask {
  const terrain = createMapTerrain(getMap(mapId), TERRAIN_SCALE)
  for (const operation of [...operations].sort((left, right) => left.sequence - right.sequence))
    terrain.removeCircle(operation.x, operation.y, operation.radius)
  return terrain
}
