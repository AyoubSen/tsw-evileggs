import Phaser from 'phaser'
import { aimDirection, launchVelocity } from '../../simulation/aim/aim'
import { explosionFalloff, knockbackVelocity } from '../../simulation/damage/explosion'
import { integrateProjectile } from '../../simulation/projectile/integrate'
import {
  canvasPointToWorld,
  canJump,
  dragAim,
  AIM_GUIDE_STEPS,
  DRAG_MAX_DISTANCE,
  DRAG_MIN_DISTANCE,
  DRAG_START_DISTANCE,
  isJumpCode,
  movementDirection,
  type DragAim,
} from '../../simulation/input/controls'
import {
  advanceTurnTimer,
  canAcceptPlayerInput,
  hasTurnExpired,
  nextActivePlayerIndex,
  nextTurnPhase,
  winningCharacterIndex,
} from '../../simulation/turns/turnMachine'
import {
  DEFAULT_AIM_ELEVATION,
  DEFAULT_POWER_PERCENT,
  FIXED_STEP_SECONDS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
} from '../../shared/constants'
import type { Character, ProjectileState, TurnPhase, Vector } from '../../shared/types'
import { TerrainMask } from '../../terrain/TerrainMask'
import { createMapTerrain, getMap, type MapId } from '../../maps/registry'
import {
  WEAPON_ORDER,
  WEAPONS,
  canUseWeapon,
  consumeWeapon,
  createWeaponInventory,
  type WeaponId,
  type WeaponInventory,
} from '../../weapons/registry'
import { validateMatchConfig, type LocalMatchConfig } from '../../match/config'
import type { GameEvents, MatchResult } from '../types'

const CHARACTER_RADIUS = 15
const TERRAIN_SCALE = 2
const SETTLE_TIME_SECONDS = 0.45
const MOVE_SPEED = 105
const MAX_STEP_UP = 12
const JUMP_VELOCITY = 310
const JUMP_HORIZONTAL_SPEED = 105
const TURN_EXPIRED_DELAY_SECONDS = 0.7

export class MatchScene extends Phaser.Scene {
  private terrain = new TerrainMask(
    GAME_WIDTH / TERRAIN_SCALE,
    GAME_HEIGHT / TERRAIN_SCALE,
    TERRAIN_SCALE,
  )
  private characters: Character[] = []
  private activeIndex = 0
  private phase: TurnPhase = 'input'
  private power = DEFAULT_POWER_PERCENT
  private shotDirection: Vector = aimDirection(DEFAULT_AIM_ELEVATION, 1)
  private worldAngle = DEFAULT_AIM_ELEVATION
  private shotDragDistance = DRAG_MIN_DISTANCE
  private turnTimeRemaining = 30
  private expiredDuration = 0
  private projectile: ProjectileState | null = null
  private projectileWeapon: WeaponId = 'basic-rocket'
  private projectileFuse = 0
  private clusterChildren: ProjectileState[] = []
  private inventories: WeaponInventory[] = []
  private selectedWeapons: WeaponId[] = ['basic-rocket', 'basic-rocket']
  private teleportTarget: Vector | null = null
  private terrainGraphics!: Phaser.GameObjects.Graphics
  private actorGraphics!: Phaser.GameObjects.Graphics
  private overlayGraphics!: Phaser.GameObjects.Graphics
  private backgroundGraphics!: Phaser.GameObjects.Graphics
  private hudGraphics!: Phaser.GameObjects.Graphics
  private topHud!: Phaser.GameObjects.Text
  private rightHud!: Phaser.GameObjects.Text
  private bottomHud!: Phaser.GameObjects.Text
  private bannerText!: Phaser.GameObjects.Text
  private canvas!: HTMLCanvasElement
  private pressedCodes = new Set<string>()
  private dragging = false
  private activePointerId: number | null = null
  private dragStart: Vector | null = null
  private dragPreview: DragAim | null = null
  private jumpReady = true
  private settleDuration = 0
  private winner: number | null = null
  private mapId: MapId = 'rolling-hills'
  private config: LocalMatchConfig = validateMatchConfig(undefined)
  private eventsFromHost: GameEvents | null = null
  private paused = false
  private introDuration = 0
  private turnBannerDuration = 0
  private turnsTaken = 0
  private matchDuration = 0
  private reducedMotion = false
  private aimGuide: 'normal' | 'minimal' = 'normal'

  constructor() {
    super('match')
  }

  init(data: {
    config?: LocalMatchConfig
    events?: GameEvents
    reducedMotion?: boolean
    aimGuide?: 'normal' | 'minimal'
  }): void {
    this.config = validateMatchConfig(data.config)
    this.mapId = this.config.mapId
    this.eventsFromHost = data.events ?? null
    this.reducedMotion = data.reducedMotion === true
    this.aimGuide = data.aimGuide === 'minimal' ? 'minimal' : 'normal'
  }

  create(): void {
    this.backgroundGraphics = this.add.graphics()
    this.terrainGraphics = this.add.graphics()
    this.actorGraphics = this.add.graphics()
    this.overlayGraphics = this.add.graphics()
    this.hudGraphics = this.add.graphics()
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Trebuchet MS, Arial, sans-serif',
      fontSize: '13px',
      color: '#fff8df',
      fontStyle: 'bold',
    }
    this.topHud = this.add.text(0, 0, '', hudStyle)
    this.rightHud = this.add.text(0, 0, '', hudStyle)
    this.bottomHud = this.add.text(0, 0, '', hudStyle)
    this.bannerText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18, '', {
        ...hudStyle,
        fontSize: '25px',
        color: '#fff8df',
        align: 'center',
        stroke: '#473b31',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
    this.installInput()
    this.resetMatch()
  }

  update(_: number, deltaMilliseconds: number): void {
    const delta = Math.min(deltaMilliseconds / 1000, 0.05)
    if (this.paused) return
    if (this.phase === 'victory') {
      this.render()
      return
    }
    this.matchDuration += delta
    if (this.introDuration > 0) {
      this.introDuration = Math.max(0, this.introDuration - delta)
      this.render()
      return
    }
    this.turnBannerDuration = Math.max(0, this.turnBannerDuration - delta)
    this.advanceInputTimer(delta)
    this.handleInput(delta)
    this.simulate(delta)
    this.render()
  }

  private resetMatch(): void {
    const map = getMap(this.mapId)
    this.terrain = createMapTerrain(map, TERRAIN_SCALE)
    this.characters = [
      this.makeCharacter(this.config.playerNames[0], 0x62d7ff, map.spawnPoints[0]),
      this.makeCharacter(this.config.playerNames[1], 0xffab5b, map.spawnPoints[1]),
    ]
    this.inventories = [createWeaponInventory(), createWeaponInventory()]
    this.selectedWeapons = ['basic-rocket', 'basic-rocket']
    this.activeIndex = 0
    this.phase = 'input'
    this.setDefaultAim()
    this.turnTimeRemaining = this.config.turnDurationSeconds
    this.expiredDuration = 0
    this.projectile = null
    this.clusterChildren = []
    this.teleportTarget = null
    this.winner = null
    this.settleDuration = 0
    this.clearDrag()
    this.pressedCodes.clear()
    this.jumpReady = true
    this.paused = false
    this.introDuration = this.reducedMotion ? 0 : 1.8
    this.turnBannerDuration = 0
    this.turnsTaken = 0
    this.matchDuration = 0
    this.render()
  }

  private makeCharacter(name: string, color: number, x: number): Character {
    const surface = this.terrain.surfaceY(x) ?? GAME_HEIGHT
    return {
      id: name.toLowerCase(),
      name,
      color,
      position: { x, y: surface - CHARACTER_RADIUS },
      velocity: { x: 0, y: 0 },
      health: 100,
      radius: CHARACTER_RADIUS,
      alive: true,
      grounded: true,
    }
  }

  private handleInput(delta: number): void {
    if (!this.canControlActivePlayer()) return
    this.moveActiveCharacter(movementDirection(this.pressedCodes), delta)
  }

  private canControlActivePlayer(): boolean {
    return (
      !this.paused &&
      this.introDuration <= 0 &&
      this.turnBannerDuration <= 0 &&
      canAcceptPlayerInput(this.phase) &&
      this.turnTimeRemaining > 0
    )
  }

  private advanceInputTimer(delta: number): void {
    if (this.turnBannerDuration > 0) return
    if (!canAcceptPlayerInput(this.phase)) return
    this.turnTimeRemaining = advanceTurnTimer(this.phase, this.turnTimeRemaining, delta)
    if (hasTurnExpired(this.phase, this.turnTimeRemaining)) this.expireTurn()
  }

  private expireTurn(): void {
    if (!canAcceptPlayerInput(this.phase)) return
    this.turnTimeRemaining = 0
    this.phase = 'expired'
    this.expiredDuration = 0
    this.pressedCodes.clear()
    this.clearDrag()
  }

  private installInput(): void {
    this.canvas = this.game.canvas
    this.canvas.tabIndex = 0
    this.canvas.style.touchAction = 'none'
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.canvas.addEventListener('keydown', this.onKeyDown)
    this.canvas.addEventListener('keyup', this.onKeyUp)
    this.canvas.addEventListener('blur', this.onCanvasBlur)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeInput, this)
  }

  private removeInput(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    this.canvas.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('blur', this.onCanvasBlur)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.phase !== 'victory') {
      event.preventDefault()
      this.eventsFromHost?.onPauseRequest()
      return
    }
    if (this.introDuration > 0 && ['Enter', 'Space'].includes(event.code)) {
      event.preventDefault()
      this.introDuration = 0
      this.turnBannerDuration = 0
      return
    }
    if (
      ![
        'KeyQ',
        'KeyA',
        'KeyD',
        'KeyZ',
        'KeyW',
        'Enter',
        'Space',
        'KeyR',
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
      ].includes(event.code)
    )
      return
    event.preventDefault()
    this.pressedCodes.add(event.code)
    if (event.code === 'KeyR' && !event.repeat) this.eventsFromHost?.onPauseRequest()
    if (event.code.startsWith('Digit') && !event.repeat && this.canControlActivePlayer())
      this.selectWeapon(Number(event.code.slice(-1)) - 1)
    if (event.code === 'Space' && !event.repeat && this.canControlActivePlayer()) this.fire()
    if (isJumpCode(event.code) && !event.repeat) this.jumpActiveCharacter()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedCodes.delete(event.code)
    if (isJumpCode(event.code)) this.jumpReady = true
  }

  private readonly onCanvasBlur = (): void => {
    this.pressedCodes.clear()
    this.jumpReady = true
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.canControlActivePlayer()) return
    this.canvas.focus()
    this.canvas.setPointerCapture(event.pointerId)
    this.dragging = true
    this.activePointerId = event.pointerId
    this.dragStart = this.pointerWorldPoint(event)
    this.dragPreview = null
    event.preventDefault()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.canControlActivePlayer()) return
    const pointer = this.pointerWorldPoint(event)
    if (this.selectedWeapon().aimMode === 'target-position') {
      const surface = this.terrain.surfaceY(pointer.x)
      this.teleportTarget =
        surface === null ? pointer : { x: pointer.x, y: surface - CHARACTER_RADIUS }
      event.preventDefault()
      return
    }
    if (!this.dragging) return
    if (
      this.dragStart &&
      Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y) >= DRAG_START_DISTANCE
    ) {
      const shooter = this.characters[this.activeIndex]
      this.dragPreview = dragAim(
        this.aimOrigin(shooter),
        pointer,
        POWER_MIN_PERCENT,
        POWER_MAX_PERCENT,
      )
    }
    event.preventDefault()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return
    if (this.canControlActivePlayer() && this.dragPreview) {
      this.shotDirection = this.dragPreview.direction
      this.power = this.dragPreview.power
      this.worldAngle = this.dragPreview.worldAngle
      this.shotDragDistance = this.dragPreview.distance
    }
    this.clearDrag(event.pointerId)
    event.preventDefault()
  }

  private readonly onPointerCancel = (event: PointerEvent): void => this.clearDrag(event.pointerId)

  private clearDrag(pointerId = this.activePointerId ?? undefined): void {
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId))
      this.canvas.releasePointerCapture(pointerId)
    this.dragging = false
    this.activePointerId = null
    this.dragStart = null
    this.dragPreview = null
  }

  private pointerWorldPoint(event: PointerEvent): Vector {
    return canvasPointToWorld(
      event.clientX,
      event.clientY,
      this.canvas.getBoundingClientRect(),
      GAME_WIDTH,
      GAME_HEIGHT,
    )
  }

  private moveActiveCharacter(direction: number, delta: number): void {
    const character = this.characters[this.activeIndex]
    if (direction === 0 || !character.grounded || !character.alive) return
    const distance = MOVE_SPEED * delta
    const candidateX = Phaser.Math.Clamp(
      character.position.x + direction * distance,
      character.radius,
      GAME_WIDTH - character.radius,
    )
    const candidateSurface = this.terrain.surfaceY(candidateX, 0)
    const currentFoot = character.position.y + character.radius
    if (candidateSurface === null || currentFoot - candidateSurface > MAX_STEP_UP) return
    if (candidateX === character.position.x) return
    character.position.x = candidateX
    // Step onto gentle rises. Descents are handled by gravity so crater edges remain fallable.
    if (candidateSurface <= currentFoot) character.position.y = candidateSurface - character.radius
    character.velocity.x = 0
  }

  private jumpActiveCharacter(): void {
    const character = this.characters[this.activeIndex]
    if (
      !character ||
      !this.canControlActivePlayer() ||
      !canJump(this.phase, character.grounded, this.jumpReady)
    )
      return
    character.velocity.y = -JUMP_VELOCITY
    character.velocity.x = movementDirection(this.pressedCodes) * JUMP_HORIZONTAL_SPEED
    character.grounded = false
    this.jumpReady = false
  }

  private fire(): void {
    if (!this.canControlActivePlayer()) {
      if (canAcceptPlayerInput(this.phase)) this.expireTurn()
      return
    }
    const shooter = this.characters[this.activeIndex]
    if (!shooter.alive) return
    this.ensureSelectedWeapon()
    const weapon = this.selectedWeapon()
    if (!canUseWeapon(this.inventories[this.activeIndex], weapon.id)) return
    if (weapon.id === 'teleporter') {
      if (!this.isValidTeleport(this.teleportTarget)) return
      shooter.position = { x: this.teleportTarget!.x, y: this.teleportTarget!.y }
      shooter.velocity = { x: 0, y: 0 }
      this.inventories[this.activeIndex] = consumeWeapon(
        this.inventories[this.activeIndex],
        weapon.id,
      )
      this.phase = 'settling'
      this.settleDuration = 0
      return
    }
    this.inventories[this.activeIndex] = consumeWeapon(
      this.inventories[this.activeIndex],
      weapon.id,
    )
    if (weapon.id === 'scatter-shot') {
      this.fireScatter(weapon)
      this.phase = 'settling'
      this.settleDuration = 0
      return
    }
    this.projectile = {
      position: this.projectileOrigin(shooter, this.shotDirection),
      velocity: launchVelocity(this.shotDirection, weapon.projectileSpeed, this.power),
      radius: 5,
    }
    this.projectileWeapon = weapon.id
    this.projectileFuse = weapon.id === 'timed-grenade' ? 3 : 0
    this.phase = 'projectile'
    this.clearDrag()
  }

  private setDefaultAim(): void {
    const facing = this.activeIndex === 0 ? 1 : -1
    this.shotDirection = aimDirection(DEFAULT_AIM_ELEVATION, facing)
    this.worldAngle = facing === 1 ? DEFAULT_AIM_ELEVATION : 180 - DEFAULT_AIM_ELEVATION
    this.power = DEFAULT_POWER_PERCENT
    this.shotDragDistance = this.powerToDragDistance(this.power)
  }

  private selectedWeapon(): (typeof WEAPONS)[WeaponId] {
    return WEAPONS[this.selectedWeapons[this.activeIndex]]
  }

  private ensureSelectedWeapon(): void {
    const selected = this.selectedWeapons[this.activeIndex]
    if (!canUseWeapon(this.inventories[this.activeIndex], selected))
      this.selectedWeapons[this.activeIndex] = 'basic-rocket'
  }

  private selectWeapon(index: number): void {
    const id = WEAPON_ORDER[index]
    if (id && canUseWeapon(this.inventories[this.activeIndex], id)) {
      this.selectedWeapons[this.activeIndex] = id
      this.teleportTarget = null
      this.clearDrag()
    }
  }

  private isValidTeleport(target: Vector | null): target is Vector {
    if (
      !target ||
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
    return !this.characters.some(
      (character, index) =>
        index !== this.activeIndex &&
        character.alive &&
        Math.hypot(character.position.x - target.x, character.position.y - target.y) <
          character.radius * 2,
    )
  }

  private fireScatter(weapon: (typeof WEAPONS)[WeaponId]): void {
    const shooter = this.characters[this.activeIndex]
    for (let pellet = -3; pellet <= 3; pellet += 1) {
      const angle = Math.atan2(this.shotDirection.y, this.shotDirection.x) + pellet * 0.055
      const direction = { x: Math.cos(angle), y: Math.sin(angle) }
      for (let distance = 8; distance <= 250; distance += 4) {
        const point = {
          x: shooter.position.x + direction.x * distance,
          y: shooter.position.y + direction.y * distance,
        }
        if (this.terrain.isSolid(point.x, point.y)) break
        const target = this.characters.find(
          (character, index) =>
            index !== this.activeIndex &&
            character.alive &&
            Math.hypot(character.position.x - point.x, character.position.y - point.y) <
              character.radius,
        )
        if (target) {
          const damage = weapon.baseDamage * (1 - distance / 300)
          target.health = Math.max(0, target.health - damage)
          target.velocity.x += direction.x * weapon.knockbackForce
          target.velocity.y += direction.y * weapon.knockbackForce - 35
          if (target.health === 0) target.alive = false
          break
        }
      }
    }
  }

  private powerToDragDistance(power: number): number {
    const normalized = (power - POWER_MIN_PERCENT) / (POWER_MAX_PERCENT - POWER_MIN_PERCENT)
    return Phaser.Math.Clamp(
      DRAG_MIN_DISTANCE + normalized * (DRAG_MAX_DISTANCE - DRAG_MIN_DISTANCE),
      DRAG_MIN_DISTANCE,
      DRAG_MAX_DISTANCE,
    )
  }

  private projectileOrigin(shooter: Character, direction: Vector): Vector {
    return {
      x: shooter.position.x + direction.x * (shooter.radius + 10),
      y: shooter.position.y + direction.y * (shooter.radius + 10),
    }
  }

  private aimOrigin(shooter: Character): Vector {
    return { x: shooter.position.x, y: shooter.position.y - 6 }
  }

  private simulate(delta: number): void {
    let remaining = delta
    while (remaining > 0) {
      const step = Math.min(remaining, FIXED_STEP_SECONDS)
      this.simulateStep(step)
      remaining -= step
    }
  }

  private simulateStep(delta: number): void {
    if (this.phase === 'projectile' && this.projectile) this.advanceProjectile(delta)
    if (this.phase === 'projectile' && this.clusterChildren.length > 0)
      this.advanceClusterChildren(delta)
    this.advanceCharacters(delta)
    this.checkVictory()
    if (this.phase === 'settling') this.advanceSettling(delta)
    if (this.phase === 'expired') this.advanceExpiredTurn(delta)
  }

  private advanceClusterChildren(delta: number): void {
    const remaining: ProjectileState[] = []
    for (const child of this.clusterChildren) {
      const next = integrateProjectile(child, GRAVITY, delta)
      const impact = this.projectileCollision(child, next)
      if (impact) this.explode(impact, WEAPONS['cluster-charge'])
      else if (!this.outOfBounds(next.position)) remaining.push(next)
    }
    this.clusterChildren = remaining
    if (this.clusterChildren.length === 0 && !this.projectile) {
      this.phase = 'settling'
      this.settleDuration = 0
    }
  }

  private advanceProjectile(delta: number): void {
    const previous = this.projectile!
    const weapon = WEAPONS[this.projectileWeapon]
    this.projectileFuse -= delta
    if (this.projectileWeapon === 'timed-grenade' && this.projectileFuse <= 0) {
      this.explode(previous.position, weapon)
      return
    }
    const next = integrateProjectile(previous, GRAVITY * weapon.gravityScale, delta)
    const impact = this.projectileCollision(previous, next)
    if (impact) {
      if (this.projectileWeapon === 'timed-grenade') {
        this.projectile = {
          ...next,
          position: { x: impact.x, y: impact.y - 4 },
          velocity: { x: next.velocity.x * 0.45, y: -Math.abs(next.velocity.y) * 0.42 },
        }
      } else if (this.projectileWeapon === 'cluster-charge') {
        this.releaseCluster(impact)
      } else this.explode(impact, weapon)
      return
    }
    this.projectile = next
  }

  private projectileCollision(previous: ProjectileState, next: ProjectileState): Vector | null {
    const distance = Math.hypot(
      next.position.x - previous.position.x,
      next.position.y - previous.position.y,
    )
    const samples = Math.max(1, Math.ceil(distance / 3))
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples
      const point = {
        x: Phaser.Math.Linear(previous.position.x, next.position.x, t),
        y: Phaser.Math.Linear(previous.position.y, next.position.y, t),
      }
      const hitCharacter = this.characters.find(
        (character) =>
          character.alive &&
          Math.hypot(character.position.x - point.x, character.position.y - point.y) <
            character.radius + next.radius,
      )
      if (this.terrain.isSolid(point.x, point.y) || hitCharacter || this.outOfBounds(point)) {
        return point
      }
    }
    return null
  }

  private outOfBounds(point: Vector): boolean {
    return point.x < 0 || point.x > GAME_WIDTH || point.y < 0 || point.y > GAME_HEIGHT
  }

  private releaseCluster(center: Vector): void {
    this.projectile = null
    this.clusterChildren = [-0.9, -0.45, 0, 0.45, 0.9].map((angle) => ({
      position: { ...center },
      velocity: { x: Math.cos(angle) * 230, y: -Math.sin(angle) * 230 - 160 },
      radius: 4,
    }))
  }

  private explode(center: Vector, weapon = WEAPONS[this.projectileWeapon]): void {
    this.projectile = null
    this.terrain.removeCircle(center.x, center.y, weapon.terrainRadius)
    for (const character of this.characters) {
      if (!character.alive) continue
      const targetDistance = Math.max(
        0,
        Math.hypot(character.position.x - center.x, character.position.y - center.y) -
          character.radius,
      )
      const damage = explosionFalloff(weapon.baseDamage, weapon.blastRadius, targetDistance)
      character.health = Math.max(0, character.health - damage)
      const knockback = knockbackVelocity(
        center,
        character.position,
        weapon.knockbackForce,
        weapon.blastRadius,
      )
      character.velocity.x += knockback.x
      character.velocity.y += knockback.y
      if (character.health === 0) character.alive = false
    }
    if (this.clusterChildren.length === 0) {
      this.phase = nextTurnPhase('projectile', false, false)
      this.settleDuration = 0
    }
  }

  private advanceCharacters(delta: number): void {
    for (const character of this.characters) {
      if (!character.alive) continue
      character.velocity.y += GRAVITY * delta
      character.position.x = Phaser.Math.Clamp(
        character.position.x + character.velocity.x * delta,
        character.radius,
        GAME_WIDTH - character.radius,
      )
      character.position.y += character.velocity.y * delta
      character.velocity.x *= Math.pow(0.12, delta)
      const surface = this.terrain.surfaceY(
        character.position.x,
        Math.max(0, character.position.y - character.radius),
      )
      if (
        surface !== null &&
        character.position.y + character.radius >= surface &&
        character.velocity.y >= 0
      ) {
        character.position.y = surface - character.radius
        character.velocity.y = 0
        character.grounded = true
      } else {
        character.grounded = false
      }
      if (character.position.y > GAME_HEIGHT + 65) {
        character.health = 0
        character.alive = false
      }
    }
  }

  private advanceSettling(delta: number): void {
    const settled = this.characters.every(
      (character) =>
        !character.alive ||
        (character.grounded &&
          Math.abs(character.velocity.x) < 4 &&
          Math.abs(character.velocity.y) < 4),
    )
    this.settleDuration = settled ? this.settleDuration + delta : 0
    if (this.settleDuration >= SETTLE_TIME_SECONDS) {
      this.beginNextTurn()
    }
  }

  private advanceExpiredTurn(delta: number): void {
    this.expiredDuration += delta
    if (this.expiredDuration >= TURN_EXPIRED_DELAY_SECONDS) this.beginNextTurn()
  }

  private beginNextTurn(): void {
    this.activeIndex = nextActivePlayerIndex(this.activeIndex, this.characters.length)
    this.phase = 'input'
    this.setDefaultAim()
    this.ensureSelectedWeapon()
    this.turnTimeRemaining = this.config.turnDurationSeconds
    this.expiredDuration = 0
    this.clearDrag()
    this.pressedCodes.clear()
    this.jumpReady = true
    this.turnsTaken += 1
    this.turnBannerDuration = this.reducedMotion ? 0 : 0.85
  }

  private checkVictory(): void {
    const alive = this.characters.map((character) => character.alive)
    const winningIndex = winningCharacterIndex(alive)
    if (alive.filter(Boolean).length <= 1) {
      this.winner = winningIndex
      this.phase = 'victory'
      this.turnTimeRemaining = 0
      this.clearDrag()
      this.eventsFromHost?.onResult(this.resultData())
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused
    this.pressedCodes.clear()
    this.clearDrag()
    this.render()
  }

  public restartMatch(): void {
    this.resetMatch()
  }

  private resultData(): MatchResult {
    const winner = this.winner === null ? null : this.characters[this.winner]
    return {
      config: this.config,
      winnerIndex: this.winner,
      remainingHealth: winner ? Math.ceil(winner.health) : 0,
      turnsTaken: this.turnsTaken,
      durationSeconds: Math.floor(this.matchDuration),
    }
  }

  private render(): void {
    this.renderBackdrop()
    this.renderTerrain()
    this.renderActors()
    this.renderOverlay()
    const active = this.characters[this.activeIndex]
    const phaseText =
      this.phase === 'settling'
        ? 'Terrain settling'
        : this.phase === 'projectile'
          ? 'Projectile in flight'
          : this.phase === 'expired'
            ? 'Time expired'
            : ''
    const displayAim = this.dragPreview ?? {
      direction: this.shotDirection,
      power: this.power,
      distance: this.shotDragDistance,
      worldAngle: this.worldAngle,
    }
    const inputText = this.dragging
      ? this.dragPreview
        ? 'Pull back: release to lock'
        : 'Pull farther to set aim'
      : `${active.name}'s Turn`
    const timeText = `${this.turnTimeRemaining <= 5 ? this.turnTimeRemaining.toFixed(1) : Math.ceil(this.turnTimeRemaining)}s`
    const weaponList = WEAPON_ORDER.map((id, index) => {
      const ammo = this.inventories[this.activeIndex][id]
      const selected = this.selectedWeapons[this.activeIndex] === id
      return `${selected ? '◆' : '◇'} ${index + 1} ${ammo === 'unlimited' ? '∞' : ammo}`
    }).join('    ')
    this.renderHud(timeText, inputText || phaseText, weaponList, displayAim)
    if (this.introDuration > 0 || this.turnBannerDuration > 0) {
      const message =
        this.introDuration > 0
          ? `${getMap(this.mapId).displayName}\n${this.characters[0].name} vs ${this.characters[1].name}\n${this.introDuration > 0.6 ? Math.ceil(this.introDuration / 0.6) : 'Begin'}`
          : `${active.name}'s Turn`
      this.bannerText
        .setText(message)
        .setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18)
        .setOrigin(0.5)
        .setStyle({ fontSize: '25px', strokeThickness: 5 })
        .setVisible(true)
    }
  }

  private renderHud(timeText: string, status: string, weapons: string, aim: DragAim): void {
    this.hudGraphics.clear()
    const left = this.characters[0]
    const right = this.characters[1]
    this.hudGraphics.fillStyle(0x473b31, 0.88)
    this.hudGraphics.fillRoundedRect(12, 10, 225, 46, 10)
    this.hudGraphics.fillRoundedRect(GAME_WIDTH - 237, 10, 225, 46, 10)
    this.hudGraphics.fillRoundedRect(GAME_WIDTH / 2 - 64, 9, 128, 47, 18)
    this.hudGraphics.fillRoundedRect(15, GAME_HEIGHT - 72, GAME_WIDTH - 30, 57, 14)
    this.hudGraphics.fillStyle(0x5bbf72)
    this.hudGraphics.fillRoundedRect(32, 40, 150 * (left.health / 100), 6, 3)
    this.hudGraphics.fillRoundedRect(GAME_WIDTH - 182, 40, 150 * (right.health / 100), 6, 3)
    this.hudGraphics.fillStyle(this.turnTimeRemaining <= 5 ? 0xe65d3d : 0xf7bd3f)
    this.hudGraphics.fillCircle(GAME_WIDTH / 2, 31, 18)
    this.topHud
      .setPosition(27, 17)
      .setOrigin(0, 0)
      .setText(
        `${this.activeIndex === 0 ? '◆ ' : ''}${left.name}\n${Math.ceil(left.health)} health`,
      )
    this.rightHud
      .setPosition(GAME_WIDTH - 27, 17)
      .setOrigin(1, 0)
      .setText(
        `${this.activeIndex === 1 ? '◆ ' : ''}${right.name}\n${Math.ceil(right.health)} health`,
      )
    this.bannerText
      .setText(timeText)
      .setPosition(GAME_WIDTH / 2, 17)
      .setOrigin(0.5, 0)
      .setStyle({ fontSize: '17px', strokeThickness: 3 })
      .setVisible(true)
    const hint =
      status ||
      (this.selectedWeapon().aimMode === 'target-position'
        ? 'Point at safe ground · Space to warp'
        : `Power ${Math.round(aim.power)}%`)
    this.bottomHud
      .setPosition(31, GAME_HEIGHT - 64)
      .setOrigin(0, 0)
      .setText(`${weapons}\n${this.selectedWeapon().displayName} · ${hint}`)
  }

  private renderBackdrop(): void {
    this.backgroundGraphics.clear()
    this.backgroundGraphics.fillStyle(0x9edce5).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.backgroundGraphics.fillStyle(0xffedb1, 0.7).fillCircle(GAME_WIDTH - 110, 105, 46)
    this.backgroundGraphics
      .fillStyle(0x78b996, 0.45)
      .fillEllipse(170, 340, 430, 155)
      .fillEllipse(775, 330, 470, 165)
    this.backgroundGraphics
      .fillStyle(0xffffff, 0.62)
      .fillEllipse(135, 112, 115, 20)
      .fillEllipse(655, 145, 145, 25)
  }

  private renderTerrain(): void {
    this.terrainGraphics.clear()
    this.terrainGraphics.fillStyle(0x9a673e)
    for (let x = 0; x < this.terrain.width; x += 1) {
      let runStart = -1
      for (let y = 0; y <= this.terrain.height; y += 1) {
        const solid =
          y < this.terrain.height && this.terrain.cells[y * this.terrain.width + x] === 1
        if (solid && runStart === -1) runStart = y
        if (!solid && runStart !== -1) {
          this.terrainGraphics.fillRect(
            x * TERRAIN_SCALE,
            runStart * TERRAIN_SCALE,
            TERRAIN_SCALE,
            (y - runStart) * TERRAIN_SCALE,
          )
          runStart = -1
        }
      }
    }
    this.terrainGraphics.lineStyle(3, 0x437c53, 0.95)
    for (let x = 0; x < GAME_WIDTH; x += 3) {
      const y = this.terrain.surfaceY(x)
      const next = this.terrain.surfaceY(x + 3)
      if (y !== null && next !== null) this.terrainGraphics.lineBetween(x, y - 1, x + 3, next - 1)
    }
  }

  private renderActors(): void {
    this.actorGraphics.clear()
    for (const character of this.characters) {
      if (!character.alive) continue
      const facing = character === this.characters[0] ? 1 : -1
      const bob = character.grounded
        ? Math.sin(this.matchDuration * 3 + (facing === 1 ? 0 : 1)) * 1.5
        : 0
      const x = character.position.x
      const y = character.position.y + bob
      this.actorGraphics.fillStyle(0x473b31, 0.85)
      this.actorGraphics.fillEllipse(x + 3, y + character.radius + 8, 32, 9)
      this.actorGraphics.fillStyle(character.color)
      this.actorGraphics.fillRoundedRect(x - 17, y - 13, 34, 31, 12)
      this.actorGraphics.fillStyle(0xfff6d8)
      this.actorGraphics.fillEllipse(x + facing * 3, y - 3, 22, 15)
      this.actorGraphics.fillStyle(0x24313a)
      this.actorGraphics.fillCircle(x + facing * 7, y - 4, 2.8)
      this.actorGraphics.fillCircle(x + facing * 1, y - 4, 2.8)
      this.actorGraphics.lineStyle(2, 0x24313a)
      this.actorGraphics.lineBetween(x + facing * 2, y + 5, x + facing * 8, y + 5)
      this.actorGraphics.fillStyle(facing === 1 ? 0xf7bd3f : 0xed7090)
      this.actorGraphics.fillTriangle(
        x - 13 * facing,
        y - 13,
        x - 4 * facing,
        y - 25,
        x - 3 * facing,
        y - 11,
      )
      if (this.phase === 'input' && this.characters[this.activeIndex] === character) {
        this.actorGraphics.lineStyle(3, 0xf7bd3f)
        this.actorGraphics.strokeCircle(x, y, character.radius + 7)
      }
    }
  }

  private renderOverlay(): void {
    this.overlayGraphics.clear()
    if (this.phase === 'input') {
      const shooter = this.characters[this.activeIndex]
      const aim = this.dragPreview ?? {
        direction: this.shotDirection,
        power: this.power,
        distance: this.shotDragDistance,
        worldAngle: this.worldAngle,
      }
      const valid = !this.dragging || this.dragPreview !== null
      if (this.selectedWeapon().aimMode === 'target-position') this.renderTeleportMarker()
      else {
        this.renderAimArrow(this.aimOrigin(shooter), aim.direction, aim.distance, valid)
        this.renderAimGuide(this.projectileOrigin(shooter, aim.direction), aim.direction, aim.power)
      }
    }
    if (this.projectile) {
      this.overlayGraphics.fillStyle(
        this.projectileWeapon === 'timed-grenade' ? 0x8ee3a0 : 0xffe186,
      )
      this.overlayGraphics.fillCircle(
        this.projectile.position.x,
        this.projectile.position.y,
        this.projectile.radius,
      )
      if (this.projectileWeapon === 'timed-grenade') {
        this.overlayGraphics.lineStyle(1, 0xffffff, 0.8)
        this.overlayGraphics.strokeCircle(
          this.projectile.position.x,
          this.projectile.position.y,
          8 + (this.projectileFuse % 1) * 3,
        )
      }
    }
    this.overlayGraphics.fillStyle(0xdca8ff)
    for (const child of this.clusterChildren)
      this.overlayGraphics.fillCircle(child.position.x, child.position.y, child.radius)
  }

  private renderAimArrow(
    origin: Vector,
    direction: Vector,
    distance: number,
    valid: boolean,
  ): void {
    const color = valid ? 0xffef8a : 0xff7d7d
    const endpoint = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
    const minimum = {
      x: origin.x + direction.x * DRAG_MIN_DISTANCE,
      y: origin.y + direction.y * DRAG_MIN_DISTANCE,
    }
    const maximum = {
      x: origin.x + direction.x * DRAG_MAX_DISTANCE,
      y: origin.y + direction.y * DRAG_MAX_DISTANCE,
    }
    this.overlayGraphics.lineStyle(1, color, 0.25)
    this.overlayGraphics.lineBetween(origin.x, origin.y, maximum.x, maximum.y)
    this.overlayGraphics.fillStyle(color, 0.55)
    this.overlayGraphics.fillCircle(minimum.x, minimum.y, 3)
    this.overlayGraphics.fillCircle(maximum.x, maximum.y, 3)
    this.overlayGraphics.lineStyle(3, color, 0.95)
    this.overlayGraphics.lineBetween(origin.x, origin.y, endpoint.x, endpoint.y)
    this.overlayGraphics.fillStyle(color, 1)
    this.overlayGraphics.fillTriangle(
      endpoint.x + direction.y * 6,
      endpoint.y - direction.x * 6,
      endpoint.x - direction.y * 6,
      endpoint.y + direction.x * 6,
      endpoint.x + direction.x * 12,
      endpoint.y + direction.y * 12,
    )
  }

  private renderAimGuide(origin: Vector, direction: Vector, power: number): void {
    let previous: ProjectileState = {
      position: origin,
      velocity: launchVelocity(direction, this.selectedWeapon().projectileSpeed, power),
      radius: 5,
    }
    this.overlayGraphics.fillStyle(0xb5dfff, 0.75)
    const guideSteps = this.aimGuide === 'minimal' ? 3 : AIM_GUIDE_STEPS
    for (let step = 0; step < guideSteps; step += 1) {
      const next = integrateProjectile(
        previous,
        GRAVITY * this.selectedWeapon().gravityScale,
        FIXED_STEP_SECONDS,
      )
      const impact = this.projectileCollision(previous, next)
      const point = impact ?? next.position
      this.overlayGraphics.fillCircle(point.x, point.y, impact ? 3 : 1.75)
      if (impact) break
      previous = next
    }
  }

  private renderTeleportMarker(): void {
    if (!this.teleportTarget) return
    const valid = this.isValidTeleport(this.teleportTarget)
    this.overlayGraphics.lineStyle(2, valid ? 0x7bdcff : 0xff7d7d, 0.95)
    this.overlayGraphics.strokeCircle(
      this.teleportTarget.x,
      this.teleportTarget.y,
      CHARACTER_RADIUS,
    )
    this.overlayGraphics.lineBetween(
      this.teleportTarget.x - 9,
      this.teleportTarget.y,
      this.teleportTarget.x + 9,
      this.teleportTarget.y,
    )
    this.overlayGraphics.lineBetween(
      this.teleportTarget.x,
      this.teleportTarget.y - 9,
      this.teleportTarget.x,
      this.teleportTarget.y + 9,
    )
  }
}
