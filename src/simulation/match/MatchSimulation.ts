import {
  getMap,
  createMapTerrain,
  type MapDefinition,
  type SpawnDefinition,
} from '../../maps/registry'
import { validateMatchConfig, type LocalMatchConfig } from '../../match/config'
import { GRAVITY, POWER_MAX_PERCENT, POWER_MIN_PERCENT } from '../../shared/constants'
import type { Vector } from '../../shared/types'
import { windForTurn } from '../wind/wind'
import { TerrainMask } from '../../terrain/TerrainMask'
import { explosionFalloff, knockbackVelocity } from '../damage/explosion'
import { launchVelocity } from '../aim/aim'
import { integrateProjectile } from '../projectile/integrate'
import {
  firstProjectileContact,
  sweepCircleAgainstMapObject,
  type ProjectileContact,
} from '../projectile/contact'
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
import type { WeaponActivation } from './MatchCommand'
import type { MatchEvent, MatchEventInput, SimulationMatchResult } from './MatchEvent'
import {
  isTeleportDestinationValid,
  resolveTeleportDestination,
} from '../weapons/teleport'
import {
  FIXED_TICK_SECONDS,
  SIMULATION_HZ,
  SIMULATION_SNAPSHOT_VERSION,
  type MatchState,
  type SerializedMatchState,
  type SimBeacon,
  type SimPlayer,
  type SimMine,
  type SimProjectile,
  type TerrainOperation,
} from './MatchState'
import { isDestructibleMaterial } from '../../terrain/materials'
import { nextScheduledTurn } from '../turns/teamTurnOrder'

const CHARACTER_RADIUS = 14
const MOVE_SPEED = 105
const MAX_STEP_UP = 12
const JUMP_VELOCITY = 310
const AIR_ACCELERATION = 260
const AIR_MAX_SPEED = 85
const JUMP_HORIZONTAL_SPEED = AIR_MAX_SPEED
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
  private map: MapDefinition
  private events: MatchEvent[] = []
  private accumulator = 0
  readonly state: MatchState

  constructor(
    config?: Partial<LocalMatchConfig>,
    options: { seed?: number; matchId?: string; snapshot?: SerializedMatchState } = {},
  ) {
    if (options.snapshot) {
      this.state = structuredClone(options.snapshot.state)
      this.accumulator = options.snapshot.accumulatorSeconds
      this.map = getMap(this.state.mapId)
      if (
        this.map.id !== this.state.mapId ||
        this.map.revision !== this.state.mapRevision ||
        this.map.contentHash !== this.state.mapContentHash ||
        this.map.width !== this.state.worldWidth ||
        this.map.height !== this.state.worldHeight ||
        this.map.mode !== this.state.config.mode ||
        this.map.spawnPoints.length !== this.state.players.length
      )
        throw new Error('Match snapshot map does not match the installed map revision.')
      this.terrain = reconstructTerrain(this.state.mapId, this.state.terrainOperations)
      return
    }
    const validated = validateMatchConfig(config)
    const map = getMap(validated.mapId)
    this.map = map
    this.terrain = createMapTerrain(map)
    const seed = (options.seed ?? 1) >>> 0 || 1
    const players = map.spawnPoints.map((spawn, index) =>
      this.createPlayer(`player-${index + 1}`, validated.playerNames[index], spawn),
    )
    const activePlayerIndex = players.findIndex(
      (player) => player.teamId === 0 && player.teamSlot === 0,
    )
    const teamZeroPlayers = players.filter((player) => player.teamId === 0)
    this.state = {
      matchId: options.matchId ?? `local-${seed}`,
      seed,
      tick: 0,
      config: validated,
      mapId: validated.mapId,
      mapRevision: map.revision,
      mapContentHash: map.contentHash,
      worldWidth: map.width,
      worldHeight: map.height,
      phase: 'input',
      paused: false,
      players,
      activePlayerIndex: Math.max(0, activePlayerIndex),
      teamTurnCursors: [teamZeroPlayers.length > 1 ? 1 : 0, 0],
      turnNumber: 1,
      timerRemainingTicks: validated.turnDurationSeconds * SIMULATION_HZ,
      expiredTicks: 0,
      settlingTicks: 0,
      durationTicks: 0,
      wind: windForTurn(seed, 1),
      projectiles: [],
      mines: [],
      beacons: [],
      activeAction: null,
      pendingExplosions: [],
      terrainOperations: [],
      winnerPlayerId: null,
      winnerTeamId: null,
      isDraw: false,
      nextProjectileId: 1,
      nextMineId: 1,
      nextBeaconId: 1,
      nextActionId: 1,
      nextTerrainSequence: 1,
      nextEventSequence: 1,
      lastCommandSequence: 0,
    }
  }

  private createPlayer(id: string, name: string, spawn: SpawnDefinition): SimPlayer {
    return {
      id,
      name,
      position: { x: spawn.x, y: spawn.y - CHARACTER_RADIUS },
      velocity: { x: 0, y: 0 },
      health: 100,
      radius: CHARACTER_RADIUS,
      teamId: spawn.teamId,
      teamSlot: spawn.teamSlot,
      facing: spawn.facing,
      alive: true,
      grounded: true,
      moveDirection: 0,
      frozenTurnsRemaining: 0,
      frozenAppliedTurn: 0,
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
      if (this.state.phase === 'projectile') {
        this.advanceProjectiles()
        this.advanceBeacons()
      }
      this.advancePlayers()
      this.advanceMines()
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
    if (command.type === 'trigger-weapon') {
      if (this.state.phase !== 'projectile' || this.state.paused) return rejected('cannot-trigger')
      if (!this.triggerActiveWeapon(player)) return rejected('cannot-trigger')
      return { accepted: true, sequence: command.sequence }
    }
    if (this.state.phase !== 'input' || this.state.paused || this.state.timerRemainingTicks <= 0)
      return rejected('match-not-accepting-input')
    if (command.type === 'move') {
      if (![-1, 0, 1].includes(command.direction)) return rejected('invalid-command')
      if (
        player.frozenTurnsRemaining > 0 &&
        this.state.turnNumber > player.frozenAppliedTurn &&
        command.pressed &&
        command.direction !== 0
      )
        return rejected('movement-locked')
      if (command.direction !== 0) player.facing = command.direction
      player.moveDirection = command.pressed
        ? command.direction
        : player.moveDirection === command.direction
          ? 0
          : player.moveDirection
    } else if (command.type === 'jump') {
      if (
        player.frozenTurnsRemaining > 0 &&
        this.state.turnNumber > player.frozenAppliedTurn
      )
        return rejected('movement-locked')
      if (!player.grounded) return rejected('cannot-jump')
      player.velocity.y = -JUMP_VELOCITY
      player.velocity.x = player.moveDirection * JUMP_HORIZONTAL_SPEED
      player.grounded = false
      this.emit({ type: 'player-jumped', playerId: player.id })
    } else if (command.type === 'select-weapon') {
      if (!WEAPON_ORDER.includes(command.weaponId)) return rejected('invalid-weapon')
      if (!canUseWeapon(player.inventory, command.weaponId)) return rejected('no-ammunition')
      player.selectedWeapon = command.weaponId
      this.emit({ type: 'weapon-selected', playerId: player.id, weaponId: command.weaponId })
    } else if (command.type === 'activate-weapon') {
      const reason = this.validateActivation(player, command.activation)
      if (reason) return rejected(reason)
      this.activateWeapon(player, command.activation)
    } else return rejected('invalid-command')
    return { accepted: true, sequence: command.sequence }
  }

  private validateActivation(
    player: SimPlayer,
    activation: WeaponActivation,
  ): CommandRejection | null {
    const weapon = WEAPONS[player.selectedWeapon]
    if (!canUseWeapon(player.inventory, weapon.id)) return 'no-ammunition'
    if (activation.kind !== weapon.aimMode) return 'invalid-command'
    if (activation.kind === 'directional') {
      if (!finiteVector(activation.aimDirection)) return 'invalid-aim'
      const length = Math.hypot(activation.aimDirection.x, activation.aimDirection.y)
      if (length < 0.999 || length > 1.001) return 'invalid-aim'
      if (
        !Number.isFinite(activation.power) ||
        activation.power < POWER_MIN_PERCENT ||
        activation.power > POWER_MAX_PERCENT
      )
        return 'invalid-power'
    } else if (activation.kind === 'target-position') {
      if (weapon.mechanic !== 'teleport' || !this.isValidTeleport(activation.target, player.id))
        return 'invalid-target'
    } else if (weapon.mechanic !== 'mine' || !this.resolveMinePosition(player))
      return 'invalid-placement'
    return null
  }

  private activateWeapon(player: SimPlayer, activation: WeaponActivation): void {
    const weapon = WEAPONS[player.selectedWeapon]
    const direction = activation.kind === 'directional' ? activation.aimDirection : undefined
    const actionId = this.beginAction(player, weapon.id, direction)
    player.inventory = consumeWeapon(player.inventory, weapon.id)
    player.moveDirection = 0

    if (weapon.mechanic === 'melee' && activation.kind === 'directional') {
      this.strikeMelee(player, activation.aimDirection, weapon, actionId)
      this.beginSettling()
    } else if (weapon.mechanic === 'scatter' && activation.kind === 'directional') {
      this.fireScatter(player, activation.aimDirection, weapon)
      this.beginSettling()
    } else if (weapon.mechanic === 'teleport' && activation.kind === 'target-position') {
      const from = { ...player.position }
      player.position = { ...activation.target }
      player.velocity = { x: 0, y: 0 }
      this.emit({
        type: 'teleported',
        actionId,
        playerId: player.id,
        from,
        to: { ...player.position },
      })
      this.beginSettling()
    } else if (weapon.mechanic === 'mine' && activation.kind === 'self') {
      const position = this.resolveMinePosition(player)!
      const mine: SimMine = {
        id: `mine-${this.state.nextMineId++}`,
        actionId,
        ownerId: player.id,
        teamId: player.teamId,
        weaponId: 'deployable-mine',
        position,
        radius: weapon.mineRadius,
        triggerRadius: weapon.mineTriggerRadius,
        armedTurn: this.state.turnNumber + 1,
      }
      this.state.mines.push(mine)
      this.emit({ type: 'mine-deployed', mine: structuredClone(mine) })
      this.beginSettling()
    } else if (activation.kind === 'directional') {
      const projectile = this.spawnProjectile(
        actionId,
        player.id,
        weapon.id,
        'primary',
        this.projectileOrigin(player, activation.aimDirection),
        launchVelocity(activation.aimDirection, weapon.projectileSpeed, activation.power),
        weapon.mechanic === 'drill' ? 6 : 5,
        weapon.mechanic === 'timed-bounce' ? weapon.fuseSeconds * SIMULATION_HZ : 0,
      )
      this.state.projectiles.push(projectile)
      this.state.phase = 'projectile'
    }
  }

  private triggerActiveWeapon(player: SimPlayer): boolean {
    const projectileIndex = this.state.projectiles.findIndex(
      (projectile) =>
        projectile.ownerId === player.id &&
        projectile.kind === 'primary' &&
        WEAPONS[projectile.weaponId].mechanic === 'remote-split',
    )
    if (projectileIndex < 0) return false
    const projectile = this.state.projectiles[projectileIndex]
    const weapon = WEAPONS[projectile.weaponId]
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    if (speed <= Number.EPSILON) return false
    const heading = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const spread = weapon.remoteSplitAngleRadians ?? 0
    this.state.projectiles.splice(projectileIndex, 1)
    for (const offset of [-spread, spread])
      this.state.projectiles.push(
        this.spawnProjectile(
          projectile.actionId,
          projectile.ownerId,
          projectile.weaponId,
          'fork-child',
          projectile.position,
          {
            x: Math.cos(heading + offset) * speed,
            y: Math.sin(heading + offset) * speed,
          },
          4,
        ),
      )
    this.emit({
      type: 'remote-split',
      actionId: projectile.actionId,
      position: { ...projectile.position },
    })
    return true
  }

  private beginSettling(): void {
    this.state.phase = 'settling'
    this.state.settlingTicks = 0
  }

  private beginAction(player: SimPlayer, weaponId: WeaponId, direction?: Vector): string {
    const id = `action-${this.state.nextActionId++}`
    this.state.activeAction = { id, playerId: player.id, weaponId }
    this.emit({
      type: 'weapon-fired',
      playerId: player.id,
      weaponId,
      actionId: id,
      origin: { ...player.position },
      ...(direction ? { direction: { ...direction } } : {}),
    })
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
    this.emit({
      type: 'projectile-spawned',
      projectileId: projectile.id,
      actionId,
      weaponId,
      kind,
      position: { ...position },
    })
    return projectile
  }

  private advanceMovementIntent(): void {
    const player = this.activePlayer
    if (player.moveDirection === 0 || !player.alive) return
    if (!player.grounded) {
      player.velocity.x = clamp(
        player.velocity.x + player.moveDirection * AIR_ACCELERATION * FIXED_TICK_SECONDS,
        -AIR_MAX_SPEED,
        AIR_MAX_SPEED,
      )
      return
    }
    const distance = MOVE_SPEED * FIXED_TICK_SECONDS
    const candidateX = clamp(
      player.position.x + player.moveDirection * distance,
      player.radius,
      this.state.worldWidth - player.radius,
    )
    if (this.playerHitsWall(player, candidateX)) return
    const surface = this.terrain.surfaceY(
      candidateX,
      Math.max(0, player.position.y - player.radius + 1),
    )
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
      if (weapon.mechanic === 'timed-bounce' && projectile.fuseTicks <= 0) {
        this.explode(projectile.position, weapon, projectile.actionId, projectile.ownerId)
        continue
      }
      const next = integrateProjectile(
        projectile,
        GRAVITY * weapon.gravityScale,
        FIXED_TICK_SECONDS,
        this.state.wind * weapon.windSensitivity,
      )
      const impact = this.projectileCollision(projectile, next)
      if (!impact) {
        if (!this.outOfBounds(next.position)) nextProjectiles.push({ ...projectile, ...next })
        continue
      }
      if (impact.kind === 'reflector') {
        const incomingVelocity = { ...next.velocity }
        const normalVelocity =
          incomingVelocity.x * impact.normal.x + incomingVelocity.y * impact.normal.y
        const outgoingVelocity = {
          x:
            (incomingVelocity.x - 2 * normalVelocity * impact.normal.x) *
            impact.object.velocityRetention,
          y:
            (incomingVelocity.y - 2 * normalVelocity * impact.normal.y) *
            impact.object.velocityRetention,
        }
        nextProjectiles.push({
          ...projectile,
          position: {
            x: impact.position.x + impact.normal.x * 0.05,
            y: impact.position.y + impact.normal.y * 0.05,
          },
          velocity: outgoingVelocity,
        })
        this.emit({
          type: 'projectile-reflected',
          objectId: impact.object.id,
          projectileId: projectile.id,
          position: { ...impact.position },
          incomingVelocity,
          outgoingVelocity: { ...outgoingVelocity },
        })
      } else if (weapon.mechanic === 'timed-bounce') {
        const normalVelocity =
          next.velocity.x * impact.normal.x + next.velocity.y * impact.normal.y
        const tangentVelocity = {
          x: next.velocity.x - impact.normal.x * normalVelocity,
          y: next.velocity.y - impact.normal.y * normalVelocity,
        }
        nextProjectiles.push({
          ...projectile,
          position: {
            x: impact.position.x + impact.normal.x * (projectile.radius + 1),
            y: impact.position.y + impact.normal.y * (projectile.radius + 1),
          },
          velocity: {
            x:
              tangentVelocity.x * weapon.bounceHorizontalRetention -
              impact.normal.x * normalVelocity * weapon.bounceRestitution,
            y:
              tangentVelocity.y * weapon.bounceHorizontalRetention -
              impact.normal.y * normalVelocity * weapon.bounceRestitution,
          },
        })
        this.emit({
          type: 'projectile-bounced',
          projectileId: projectile.id,
          weaponId: projectile.weaponId,
          position: { ...impact.position },
        })
      } else if (weapon.mechanic === 'beacon' && projectile.kind === 'primary') {
        const beacon: SimBeacon = {
          id: `beacon-${this.state.nextBeaconId++}`,
          actionId: projectile.actionId,
          ownerId: projectile.ownerId,
          weaponId: 'bomb-beacon',
          position: { ...impact.position },
          remainingTicks: Math.ceil((weapon.beaconDelaySeconds ?? 0) * SIMULATION_HZ),
        }
        this.state.beacons.push(beacon)
        this.emit({ type: 'beacon-deployed', beacon: structuredClone(beacon) })
      } else if (weapon.mechanic === 'cluster' && projectile.kind === 'primary') {
        this.emit({
          type: 'cluster-split',
          actionId: projectile.actionId,
          position: { ...impact.position },
        })
        const facing = Math.sign(projectile.velocity.x) || 1
        for (let child = 0; child < weapon.clusterChildCount; child += 1) {
          const angle =
            weapon.clusterChildCount === 1
              ? 0
              : -0.9 + (child / (weapon.clusterChildCount - 1)) * 1.8
          nextProjectiles.push(
            this.spawnProjectile(
              projectile.actionId,
              projectile.ownerId,
              weapon.id,
              'cluster-child',
              impact.position,
              {
                x: Math.cos(angle) * weapon.clusterChildSpeed * facing,
                y: -Math.sin(angle) * weapon.clusterChildSpeed - weapon.clusterChildLift,
              },
              4,
            ),
          )
        }
      } else if (
        weapon.mechanic === 'drill' &&
        this.terrain.isSolid(impact.position.x, impact.position.y)
      )
        this.boreDrill(projectile, impact.position, weapon)
      else this.explode(impact.position, weapon, projectile.actionId, projectile.ownerId)
    }
    this.state.projectiles = nextProjectiles
    if (
      this.state.phase === 'projectile' &&
      this.state.projectiles.length === 0 &&
      this.state.beacons.length === 0
    ) {
      this.state.phase = 'settling'
      this.state.settlingTicks = 0
    }
  }

  private advanceBeacons(): void {
    const remaining: SimBeacon[] = []
    for (const beacon of this.state.beacons) {
      beacon.remainingTicks -= 1
      if (beacon.remainingTicks > 0) {
        remaining.push(beacon)
        continue
      }
      const weapon = WEAPONS[beacon.weaponId]
      const count = weapon.beaconBombCount ?? 0
      const spacing = weapon.beaconBombSpacing ?? 0
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * spacing
        const x = clamp(beacon.position.x + offset, 8, this.state.worldWidth - 8)
        this.state.projectiles.push(
          this.spawnProjectile(
            beacon.actionId,
            beacon.ownerId,
            beacon.weaponId,
            'beacon-bomb',
            { x, y: 2 },
            { x: 0, y: 90 },
            6,
          ),
        )
      }
      this.emit({
        type: 'barrage-released',
        actionId: beacon.actionId,
        position: { ...beacon.position },
        bombCount: count,
      })
    }
    this.state.beacons = remaining
    if (
      this.state.phase === 'projectile' &&
      this.state.projectiles.length === 0 &&
      this.state.beacons.length === 0
    )
      this.beginSettling()
  }

  private projectileCollision(
    previous: Pick<SimProjectile, 'position' | 'radius'>,
    next: Pick<SimProjectile, 'position' | 'radius'>,
  ): ProjectileContact | null {
    const distance = Math.hypot(
      next.position.x - previous.position.x,
      next.position.y - previous.position.y,
    )
    const samples = Math.max(1, Math.ceil(distance / 3))
    let lastPoint = previous.position
    const movement = {
      x: next.position.x - previous.position.x,
      y: next.position.y - previous.position.y,
    }
    let terminalContact: ProjectileContact | null = null
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples
      const point = {
        x: previous.position.x + (next.position.x - previous.position.x) * t,
        y: previous.position.y + (next.position.y - previous.position.y) * t,
      }
      const hitPlayers = this.state.players.filter(
        (player) =>
          player.alive &&
          Math.hypot(player.position.x - point.x, player.position.y - point.y) <
            player.radius + next.radius,
      )
      const contacts: Array<ProjectileContact | null> = []
      if (this.outOfBounds(point))
        contacts.push({
          kind: 'boundary',
          toi: t,
          position: point,
          normal: this.boundaryNormal(point, movement),
          stableId: 'boundary',
        })
      for (const hitPlayer of hitPlayers) {
        const dx = point.x - hitPlayer.position.x
        const dy = point.y - hitPlayer.position.y
        const length = Math.hypot(dx, dy)
        contacts.push({
          kind: 'player',
          toi: t,
          position: point,
          normal:
            length > Number.EPSILON
              ? { x: dx / length, y: dy / length }
              : this.oppositeDirection(movement),
          playerId: hitPlayer.id,
          stableId: hitPlayer.id,
        })
      }
      if (this.terrain.isSolid(point.x, point.y))
        contacts.push({
          kind: 'terrain',
          toi: t,
          position: point,
          normal: this.terrainImpactNormal(lastPoint, point, movement),
          stableId: `${Math.floor(point.y / this.terrain.scale)}:${Math.floor(point.x / this.terrain.scale)}`,
        })
      terminalContact = firstProjectileContact(contacts)
      if (terminalContact) break
      lastPoint = point
    }
    const reflectorContacts = this.map.objects.map((object) =>
      sweepCircleAgainstMapObject(previous.position, next.position, next.radius, object),
    )
    return firstProjectileContact([terminalContact, ...reflectorContacts])
  }

  private boundaryNormal(point: Vector, movement: Vector): Vector {
    let x = 0
    let y = 0
    if (point.x < 0) x = 1
    else if (point.x > this.state.worldWidth) x = -1
    if (point.y < 0) y = 1
    else if (point.y > this.state.worldHeight) y = -1
    const length = Math.hypot(x, y)
    return length > Number.EPSILON ? { x: x / length, y: y / length } : this.oppositeDirection(movement)
  }

  private terrainImpactNormal(previous: Vector, point: Vector, movement: Vector): Vector {
    const xBlocked = this.terrain.isSolid(point.x, previous.y)
    const yBlocked = this.terrain.isSolid(previous.x, point.y)
    let normal: Vector
    if (xBlocked && !yBlocked) normal = { x: -Math.sign(movement.x), y: 0 }
    else if (yBlocked && !xBlocked) normal = { x: 0, y: -Math.sign(movement.y) }
    else {
      const probe = this.terrain.scale
      const gradient = {
        x:
          Number(this.terrain.isSolid(point.x - probe, point.y)) -
          Number(this.terrain.isSolid(point.x + probe, point.y)),
        y:
          Number(this.terrain.isSolid(point.x, point.y - probe)) -
          Number(this.terrain.isSolid(point.x, point.y + probe)),
      }
      const length = Math.hypot(gradient.x, gradient.y)
      normal =
        length > Number.EPSILON
          ? { x: gradient.x / length, y: gradient.y / length }
          : this.oppositeDirection(movement)
    }
    if (Math.hypot(normal.x, normal.y) <= Number.EPSILON)
      return this.oppositeDirection(movement)
    if (normal.x * movement.x + normal.y * movement.y > 0)
      return { x: -normal.x, y: -normal.y }
    return normal
  }

  private oppositeDirection(vector: Vector): Vector {
    const length = Math.hypot(vector.x, vector.y)
    return length > Number.EPSILON
      ? { x: -vector.x / length, y: -vector.y / length }
      : { x: 0, y: -1 }
  }

  private fireScatter(shooter: SimPlayer, direction: Vector, weapon: WeaponDefinition): void {
    const endpoints: Vector[] = []
    const half = (weapon.pelletCount - 1) / 2
    const actionId = this.state.activeAction!.id
    for (let pellet = 0; pellet < weapon.pelletCount; pellet += 1) {
      const angle =
        Math.atan2(direction.y, direction.x) + (pellet - half) * weapon.pelletSpreadRadians
      const ray = { x: Math.cos(angle), y: Math.sin(angle) }
      let endpoint = {
        x: shooter.position.x + ray.x * weapon.pelletRange,
        y: shooter.position.y + ray.y * weapon.pelletRange,
      }
      for (let distance = 8; distance <= weapon.pelletRange; distance += 4) {
        const point = {
          x: shooter.position.x + ray.x * distance,
          y: shooter.position.y + ray.y * distance,
        }
        if (this.terrain.isSolid(point.x, point.y)) {
          endpoint = point
          break
        }
        const target = this.state.players.find(
          (player) =>
            player.id !== shooter.id &&
            player.alive &&
            Math.hypot(player.position.x - point.x, player.position.y - point.y) < player.radius,
        )
        if (!target) continue
        endpoint = point
        const damage = weapon.baseDamage * (1 - distance / (weapon.pelletRange + 60))
        this.damagePlayer(target, damage, actionId, shooter.id)
        target.velocity.x += ray.x * weapon.knockbackForce
        target.velocity.y += ray.y * weapon.knockbackForce - 35
        break
      }
      endpoints.push(endpoint)
    }
    this.emit({
      type: 'scatter-fired',
      actionId,
      origin: { ...shooter.position },
      endpoints,
    })
  }

  private strikeMelee(
    shooter: SimPlayer,
    direction: Vector,
    weapon: WeaponDefinition,
    actionId: string,
  ): void {
    const origin = { ...shooter.position }
    const range = weapon.meleeRange ?? 0
    let endpoint = {
      x: origin.x + direction.x * range,
      y: origin.y + direction.y * range,
    }
    let target: SimPlayer | null = null
    let blockedByTerrain = false
    for (let distance = 6; distance <= range; distance += 3) {
      const point = {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
      }
      if (this.terrain.isSolid(point.x, point.y)) {
        endpoint = point
        blockedByTerrain = true
        break
      }
      target =
        this.state.players.find(
          (candidate) =>
            candidate.id !== shooter.id &&
            candidate.alive &&
            Math.hypot(candidate.position.x - point.x, candidate.position.y - point.y) <
              candidate.radius + 4,
        ) ?? null
      if (!target) continue
      endpoint = point
      this.damagePlayer(target, weapon.baseDamage, actionId, shooter.id)
      target.velocity.x += direction.x * weapon.knockbackForce
      target.velocity.y += direction.y * weapon.knockbackForce - 45
      break
    }
    this.emit({
      type: 'melee-struck',
      actionId,
      origin,
      endpoint,
      targetPlayerId: target?.id ?? null,
      result: target ? 'player' : blockedByTerrain ? 'terrain' : 'miss',
    })
  }

  private boreDrill(projectile: SimProjectile, impact: Vector, weapon: WeaponDefinition): void {
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1
    const direction = {
      x: projectile.velocity.x / speed,
      y: projectile.velocity.y / speed,
    }
    const step = Math.max(4, weapon.drillRadius * 1.2)
    let endpoint = { ...impact }
    for (let distance = 0; distance <= weapon.drillDistance; distance += step) {
      const point = {
        x: impact.x + direction.x * distance,
        y: impact.y + direction.y * distance,
      }
      if (this.outOfBounds(point)) break
      const material = this.terrain.materialAt(point.x, point.y)
      if (this.terrain.isSolid(point.x, point.y) && !isDestructibleMaterial(material)) break
      this.destroyTerrainCircle(point, weapon.drillRadius, projectile.actionId)
      endpoint = point
    }
    this.emit({
      type: 'drill-bored',
      actionId: projectile.actionId,
      from: { ...impact },
      to: { ...endpoint },
    })
    this.explode(endpoint, weapon, projectile.actionId, projectile.ownerId)
  }

  private explode(
    center: Vector,
    weapon: WeaponDefinition,
    actionId: string,
    ownerId: string,
  ): void {
    this.emit({
      type: 'explosion-resolved',
      actionId,
      weaponId: weapon.id,
      position: { ...center },
      blastRadius: weapon.blastRadius,
    })
    this.destroyTerrainCircle(center, weapon.terrainRadius, actionId)
    for (const player of this.state.players) {
      if (!player.alive) continue
      const distance = Math.max(
        0,
        Math.hypot(player.position.x - center.x, player.position.y - center.y) - player.radius,
      )
      const damage = weapon.mechanic === 'cluster' ? weapon.clusterChildDamage : weapon.baseDamage
      const resolvedDamage = explosionFalloff(damage, weapon.blastRadius, distance)
      this.damagePlayer(player, resolvedDamage, actionId, ownerId)
      if (weapon.mechanic === 'freeze' && resolvedDamage > 0 && player.alive) {
        player.frozenTurnsRemaining = Math.max(
          player.frozenTurnsRemaining,
          weapon.freezeTurns ?? 0,
        )
        player.frozenAppliedTurn = this.state.turnNumber
        this.emit({ type: 'player-frozen', playerId: player.id, sourceActionId: actionId })
      }
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

  private destroyTerrainCircle(center: Vector, radius: number, actionId: string): void {
    if (radius <= 0) return
    const operation: TerrainOperation = {
      sequence: this.state.nextTerrainSequence++,
      tick: this.state.tick,
      type: 'subtract-circle',
      x: center.x,
      y: center.y,
      radius,
      sourceActionId: actionId,
    }
    this.state.terrainOperations.push(operation)
    this.terrain.removeCircle(center.x, center.y, radius)
    this.emit({ type: 'terrain-destroyed', operation })
  }

  private damagePlayer(
    player: SimPlayer,
    amount: number,
    sourceActionId: string,
    sourcePlayerId: string,
  ): void {
    if (amount <= 0) return
    const previous = player.health
    player.health = Math.max(0, player.health - amount)
    this.emit({
      type: 'player-damaged',
      playerId: player.id,
      amount: previous - player.health,
      sourceActionId,
      selfDamage: sourcePlayerId === player.id,
    })
    if (player.health === 0 && player.alive) {
      player.alive = false
      this.emit({ type: 'player-died', playerId: player.id })
    }
  }

  private advancePlayers(): void {
    for (const player of this.state.players) {
      if (!player.alive) continue
      player.velocity.y += GRAVITY * FIXED_TICK_SECONDS
      const candidateX = clamp(
        player.position.x + player.velocity.x * FIXED_TICK_SECONDS,
        player.radius,
        this.state.worldWidth - player.radius,
      )
      if (!this.playerHitsWall(player, candidateX)) player.position.x = candidateX
      else player.velocity.x = 0
      const candidateY = player.position.y + player.velocity.y * FIXED_TICK_SECONDS
      if (player.velocity.y < 0 && this.playerHitsCeiling(player, candidateY)) player.velocity.y = 0
      else player.position.y = candidateY
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
      if (player.position.y > this.state.worldHeight + 65) {
        player.health = 0
        player.alive = false
        this.emit({ type: 'player-died', playerId: player.id })
      }
    }
  }

  private resolveMinePosition(player: SimPlayer): Vector | null {
    const weapon = WEAPONS['deployable-mine']
    const x = player.position.x + player.facing * (player.radius + weapon.mineRadius + 6)
    if (x < weapon.mineRadius || x > this.state.worldWidth - weapon.mineRadius) return null
    const surface = this.terrain.surfaceY(x, Math.max(0, player.position.y - player.radius))
    if (surface === null || Math.abs(surface - (player.position.y + player.radius)) > 28) return null
    const position = { x, y: surface - weapon.mineRadius }
    if (this.terrain.isSolid(position.x, position.y)) return null
    if (
      this.state.mines.some(
        (mine) =>
          Math.hypot(mine.position.x - position.x, mine.position.y - position.y) <
          mine.radius + weapon.mineRadius + 8,
      )
    )
      return null
    return position
  }

  private advanceMines(): void {
    const remaining: SimMine[] = []
    for (const mine of this.state.mines) {
      if (!this.terrain.isSolid(mine.position.x, mine.position.y + mine.radius + 1)) continue
      const target = this.state.players.find(
        (player) =>
          player.alive &&
          player.teamId !== mine.teamId &&
          this.state.turnNumber >= mine.armedTurn &&
          Math.hypot(player.position.x - mine.position.x, player.position.y - mine.position.y) <
            mine.triggerRadius + player.radius,
      )
      if (!target) {
        remaining.push(mine)
        continue
      }
      this.emit({
        type: 'mine-triggered',
        mineId: mine.id,
        actionId: mine.actionId,
        position: { ...mine.position },
      })
      this.explode(mine.position, WEAPONS[mine.weaponId], mine.actionId, mine.ownerId)
      if (this.state.phase === 'input') this.beginSettling()
    }
    this.state.mines = remaining
  }

  private playerHitsWall(player: SimPlayer, candidateX: number): boolean {
    const side = candidateX + Math.sign(candidateX - player.position.x) * player.radius * 0.9
    return (
      this.terrain.isSolid(side, player.position.y - player.radius * 0.55) ||
      this.terrain.isSolid(side, player.position.y) ||
      this.terrain.isSolid(side, player.position.y + player.radius * 0.45)
    )
  }

  private playerHitsCeiling(player: SimPlayer, candidateY: number): boolean {
    const head = candidateY - player.radius
    return (
      this.terrain.isSolid(player.position.x, head) ||
      this.terrain.isSolid(player.position.x - player.radius * 0.55, head) ||
      this.terrain.isSolid(player.position.x + player.radius * 0.55, head)
    )
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
    if (
      this.activePlayer.frozenTurnsRemaining > 0 &&
      this.state.turnNumber > this.activePlayer.frozenAppliedTurn
    )
      this.activePlayer.frozenTurnsRemaining -= 1
    const next = nextScheduledTurn(
      this.state.players,
      this.state.activePlayerIndex,
      this.state.teamTurnCursors,
    )
    if (!next) return
    this.state.activePlayerIndex = next.playerIndex
    this.state.teamTurnCursors = next.cursors
    this.state.turnNumber += 1
    this.state.wind = windForTurn(this.state.seed, this.state.turnNumber)
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
    this.emit({ type: 'turn-started', playerId: this.activePlayer.id, wind: this.state.wind })
  }

  private checkVictory(): void {
    if (this.state.phase === 'victory') return
    const alive = this.state.players.filter((player) => player.alive)
    const aliveTeams = [...new Set(alive.map((player) => player.teamId))]
    if (aliveTeams.length > 1) return
    this.state.phase = 'victory'
    this.state.timerRemainingTicks = 0
    this.state.players.forEach((player) => {
      player.moveDirection = 0
    })
    this.state.winnerPlayerId = alive[0]?.id ?? null
    this.state.winnerTeamId = aliveTeams[0] ?? null
    this.state.isDraw = aliveTeams.length === 0
    this.emit({ type: 'match-ended', result: this.getResult() })
  }

  getResult(): SimulationMatchResult {
    const winnerIndex = this.state.winnerPlayerId
      ? this.state.players.findIndex((player) => player.id === this.state.winnerPlayerId)
      : null
    const winnerTeamId = this.state.winnerTeamId
    const winnerPlayerIndices =
      winnerTeamId === null
        ? []
        : this.state.players
            .map((player, index) => ({ player, index }))
            .filter(({ player }) => player.teamId === winnerTeamId)
            .map(({ index }) => index)
    return {
      config: this.state.config,
      winnerIndex,
      winnerTeamId,
      winnerPlayerIndices,
      remainingHealth:
        winnerTeamId === null
          ? 0
          : Math.ceil(
              this.state.players
                .filter((player) => player.teamId === winnerTeamId && player.alive)
                .reduce((total, player) => total + player.health, 0),
            ),
      turnsTaken: this.state.turnNumber,
      durationSeconds: Math.floor(this.state.durationTicks / SIMULATION_HZ),
    }
  }

  isValidTeleport(target: Vector, playerId = this.activePlayer.id): boolean {
    const player = this.state.players.find((candidate) => candidate.id === playerId)
    return player ? isTeleportDestinationValid(target, this.teleportContext(player)) : false
  }

  resolveTeleportTarget(pointer: Vector, playerId = this.activePlayer.id): Vector | null {
    const player = this.state.players.find((candidate) => candidate.id === playerId)
    return player ? resolveTeleportDestination(pointer, this.teleportContext(player)) : null
  }

  private teleportContext(player: SimPlayer) {
    return {
      terrain: this.terrain,
      worldWidth: this.state.worldWidth,
      worldHeight: this.state.worldHeight,
      player,
      players: this.state.players,
      weapon: WEAPONS.teleporter,
    }
  }

  private projectileOrigin(shooter: SimPlayer, direction: Vector): Vector {
    return {
      x: shooter.position.x + direction.x * (shooter.radius + 10),
      y: shooter.position.y + direction.y * (shooter.radius + 10),
    }
  }
  private outOfBounds(point: Vector): boolean {
    return (
      point.x < 0 ||
      point.x > this.state.worldWidth ||
      point.y < 0 ||
      point.y > this.state.worldHeight
    )
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
    return {
      version: SIMULATION_SNAPSHOT_VERSION,
      state: structuredClone(this.state),
      accumulatorSeconds: this.accumulator,
    }
  }
}

export function reconstructTerrain(
  mapId: string,
  operations: readonly TerrainOperation[],
): TerrainMask {
  const terrain = createMapTerrain(getMap(mapId))
  for (const operation of [...operations].sort((left, right) => left.sequence - right.sequence))
    terrain.removeCircle(operation.x, operation.y, operation.radius)
  return terrain
}
