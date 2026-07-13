import Phaser from 'phaser'
import type { MatchCommandInput } from '../../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../../simulation/match/MatchEvent'
import type { SimProjectile } from '../../simulation/match/MatchState'
import { launchVelocity } from '../../simulation/aim/aim'
import { integrateProjectile } from '../../simulation/projectile/integrate'
import {
  AIM_GUIDE_STEPS,
  DRAG_MAX_DISTANCE,
  DRAG_START_DISTANCE,
  canvasPointToWorld,
  dragAim,
  isJumpCode,
  movementDirection,
  type DragAim,
} from '../../simulation/input/controls'
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
import type { Vector } from '../../shared/types'
import { getMap } from '../../maps/registry'
import { WEAPON_ORDER, WEAPONS } from '../../weapons/registry'
import type { GameEvents } from '../types'
import type { MatchSource } from '../matchSource'
import type { AudioDirector, SoundCue } from '../../audio/AudioDirector'
import { EventSequenceGuard, type PresentationPreferences } from '../presentation'

type BurstEffect = {
  kind: 'explosion' | 'teleport'
  position: Vector
  weaponId?: SimProjectile['weaponId']
  radius: number
  age: number
  lifetime: number
  seed: number
}
type DamageEffect = {
  playerId: string
  amount: number
  selfDamage: boolean
  age: number
  label: Phaser.GameObjects.Text
}
type TraceEffect = { origin: Vector; endpoints: Vector[]; age: number }
type Reaction = { hurtUntil?: number; firedUntil?: number; defeatedAt?: number }

export class MatchScene extends Phaser.Scene {
  private source!: MatchSource
  private eventsFromHost: GameEvents | null = null
  private preferences: PresentationPreferences = {
    reducedMotion: false,
    highContrastHud: false,
    cameraShake: true,
    aimGuide: 'normal',
    screenFlash: 'normal',
  }
  private audio!: AudioDirector
  private backgroundGraphics!: Phaser.GameObjects.Graphics
  private terrainGraphics!: Phaser.GameObjects.Graphics
  private actorGraphics!: Phaser.GameObjects.Graphics
  private overlayGraphics!: Phaser.GameObjects.Graphics
  private hudGraphics!: Phaser.GameObjects.Graphics
  private leftHud!: Phaser.GameObjects.Text
  private rightHud!: Phaser.GameObjects.Text
  private bottomHud!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private windText!: Phaser.GameObjects.Text
  private bannerText!: Phaser.GameObjects.Text
  private canvas!: HTMLCanvasElement
  private pressedCodes = new Set<string>()
  private dragging = false
  private activePointerId: number | null = null
  private dragStart: Vector | null = null
  private dragPreview: DragAim | null = null
  private shotAim: DragAim = this.defaultAim()
  private teleportTarget: Vector | null = null
  private introDuration = 0
  private turnBannerDuration = 0
  private visualTime = 0
  private eventGuard = new EventSequenceGuard()
  private burstEffects: BurstEffect[] = []
  private damageEffects: DamageEffect[] = []
  private traceEffects: TraceEffect[] = []
  private reactions = new Map<string, Reaction>()
  private displayedHealth: [number, number] = [100, 100]
  private pendingResult: SimulationMatchResult | null = null
  private resultDelay = 0
  private bannerOverride = ''
  private lastMatchId = ''
  private lastTimerSecond = -1
  private warnedGrenades = new Set<string>()
  private lastExplosionAudioAt = -1
  private lastShakeAt = -1

  constructor() {
    super('match')
  }

  init(data: {
    source: MatchSource
    events?: GameEvents
    preferences: PresentationPreferences
    audio: AudioDirector
  }): void {
    this.source = data.source
    this.eventsFromHost = data.events ?? null
    this.preferences = data.preferences
    this.audio = data.audio
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
    this.leftHud = this.add.text(0, 0, '', hudStyle)
    this.rightHud = this.add.text(0, 0, '', hudStyle)
    this.bottomHud = this.add.text(0, 0, '', hudStyle)
    this.timerText = this.add
      .text(GAME_WIDTH / 2, 17, '', {
        ...hudStyle,
        fontSize: '17px',
        stroke: '#473b31',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
    this.windText = this.add
      .text(GAME_WIDTH / 2, 59, '', {
        ...hudStyle,
        fontSize: '12px',
        color: '#473b31',
        backgroundColor: '#fff3c7',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 0)
    this.bannerText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18, '', {
        ...hudStyle,
        fontSize: '25px',
        align: 'center',
        stroke: '#473b31',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
    this.installInput()
    this.resetPresentation()
    this.canvas.focus()
  }

  update(_: number, deltaMilliseconds: number): void {
    const delta = Math.min(deltaMilliseconds / 1000, 0.25)
    this.visualTime += delta
    if (this.source.state.matchId !== this.lastMatchId) this.resetPresentation()
    if (this.introDuration > 0) this.introDuration = Math.max(0, this.introDuration - delta)
    this.source.update(delta)
    this.turnBannerDuration = Math.max(0, this.turnBannerDuration - delta)
    this.burstEffects.forEach((effect) => (effect.age += delta))
    this.damageEffects.forEach((effect) => {
      effect.age += delta
      const player = this.source.state.players.find((candidate) => candidate.id === effect.playerId)
      if (player)
        effect.label
          .setPosition(player.position.x, player.position.y - 36 - effect.age * 20)
          .setAlpha(1 - effect.age)
    })
    this.traceEffects.forEach((effect) => (effect.age += delta))
    this.burstEffects = this.burstEffects.filter((effect) => effect.age < effect.lifetime)
    this.damageEffects = this.damageEffects.filter((effect) => {
      if (effect.age < 1) return true
      effect.label.destroy()
      return false
    })
    this.traceEffects = this.traceEffects.filter((effect) => effect.age < 0.22)
    for (const event of this.source.drainEvents()) this.consumeMatchEvent(event)
    this.updateHealthPresentation(delta)
    this.updateTimerAudio()
    this.updateGrenadeAudio()
    if (this.pendingResult) {
      this.resultDelay = Math.max(0, this.resultDelay - delta)
      if (this.resultDelay === 0) {
        const result = this.pendingResult
        this.pendingResult = null
        this.eventsFromHost?.onResult(result)
      }
    }
    this.render()
  }

  public setPaused(paused: boolean): void {
    this.source.setPaused(paused)
    this.pressedCodes.clear()
    this.clearDrag()
  }

  public restartMatch(): void {
    this.source.restart()
    this.resetPresentation()
  }

  public setPresentationPreferences(preferences: PresentationPreferences): void {
    this.preferences = preferences
  }

  private resetPresentation(): void {
    this.audio?.stopTransient()
    this.pressedCodes.clear()
    this.clearDrag()
    this.teleportTarget = null
    this.shotAim = this.defaultAim()
    this.introDuration = this.preferences.reducedMotion ? 0.35 : 0.9
    this.turnBannerDuration = 0
    this.bannerOverride = ''
    this.burstEffects = []
    for (const effect of this.damageEffects) effect.label.destroy()
    this.damageEffects = []
    this.traceEffects = []
    this.reactions.clear()
    this.pendingResult = null
    this.resultDelay = 0
    this.eventGuard.reset()
    this.lastMatchId = this.source.state.matchId
    this.displayedHealth = [
      this.source.state.players[0].health,
      this.source.state.players[1].health,
    ]
    this.lastTimerSecond = -1
    this.warnedGrenades.clear()
    this.canvas?.setAttribute('data-explosion-count', '0')
    this.canvas?.setAttribute('data-damage-count', '0')
    this.canvas?.setAttribute('data-effect-count', '0')
    this.render()
  }

  private send(command: MatchCommandInput): void {
    void this.source.sendCommand(command).then((result) => {
      if (!result.accepted && result.reason !== 'navigation-cancelled') {
        this.bannerOverride = 'Action not available'
        this.turnBannerDuration = 0.65
      }
    })
  }

  private canInput(): boolean {
    return (
      !this.source.state.paused &&
      this.source.state.phase === 'input' &&
      this.source.canControlActivePlayer()
    )
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
    this.audio.stopTransient()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    this.canvas.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('blur', this.onCanvasBlur)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.source.state.phase !== 'victory') {
      event.preventDefault()
      this.eventsFromHost?.onPauseRequest()
      return
    }
    if (this.introDuration > 0 && event.code === 'Enter') {
      event.preventDefault()
      this.introDuration = 0
      return
    }
    const acceptedCodes = [
      'KeyQ',
      'KeyA',
      'KeyD',
      'KeyZ',
      'KeyW',
      'Space',
      'KeyR',
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
    ]
    if (!acceptedCodes.includes(event.code)) return
    event.preventDefault()
    if (!this.canInput()) return
    this.pressedCodes.add(event.code)
    if (event.code === 'KeyR' && !event.repeat) this.eventsFromHost?.onPauseRequest()
    else if (event.code.startsWith('Digit') && !event.repeat) {
      const weaponId = WEAPON_ORDER[Number(event.code.slice(-1)) - 1]
      if (weaponId) this.send({ type: 'select-weapon', weaponId })
    } else if (event.code === 'Space' && !event.repeat) this.activateWeapon()
    else if (isJumpCode(event.code) && !event.repeat) this.send({ type: 'jump' })
    else if (['KeyQ', 'KeyA', 'KeyD'].includes(event.code))
      this.send({ type: 'move', direction: movementDirection(this.pressedCodes), pressed: true })
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedCodes.delete(event.code)
    if (this.canInput() && ['KeyQ', 'KeyA', 'KeyD'].includes(event.code)) {
      const direction = movementDirection(this.pressedCodes)
      this.send({
        type: 'move',
        direction: direction === 0 ? (event.code === 'KeyD' ? 1 : -1) : direction,
        pressed: direction !== 0,
      })
    }
  }

  private readonly onCanvasBlur = (): void => {
    this.pressedCodes.clear()
    if (this.canInput()) this.send({ type: 'move', direction: 0, pressed: true })
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.canInput()) return
    this.canvas.focus()
    this.canvas.setPointerCapture(event.pointerId)
    this.dragging = true
    this.activePointerId = event.pointerId
    this.dragStart = this.pointerWorldPoint(event)
    this.dragPreview = null
    event.preventDefault()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.canInput()) return
    const pointer = this.pointerWorldPoint(event)
    if (this.selectedWeapon().aimMode === 'target-position') {
      const surface = this.source.getTerrain().surfaceY(pointer.x)
      this.teleportTarget = surface === null ? pointer : { x: pointer.x, y: surface - 15 }
      event.preventDefault()
      return
    }
    if (!this.dragging || !this.dragStart) return
    if (
      Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y) >= DRAG_START_DISTANCE
    )
      this.dragPreview = dragAim(this.aimOrigin(), pointer, POWER_MIN_PERCENT, POWER_MAX_PERCENT)
    event.preventDefault()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return
    if (this.canInput() && this.dragPreview) this.shotAim = this.dragPreview
    this.clearDrag(event.pointerId)
    event.preventDefault()
  }

  private readonly onPointerCancel = (event: PointerEvent): void => this.clearDrag(event.pointerId)

  private activateWeapon(): void {
    if (this.selectedWeapon().id === 'teleporter') {
      if (this.teleportTarget) this.send({ type: 'teleport', destination: this.teleportTarget })
    } else
      this.send({ type: 'fire', aimDirection: this.shotAim.direction, power: this.shotAim.power })
  }

  private clearDrag(pointerId = this.activePointerId ?? undefined): void {
    if (pointerId !== undefined && this.canvas?.hasPointerCapture(pointerId))
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

  private selectedWeapon() {
    return WEAPONS[this.source.activePlayer.selectedWeapon]
  }
  private aimOrigin(): Vector {
    const player = this.source.activePlayer
    return { x: player.position.x, y: player.position.y - 6 }
  }
  private projectileOrigin(direction: Vector): Vector {
    const player = this.source.activePlayer
    return {
      x: player.position.x + direction.x * (player.radius + 10),
      y: player.position.y + direction.y * (player.radius + 10),
    }
  }

  private defaultAim(): DragAim {
    const facing = this.source?.state.activePlayerIndex === 1 ? -1 : 1
    const radians = (DEFAULT_AIM_ELEVATION * Math.PI) / 180
    return {
      direction: { x: Math.cos(radians) * facing, y: -Math.sin(radians) },
      power: DEFAULT_POWER_PERCENT,
      distance: 112,
      worldAngle: facing === 1 ? DEFAULT_AIM_ELEVATION : 180 - DEFAULT_AIM_ELEVATION,
    }
  }

  private render(): void {
    if (!this.source) return
    this.renderBackdrop()
    this.renderTerrain()
    this.renderActors()
    this.renderOverlay()
    this.renderEffects()
    this.renderHud()
  }

  private renderBackdrop(): void {
    this.backgroundGraphics.clear().fillStyle(0x9edce5).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
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
    const terrain = this.source.getTerrain()
    this.terrainGraphics.clear().fillStyle(0x9a673e)
    for (let x = 0; x < terrain.width; x += 1) {
      let start = -1
      for (let y = 0; y <= terrain.height; y += 1) {
        const solid = y < terrain.height && terrain.cells[y * terrain.width + x] === 1
        if (solid && start === -1) start = y
        if (!solid && start !== -1) {
          this.terrainGraphics.fillRect(
            x * terrain.scale,
            start * terrain.scale,
            terrain.scale,
            (y - start) * terrain.scale,
          )
          start = -1
        }
      }
    }
    this.terrainGraphics.lineStyle(3, 0x437c53, 0.95)
    for (let x = 0; x < GAME_WIDTH; x += 3) {
      const y = terrain.surfaceY(x)
      const next = terrain.surfaceY(x + 3)
      if (y !== null && next !== null) this.terrainGraphics.lineBetween(x, y - 1, x + 3, next - 1)
    }
  }

  private renderActors(): void {
    this.actorGraphics.clear()
    this.source.state.players.forEach((player, index) => {
      const reaction = this.reactions.get(player.id)
      if (!player.alive && reaction?.defeatedAt === undefined) return
      const moving = player.moveDirection !== 0 && player.grounded
      const aimingFacing =
        index === this.source.state.activePlayerIndex
          ? Math.sign((this.dragPreview ?? this.shotAim).direction.x)
          : 0
      const facing = player.moveDirection || aimingFacing || (index === 0 ? 1 : -1)
      const bob =
        !this.preferences.reducedMotion && player.grounded
          ? Math.sin(this.visualTime * (moving ? 11 : 3) + index) * (moving ? 2.5 : 1.25)
          : 0
      const { x } = player.position
      const hurt = (reaction?.hurtUntil ?? 0) > this.visualTime
      const fired = (reaction?.firedUntil ?? 0) > this.visualTime
      const defeated = !player.alive
      const victory =
        this.source.state.phase === 'victory' && this.source.state.winnerPlayerId === player.id
      const victoryBob =
        victory && !this.preferences.reducedMotion
          ? -Math.abs(Math.sin(this.visualTime * 7)) * 7
          : 0
      const y = player.position.y + bob + victoryBob + (fired ? 2 : 0)
      const shadowY = this.source.getTerrain().surfaceY(x) ?? y + player.radius
      this.actorGraphics.fillStyle(0x473b31, 0.7).fillEllipse(x + 3, shadowY + 8, 32, 9)
      this.actorGraphics
        .fillStyle(hurt ? 0xffffff : index === 0 ? 0x2863b7 : 0xed7090)
        .fillRoundedRect(x - 17, y - (defeated ? 4 : 13), 34, defeated ? 16 : 31, 12)
      this.actorGraphics.fillStyle(0xfff6d8).fillEllipse(x + facing * 3, y - 3, 22, 15)
      this.actorGraphics
        .fillStyle(0x24313a)
        .fillCircle(x + facing * 7, y - 4, 2.8)
        .fillCircle(x + facing, y - 4, 2.8)
      this.actorGraphics
        .lineStyle(2, 0x24313a)
        .lineBetween(x + facing * 2, y + 5, x + facing * (hurt ? 5 : 8), y + (hurt ? 8 : 5))
      this.actorGraphics
        .fillStyle(index === 0 ? 0xf7bd3f : 0xed7090)
        .fillTriangle(x - 13 * facing, y - 13, x - 4 * facing, y - 25, x - 3 * facing, y - 11)
      if (
        !defeated &&
        this.source.state.phase === 'input' &&
        index === this.source.state.activePlayerIndex
      )
        this.actorGraphics.lineStyle(3, 0xf7bd3f).strokeCircle(x, y, player.radius + 7)
    })
  }

  private renderOverlay(): void {
    this.overlayGraphics.clear()
    if (this.canInput()) {
      const aim = this.dragPreview ?? this.shotAim
      if (this.selectedWeapon().aimMode === 'target-position') this.renderTeleportMarker()
      else {
        this.renderAimArrow(
          this.aimOrigin(),
          aim.direction,
          aim.distance,
          !this.dragging || Boolean(this.dragPreview),
        )
        if (this.selectedWeapon().id === 'scatter-shot')
          this.renderScatterGuide(this.aimOrigin(), aim.direction)
        else this.renderAimGuide(this.projectileOrigin(aim.direction), aim.direction, aim.power)
      }
    }
    for (const projectile of this.source.state.projectiles) this.renderProjectile(projectile)
  }

  private renderProjectile(projectile: SimProjectile): void {
    const color =
      projectile.weaponId === 'timed-grenade'
        ? 0x57b89e
        : projectile.kind === 'cluster-child'
          ? 0xed7090
          : 0xffd75b
    this.overlayGraphics
      .fillStyle(0x473b31)
      .fillCircle(projectile.position.x + 2, projectile.position.y + 2, projectile.radius + 2)
    this.overlayGraphics
      .fillStyle(color)
      .fillCircle(projectile.position.x, projectile.position.y, projectile.radius)
    if (projectile.weaponId === 'timed-grenade') {
      const pulse = 2 + Math.sin(this.visualTime * 12) * 1.5
      this.overlayGraphics
        .fillStyle(0xfff6d8)
        .fillCircle(projectile.position.x + 2, projectile.position.y - projectile.radius - 2, pulse)
    } else if (projectile.weaponId === 'basic-rocket') {
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1
      this.overlayGraphics
        .lineStyle(3, 0xff9a55, 0.8)
        .lineBetween(
          projectile.position.x,
          projectile.position.y,
          projectile.position.x - (projectile.velocity.x / speed) * 14,
          projectile.position.y - (projectile.velocity.y / speed) * 14,
        )
    }
  }

  private renderAimArrow(
    origin: Vector,
    direction: Vector,
    distance: number,
    valid: boolean,
  ): void {
    const color = valid ? 0xffd75b : 0xe65d3d
    const endpoint = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance }
    const maximum = {
      x: origin.x + direction.x * DRAG_MAX_DISTANCE,
      y: origin.y + direction.y * DRAG_MAX_DISTANCE,
    }
    this.overlayGraphics
      .lineStyle(2, color, 0.25)
      .lineBetween(origin.x, origin.y, maximum.x, maximum.y)
    this.overlayGraphics
      .lineStyle(4, color, 0.95)
      .lineBetween(origin.x, origin.y, endpoint.x, endpoint.y)
    this.overlayGraphics
      .fillStyle(color)
      .fillTriangle(
        endpoint.x + direction.y * 7,
        endpoint.y - direction.x * 7,
        endpoint.x - direction.y * 7,
        endpoint.y + direction.x * 7,
        endpoint.x + direction.x * 13,
        endpoint.y + direction.y * 13,
      )
  }

  private renderAimGuide(origin: Vector, direction: Vector, power: number): void {
    let projectile = {
      position: origin,
      velocity: launchVelocity(direction, this.selectedWeapon().projectileSpeed, power),
      radius: 5,
    }
    this.overlayGraphics.fillStyle(0xfff6d8, 0.85)
    const steps = this.preferences.aimGuide === 'minimal' ? 3 : AIM_GUIDE_STEPS
    for (let step = 0; step < steps; step += 1) {
      projectile = integrateProjectile(
        projectile,
        GRAVITY * this.selectedWeapon().gravityScale,
        FIXED_STEP_SECONDS,
        this.source.state.wind * this.selectedWeapon().windSensitivity,
      )
      this.overlayGraphics.fillCircle(projectile.position.x, projectile.position.y, 2)
    }
  }

  private renderScatterGuide(origin: Vector, direction: Vector): void {
    const weapon = this.selectedWeapon()
    const spread = ((weapon.pelletCount - 1) / 2) * weapon.pelletSpreadRadians
    const angle = Math.atan2(direction.y, direction.x)
    this.overlayGraphics.lineStyle(2, 0xfff6d8, 0.55)
    for (const offset of [-spread, 0, spread])
      this.overlayGraphics.lineBetween(
        origin.x,
        origin.y,
        origin.x + Math.cos(angle + offset) * Math.min(90, weapon.pelletRange),
        origin.y + Math.sin(angle + offset) * Math.min(90, weapon.pelletRange),
      )
  }

  private renderTeleportMarker(): void {
    if (!this.teleportTarget) return
    const valid = this.source.isValidTeleport(this.teleportTarget)
    this.overlayGraphics
      .lineStyle(3, valid ? 0x57b89e : 0xe65d3d)
      .strokeCircle(this.teleportTarget.x, this.teleportTarget.y, 15)
  }

  private renderHud(): void {
    const state = this.source.state
    const left = state.players[0]
    const right = state.players[1]
    this.hudGraphics.clear().fillStyle(0x473b31, 0.88)
    this.hudGraphics
      .fillRoundedRect(12, 10, 225, 46, 10)
      .fillRoundedRect(GAME_WIDTH - 237, 10, 225, 46, 10)
      .fillRoundedRect(GAME_WIDTH / 2 - 64, 9, 128, 47, 18)
      .fillRoundedRect(15, GAME_HEIGHT - 72, GAME_WIDTH - 30, 57, 14)
    this.hudGraphics
      .fillStyle(this.preferences.highContrastHud ? 0x72e58d : 0x5bbf72)
      .fillRoundedRect(32, 40, 150 * (this.displayedHealth[0] / 100), 6, 3)
      .fillRoundedRect(GAME_WIDTH - 182, 40, 150 * (this.displayedHealth[1] / 100), 6, 3)
    this.hudGraphics
      .fillStyle(this.source.timerRemainingSeconds <= 5 ? 0xe65d3d : 0xf7bd3f)
      .fillCircle(GAME_WIDTH / 2, 31, 18)
    this.leftHud
      .setPosition(27, 17)
      .setOrigin(0)
      .setText(
        `${state.activePlayerIndex === 0 ? '◆ ' : ''}${left.name}\n${Math.ceil(left.health)} health`,
      )
    this.rightHud
      .setPosition(GAME_WIDTH - 27, 17)
      .setOrigin(1, 0)
      .setText(
        `${state.activePlayerIndex === 1 ? '◆ ' : ''}${right.name}\n${Math.ceil(right.health)} health`,
      )
    this.canvas.setAttribute('data-wind', String(state.wind))
    this.canvas.setAttribute(
      'data-effect-count',
      String(this.burstEffects.length + this.damageEffects.length + this.traceEffects.length),
    )
    const weapons = WEAPON_ORDER.map((id, index) => {
      const ammo = this.source.activePlayer.inventory[id]
      return `${this.source.activePlayer.selectedWeapon === id ? '◆' : '◇'} ${index + 1} ${ammo === 'unlimited' ? '∞' : ammo}`
    }).join('    ')
    const hint =
      this.selectedWeapon().aimMode === 'target-position'
        ? 'Point at safe ground · Space to warp'
        : this.selectedWeapon().powerMode === 'fixed'
          ? 'Short-range spread · Space to fire'
          : `Power ${Math.round((this.dragPreview ?? this.shotAim).power)}% · drag backward · Space to fire`
    this.bottomHud
      .setPosition(31, GAME_HEIGHT - 64)
      .setOrigin(0)
      .setText(`${weapons}\n${this.selectedWeapon().displayName} · ${hint}`)
    if (this.introDuration > 0) {
      const countdown = this.introDuration > 0.6 ? Math.ceil(this.introDuration / 0.6) : 'Begin'
      this.bannerText
        .setText(
          `${getMap(state.config.mapId).displayName}\n${left.name} vs ${right.name}\n${countdown}`,
        )
        .setVisible(true)
    } else if (this.turnBannerDuration > 0)
      this.bannerText
        .setText(
          this.bannerOverride ||
            `${this.source.activePlayer.name}'s Turn\n${this.windLabel(state.wind)}`,
        )
        .setVisible(true)
    else this.bannerText.setVisible(false)
    const remaining = Math.ceil(this.source.timerRemainingSeconds)
    this.timerText.setText(
      remaining <= 5 && state.phase === 'input' ? `! ${remaining}s !` : `${remaining}s`,
    )
    this.windText.setText(`${this.windLabel(state.wind)} · Turn ${state.turnNumber}`)
  }

  private consumeMatchEvent(event: MatchEvent): void {
    if (!this.eventGuard.consume(event)) return
    const reaction = (playerId: string) => this.reactions.get(playerId) ?? {}
    switch (event.type) {
      case 'turn-started':
        this.turnBannerDuration = this.preferences.reducedMotion ? 0.45 : 0.9
        this.bannerOverride = ''
        this.shotAim = this.defaultAim()
        this.teleportTarget = null
        return
      case 'turn-expired':
        this.bannerOverride = 'Time expired'
        this.turnBannerDuration = 0.7
        return
      case 'weapon-selected':
        this.audio.play('weapon-select')
        return
      case 'weapon-fired': {
        const state = reaction(event.playerId)
        state.firedUntil = this.visualTime + 0.2
        this.reactions.set(event.playerId, state)
        const cue: Record<string, SoundCue> = {
          'basic-rocket': 'rocket-fire',
          'timed-grenade': 'grenade-fire',
          'scatter-shot': 'scatter-fire',
          'cluster-charge': 'cluster-fire',
          teleporter: 'teleport',
        }
        this.audio.play(cue[event.weaponId])
        return
      }
      case 'projectile-spawned':
        return
      case 'projectile-bounced':
        this.audio.play('grenade-bounce')
        return
      case 'cluster-split':
        this.addBurst('explosion', event.position, 25, event.sequence, 'cluster-charge')
        this.audio.play('cluster-split')
        return
      case 'scatter-fired':
        this.traceEffects.push({ origin: event.origin, endpoints: event.endpoints, age: 0 })
        return
      case 'explosion-resolved':
        this.addBurst(
          'explosion',
          event.position,
          event.blastRadius,
          event.sequence,
          event.weaponId,
        )
        if (this.visualTime - this.lastExplosionAudioAt > 0.06) {
          this.audio.play('explosion')
          this.lastExplosionAudioAt = this.visualTime
        }
        this.applyImpactFeedback(event.weaponId)
        this.incrementCanvasCounter('data-explosion-count')
        return
      case 'teleported':
        this.addBurst('teleport', event.from, 28, event.sequence)
        this.addBurst('teleport', event.to, 34, event.sequence + 1)
        return
      case 'player-jumped':
        this.audio.play('jump')
        return
      case 'terrain-destroyed':
        return
      case 'player-damaged': {
        const existing = this.damageEffects.find(
          (effect) => effect.playerId === event.playerId && effect.age < 0.08,
        )
        if (existing) {
          existing.amount += event.amount
          existing.selfDamage ||= event.selfDamage
          existing.label.setText(`-${Math.max(1, Math.round(existing.amount))}`)
          return
        }
        const label = this.add
          .text(0, 0, `-${Math.max(1, Math.round(event.amount))}`, {
            fontFamily: 'Trebuchet MS, Arial, sans-serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: event.selfDamage ? '#ffb061' : '#ffffff',
            stroke: '#473b31',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(20)
        this.damageEffects.push({
          playerId: event.playerId,
          amount: event.amount,
          selfDamage: event.selfDamage,
          age: 0,
          label,
        })
        const state = reaction(event.playerId)
        state.hurtUntil = this.visualTime + (this.preferences.reducedMotion ? 0.12 : 0.35)
        this.reactions.set(event.playerId, state)
        this.audio.play('damage')
        this.incrementCanvasCounter('data-damage-count')
        return
      }
      case 'player-died': {
        const state = reaction(event.playerId)
        state.defeatedAt = this.visualTime
        this.reactions.set(event.playerId, state)
        this.audio.play('defeat')
        return
      }
      case 'match-ended':
        this.pendingResult = event.result
        this.resultDelay = this.preferences.reducedMotion ? 0.25 : 0.75
        this.audio.play('victory')
        return
    }
  }

  private addBurst(
    kind: BurstEffect['kind'],
    position: Vector,
    radius: number,
    seed: number,
    weaponId?: SimProjectile['weaponId'],
  ): void {
    this.burstEffects.push({
      kind,
      position: { ...position },
      weaponId,
      radius,
      seed,
      age: 0,
      lifetime: this.preferences.reducedMotion ? 0.22 : 0.7,
    })
    if (this.burstEffects.length > 24) this.burstEffects.splice(0, this.burstEffects.length - 24)
  }

  private applyImpactFeedback(weaponId: SimProjectile['weaponId']): void {
    if (
      this.preferences.cameraShake &&
      !this.preferences.reducedMotion &&
      (weaponId !== 'cluster-charge' || this.visualTime - this.lastShakeAt > 0.14)
    )
      this.cameras.main.shake(
        110,
        weaponId === 'timed-grenade' ? 0.006 : weaponId === 'cluster-charge' ? 0.002 : 0.0045,
      )
    this.lastShakeAt = this.visualTime
    if (this.preferences.screenFlash !== 'off')
      this.cameras.main.flash(
        this.preferences.screenFlash === 'reduced' || this.preferences.reducedMotion ? 45 : 85,
        255,
        244,
        188,
      )
  }

  private renderEffects(): void {
    for (const effect of this.burstEffects) {
      const progress = effect.age / effect.lifetime
      const color = effect.kind === 'teleport' ? 0x74f1d0 : 0xffc04d
      const size = effect.radius * (0.25 + progress * 0.9)
      this.overlayGraphics
        .lineStyle(4 - progress * 2, color, 1 - progress)
        .strokeCircle(effect.position.x, effect.position.y, size)
      if (progress < 0.3)
        this.overlayGraphics
          .fillStyle(0xfff7cf, 1 - progress / 0.3)
          .fillCircle(effect.position.x, effect.position.y, effect.radius * (0.45 - progress * 0.6))
      if (!this.preferences.reducedMotion && effect.kind === 'explosion') {
        const fragments = effect.weaponId === 'cluster-charge' ? 3 : 6
        for (let index = 0; index < fragments; index += 1) {
          const angle = effect.seed * 0.73 + index * 2.4
          const distance = progress * effect.radius * 0.85
          this.overlayGraphics
            .fillStyle(index % 2 ? 0x8f6848 : 0xd7ad66, 1 - progress)
            .fillCircle(
              effect.position.x + Math.cos(angle) * distance,
              effect.position.y + Math.sin(angle) * distance - progress * 12,
              2.5,
            )
        }
        const smokeCount =
          effect.weaponId === 'timed-grenade' ? 4 : effect.weaponId === 'cluster-charge' ? 1 : 3
        const dustColor =
          this.source.state.mapId === 'crater-basin'
            ? 0xb77c5b
            : this.source.state.mapId === 'twin-peaks'
              ? 0xc4a273
              : 0xa88d69
        for (let puff = 0; puff < smokeCount; puff += 1) {
          const angle = effect.seed * 0.31 + puff * 2.2
          this.overlayGraphics
            .fillStyle(dustColor, Math.max(0, 0.5 - progress * 0.5))
            .fillCircle(
              effect.position.x + Math.cos(angle) * effect.radius * progress * 0.45,
              effect.position.y - progress * (18 + puff * 4),
              5 + progress * (effect.weaponId === 'timed-grenade' ? 13 : 9),
            )
        }
      }
    }
    for (const trace of this.traceEffects) {
      const alpha = 1 - trace.age / 0.22
      this.overlayGraphics.lineStyle(2, 0xfff2a6, alpha)
      for (const endpoint of trace.endpoints)
        this.overlayGraphics.lineBetween(trace.origin.x, trace.origin.y, endpoint.x, endpoint.y)
      for (const endpoint of trace.endpoints)
        this.overlayGraphics.fillStyle(0xffd36b, alpha).fillCircle(endpoint.x, endpoint.y, 2.5)
    }
    for (const damage of this.damageEffects) {
      const player = this.source.state.players.find((candidate) => candidate.id === damage.playerId)
      if (!player) continue
      const progress = damage.age
      this.overlayGraphics
        .fillStyle(damage.selfDamage ? 0xffb061 : 0xffffff, 1 - progress)
        .fillRoundedRect(player.position.x - 18, player.position.y - 35 - progress * 20, 36, 18, 6)
      this.overlayGraphics.fillStyle(0x8f2f2f, 1 - progress)
      const bars = Math.min(8, Math.max(1, Math.round(damage.amount / 8)))
      for (let bar = 0; bar < bars; bar += 1)
        this.overlayGraphics.fillRect(
          player.position.x - 12 + bar * 3,
          player.position.y - 29 - progress * 20,
          2,
          6,
        )
    }
  }

  private updateHealthPresentation(delta: number): void {
    this.source.state.players.forEach((player, index) => {
      if (this.preferences.reducedMotion) this.displayedHealth[index as 0 | 1] = player.health
      else {
        const current = this.displayedHealth[index as 0 | 1]
        this.displayedHealth[index as 0 | 1] =
          Math.abs(current - player.health) < 0.1
            ? player.health
            : current + (player.health - current) * Math.min(1, delta * 9)
      }
    })
  }

  private updateTimerAudio(): void {
    if (this.source.state.phase !== 'input') return
    const second = Math.ceil(this.source.timerRemainingSeconds)
    if (second > 0 && second <= 5 && second !== this.lastTimerSecond)
      this.audio.play('timer-warning')
    this.lastTimerSecond = second
  }

  private updateGrenadeAudio(): void {
    for (const projectile of this.source.state.projectiles) {
      if (
        projectile.weaponId === 'timed-grenade' &&
        projectile.fuseTicks <= 60 &&
        !this.warnedGrenades.has(projectile.id)
      ) {
        this.warnedGrenades.add(projectile.id)
        this.audio.play('grenade-fuse')
      }
    }
  }

  private windLabel(wind: number): string {
    if (wind === 0) return 'Wind calm'
    return wind < 0 ? `← Wind ${Math.abs(wind)}` : `Wind ${wind} →`
  }

  private incrementCanvasCounter(attribute: string): void {
    const value = Number(this.canvas.getAttribute(attribute) ?? 0)
    this.canvas.setAttribute(attribute, String(value + 1))
  }
}
