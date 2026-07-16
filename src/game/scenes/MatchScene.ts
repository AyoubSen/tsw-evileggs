import Phaser from 'phaser'
import type { MatchCommandInput } from '../../simulation/match/MatchCommand'
import type { MatchEvent, SimulationMatchResult } from '../../simulation/match/MatchEvent'
import {
  SIMULATION_HZ,
  type SimPlayer,
  type SimProjectile,
} from '../../simulation/match/MatchState'
import { launchVelocity } from '../../simulation/aim/aim'
import { integrateProjectile } from '../../simulation/projectile/integrate'
import {
  AIM_GUIDE_STEPS,
  DRAG_MAX_DISTANCE,
  DRAG_MIN_DISTANCE,
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
  GRAVITY,
  POWER_MAX_PERCENT,
  POWER_MIN_PERCENT,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../../shared/constants'
import type { Vector } from '../../shared/types'
import { getMap } from '../../maps/registry'
import type { TerrainMask } from '../../terrain/TerrainMask'
import { TERRAIN_MATERIAL, type TerrainMaterialId } from '../../terrain/materials'
import { WEAPON_ORDER, WEAPONS } from '../../weapons/registry'
import type { WeaponId } from '../../weapons/registry'
import type { GameEvents } from '../types'
import type { MatchSource } from '../matchSource'
import type { AudioDirector, SoundCue } from '../../audio/AudioDirector'
import { EventSequenceGuard, type PresentationPreferences } from '../presentation'
import {
  getWeaponMotionPolicy,
  getWeaponPresentation,
  heldWeaponHandedness,
  normalizeDirection,
  perpendicular,
  transformLocalPoint,
  weaponModelScale,
  type WeaponMotionPolicy,
} from '../weaponPresentation'

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
type TraceEffect = {
  weaponId: WeaponId
  origin: Vector
  endpoints: Vector[]
  age: number
  lifetime: number
}
type Reaction = {
  hurtUntil?: number
  firedAt?: number
  firedUntil?: number
  fireDirection?: Vector
  fireWeapon?: WeaponId
  equippedAt?: number
  equippedWeapon?: WeaponId
  defeatedAt?: number
}
type ProjectileTrail = {
  weaponId: WeaponId
  kind: SimProjectile['kind']
  points: Vector[]
}
type WeaponEffect = {
  kind: 'muzzle' | 'bounce' | 'split'
  weaponId: WeaponId
  position: Vector
  direction: Vector
  age: number
  lifetime: number
  seed: number
}
const ACTOR_VISUAL_SCALE = 0.9
const ACTOR_COLORS = [0x2863b7, 0xed7090, 0x57b89e, 0xf39a55, 0x8267c7, 0xe2ad2f]
const TEAM_COLORS = [0x17447f, 0xaa392b]
const INK_COLOR = 0x24313a
const MAX_PROJECTILE_TRAILS = 32
const MAX_WEAPON_EFFECTS = 40

export class MatchScene extends Phaser.Scene {
  private source!: MatchSource
  private eventsFromHost: GameEvents | null = null
  private preferences: PresentationPreferences = {
    reducedMotion: false,
    highContrastHud: false,
    cameraShake: true,
    cameraMode: 'fit',
    aimGuide: 'normal',
    screenFlash: 'normal',
  }
  private audio!: AudioDirector
  private backgroundGraphics!: Phaser.GameObjects.Graphics
  private terrainGraphics!: Phaser.GameObjects.Graphics
  private actorGraphics!: Phaser.GameObjects.Graphics
  private overlayGraphics!: Phaser.GameObjects.Graphics
  private hudGraphics!: Phaser.GameObjects.Graphics
  private uiCamera!: Phaser.Cameras.Scene2D.Camera
  private playerHudTexts: Phaser.GameObjects.Text[] = []
  private weaponHudTexts: Phaser.GameObjects.Text[] = []
  private bottomHud!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private windText!: Phaser.GameObjects.Text
  private bannerText!: Phaser.GameObjects.Text
  private cameraModeText!: Phaser.GameObjects.Text
  private canvas!: HTMLCanvasElement
  private pressedCodes = new Set<string>()
  private dragging = false
  private activePointerId: number | null = null
  private dragStart: Vector | null = null
  private dragPreview: DragAim | null = null
  private shotAim: DragAim = this.defaultAim()
  private rememberedAims = new Map<string, DragAim>()
  private teleportTarget: Vector | null = null
  private pendingWeaponId: WeaponId | null = null
  private introDuration = 0
  private turnBannerDuration = 0
  private visualTime = 0
  private eventGuard = new EventSequenceGuard()
  private burstEffects: BurstEffect[] = []
  private damageEffects: DamageEffect[] = []
  private traceEffects: TraceEffect[] = []
  private projectileTrails = new Map<string, ProjectileTrail>()
  private weaponEffects: WeaponEffect[] = []
  private reactions = new Map<string, Reaction>()
  private displayedHealth: number[] = []
  private pendingResult: SimulationMatchResult | null = null
  private resultDelay = 0
  private bannerOverride = ''
  private lastMatchId = ''
  private lastPresentationRevision = -1
  private lastPresentedActivePlayerId = ''
  private presentationWasPaused = false
  private lastTimerSecond = -1
  private warnedGrenades = new Set<string>()
  private lastExplosionAudioAt = -1
  private lastShakeAt = -1
  private renderedTerrainMatchId = ''
  private renderedTerrainOperationCount = -1
  private renderedTerrain: TerrainMask | null = null
  private actionFocus: Vector | null = null
  private actionFocusUntil = 0

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
    this.playerHudTexts = Array.from({ length: 6 }, () => this.add.text(0, 0, '', hudStyle))
    this.weaponHudTexts = Array.from({ length: WEAPON_ORDER.length }, () =>
      this.add.text(0, 0, '', {
        ...hudStyle,
        fontSize: '10px',
        align: 'center',
      }),
    )
    this.bottomHud = this.add.text(0, 0, '', hudStyle)
    this.timerText = this.add
      .text(VIEWPORT_WIDTH / 2, 17, '', {
        ...hudStyle,
        fontSize: '17px',
        stroke: '#473b31',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
    this.windText = this.add
      .text(VIEWPORT_WIDTH / 2, 59, '', {
        ...hudStyle,
        fontSize: '12px',
        color: '#473b31',
        backgroundColor: '#fff3c7',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5, 0)
    this.bannerText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2 - 18, '', {
        ...hudStyle,
        fontSize: '25px',
        align: 'center',
        stroke: '#473b31',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
    this.cameraModeText = this.add
      .text(VIEWPORT_WIDTH / 2, 88, '', {
        ...hudStyle,
        fontSize: '11px',
        color: '#fff8df',
        backgroundColor: '#473b31cc',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0.5, 0)
    this.uiCamera = this.cameras.add(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
    const worldObjects = [
      this.backgroundGraphics,
      this.terrainGraphics,
      this.actorGraphics,
      this.overlayGraphics,
    ]
    const hudObjects = [
      this.hudGraphics,
      ...this.playerHudTexts,
      ...this.weaponHudTexts,
      this.bottomHud,
      this.timerText,
      this.windText,
      this.bannerText,
      this.cameraModeText,
    ]
    this.uiCamera.ignore(worldObjects)
    this.cameras.main.ignore(hudObjects)
    this.installInput()
    this.resetPresentation()
    this.canvas.focus()
  }

  update(_: number, deltaMilliseconds: number): void {
    const delta = Math.min(deltaMilliseconds / 1000, 0.25)
    if (this.source.state.matchId !== this.lastMatchId) this.resetPresentation()
    this.source.update(delta)
    if (this.pendingWeaponId === this.source.activePlayer.selectedWeapon)
      this.pendingWeaponId = null
    if (this.source.presentationRevision !== this.lastPresentationRevision)
      this.resetTransientPresentation(
        this.source.activePlayer.id === this.lastPresentedActivePlayerId,
      )
    const presentationDelta = this.source.state.paused && this.source.state.phase !== 'victory' ? 0 : delta
    const presentationPaused = this.source.state.paused && this.source.state.phase !== 'victory'
    if (presentationPaused && !this.presentationWasPaused) this.cameras.main.shakeEffect.reset()
    this.presentationWasPaused = presentationPaused
    this.lastPresentedActivePlayerId = this.source.activePlayer.id
    this.visualTime += presentationDelta
    if (this.introDuration > 0)
      this.introDuration = Math.max(0, this.introDuration - presentationDelta)
    this.reconcileProjectileTrails()
    this.updateWorldCamera(presentationDelta)
    this.turnBannerDuration = Math.max(0, this.turnBannerDuration - presentationDelta)
    this.burstEffects.forEach((effect) => (effect.age += presentationDelta))
    this.damageEffects.forEach((effect) => {
      effect.age += presentationDelta
      const player = this.source.state.players.find((candidate) => candidate.id === effect.playerId)
      if (player)
        effect.label
          .setPosition(
            player.position.x,
            player.position.y - 36 - (this.preferences.reducedMotion ? 0 : effect.age * 20),
          )
          .setAlpha(1 - effect.age)
    })
    this.traceEffects.forEach((effect) => (effect.age += presentationDelta))
    this.weaponEffects.forEach((effect) => (effect.age += presentationDelta))
    this.burstEffects = this.burstEffects.filter((effect) => effect.age < effect.lifetime)
    this.damageEffects = this.damageEffects.filter((effect) => {
      if (effect.age < 1) return true
      effect.label.destroy()
      return false
    })
    this.traceEffects = this.traceEffects.filter((effect) => effect.age < effect.lifetime)
    this.weaponEffects = this.weaponEffects.filter((effect) => effect.age < effect.lifetime)
    for (const event of this.source.drainEvents()) this.consumeMatchEvent(event)
    this.updateHealthPresentation(presentationDelta)
    this.updateTimerAudio()
    this.updateGrenadeAudio()
    if (this.pendingResult) {
      this.resultDelay = Math.max(0, this.resultDelay - presentationDelta)
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
    if (paused) this.cameras.main.shakeEffect.reset()
    this.pressedCodes.clear()
    this.clearDrag()
  }

  public restartMatch(): void {
    this.source.restart()
    this.resetPresentation()
  }

  public setPresentationPreferences(preferences: PresentationPreferences): void {
    const enablingReducedMotion = preferences.reducedMotion && !this.preferences.reducedMotion
    this.preferences = preferences
    if (enablingReducedMotion) {
      this.cameras?.main?.shakeEffect.reset()
      this.weaponEffects = []
      this.burstEffects = []
      this.traceEffects = []
      for (const trail of this.projectileTrails.values())
        trail.points = trail.points.slice(-1)
      this.actionFocusUntil = this.visualTime
    }
  }

  private resetPresentation(): void {
    this.audio?.stopTransient()
    this.pressedCodes.clear()
    this.clearDrag()
    this.teleportTarget = null
    this.pendingWeaponId = null
    this.rememberedAims.clear()
    this.shotAim = this.defaultAim()
    this.introDuration = this.preferences.reducedMotion ? 0.35 : 0.9
    this.turnBannerDuration = 0
    this.bannerOverride = ''
    this.burstEffects = []
    for (const effect of this.damageEffects) effect.label.destroy()
    this.damageEffects = []
    this.traceEffects = []
    this.projectileTrails.clear()
    this.weaponEffects = []
    this.reactions.clear()
    this.pendingResult = null
    this.resultDelay = 0
    this.eventGuard.reset()
    this.lastMatchId = this.source.state.matchId
    this.lastPresentationRevision = this.source.presentationRevision
    this.lastPresentedActivePlayerId = this.source.activePlayer.id
    this.presentationWasPaused = false
    this.displayedHealth = this.source.state.players.map((player) => player.health)
    this.lastTimerSecond = -1
    this.warnedGrenades.clear()
    this.renderedTerrainMatchId = ''
    this.renderedTerrainOperationCount = -1
    this.renderedTerrain = null
    this.actionFocus = null
    this.actionFocusUntil = 0
    this.configureWorldCamera()
    this.canvas?.setAttribute('data-explosion-count', '0')
    this.canvas?.setAttribute('data-damage-count', '0')
    this.canvas?.setAttribute('data-effect-count', '0')
    this.render()
  }

  private resetTransientPresentation(preserveCommittedAim: boolean): void {
    this.clearDrag()
    if (!preserveCommittedAim) {
      this.teleportTarget = null
      this.shotAim = this.rememberedAim(this.source.activePlayer.id)
    }
    this.projectileTrails.clear()
    this.weaponEffects = []
    this.burstEffects = []
    this.traceEffects = []
    for (const effect of this.damageEffects) effect.label.destroy()
    this.damageEffects = []
    this.reactions.clear()
    this.displayedHealth = this.source.state.players.map((player) => player.health)
    this.actionFocus = null
    this.actionFocusUntil = 0
    this.lastPresentationRevision = this.source.presentationRevision
  }

  private send(command: MatchCommandInput, onRejected?: () => void): void {
    void this.source.sendCommand(command).then((result) => {
      if (!result.accepted && result.reason !== 'navigation-cancelled') {
        onRejected?.()
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

  private canTriggerActiveWeapon(): boolean {
    if (
      this.source.state.paused ||
      this.source.state.phase !== 'projectile' ||
      !this.source.canControlActivePlayer()
    )
      return false
    return this.source.state.projectiles.some(
      (projectile) =>
        projectile.ownerId === this.source.activePlayer.id &&
        projectile.kind === 'primary' &&
        WEAPONS[projectile.weaponId].mechanic === 'remote-split',
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
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture)
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
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture)
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
    if (event.code === 'KeyC' && !event.repeat) {
      event.preventDefault()
      const cameraMode = this.preferences.cameraMode === 'fit' ? 'follow' : 'fit'
      this.preferences = { ...this.preferences, cameraMode }
      this.eventsFromHost?.onCameraModeChange?.(cameraMode)
      this.clearDrag()
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
      'BracketLeft',
      'BracketRight',
    ]
    if (!acceptedCodes.includes(event.code)) return
    event.preventDefault()
    if (event.code === 'Space' && !event.repeat && this.canTriggerActiveWeapon()) {
      this.send({ type: 'trigger-weapon' })
      return
    }
    if (!this.canInput()) return
    this.pressedCodes.add(event.code)
    if (event.code === 'KeyR' && !event.repeat) this.eventsFromHost?.onPauseRequest()
    else if (event.code === 'BracketLeft' && !event.repeat) this.cycleWeapon(-1)
    else if (event.code === 'BracketRight' && !event.repeat) this.cycleWeapon(1)
    else if (event.code === 'Space' && !event.repeat) this.activateWeapon()
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
    const weaponId = this.weaponAtViewportPoint(this.pointerViewportPoint(event))
    if (weaponId) {
      const ammo = this.source.activePlayer.inventory[weaponId]
      if (ammo === 'unlimited' || ammo > 0) this.selectWeapon(weaponId)
      event.preventDefault()
      return
    }
    const pointer = this.pointerWorldPoint(event)
    if (this.selectedWeapon().aimMode === 'target-position') {
      this.teleportTarget = this.source.resolveTeleportTarget(pointer) ?? pointer
      event.preventDefault()
      return
    }
    this.canvas.setPointerCapture(event.pointerId)
    this.dragging = true
    this.activePointerId = event.pointerId
    this.dragStart = pointer
    this.dragPreview = null
    event.preventDefault()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.canInput()) return
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return
    const pointer = this.pointerWorldPoint(event)
    if (this.selectedWeapon().aimMode === 'target-position') {
      this.teleportTarget = this.source.resolveTeleportTarget(pointer) ?? pointer
      event.preventDefault()
      return
    }
    if (!this.dragging || !this.dragStart) return
    if (
      Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y) *
        this.cameras.main.zoom >=
      DRAG_START_DISTANCE
    )
      this.dragPreview = dragAim(
        this.aimOrigin(),
        pointer,
        POWER_MIN_PERCENT,
        POWER_MAX_PERCENT,
        this.cameras.main.zoom,
        this.edgeAdjustedPullDistance(event, pointer),
      )
    event.preventDefault()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.activePointerId) return
    if (this.canInput() && this.dragPreview) {
      this.shotAim = this.dragPreview
      this.rememberedAims.set(this.source.activePlayer.id, structuredClone(this.dragPreview))
    }
    this.clearDrag(event.pointerId)
    event.preventDefault()
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) this.clearDrag(event.pointerId)
  }

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return
    this.dragging = false
    this.activePointerId = null
    this.dragStart = null
    this.dragPreview = null
  }

  private activateWeapon(): void {
    if (this.selectedWeapon().aimMode === 'target-position') {
      if (this.teleportTarget && this.source.isValidTeleport(this.teleportTarget))
        this.send({
          type: 'activate-weapon',
          activation: { kind: 'target-position', target: this.teleportTarget },
        })
    } else if (this.selectedWeapon().aimMode === 'self')
      this.send({ type: 'activate-weapon', activation: { kind: 'self' } })
    else {
      const aim = this.dragPreview ?? this.shotAim
      if (this.dragPreview) {
        this.shotAim = this.dragPreview
        this.rememberedAims.set(this.source.activePlayer.id, structuredClone(this.dragPreview))
      }
      this.send({
        type: 'activate-weapon',
        activation: { kind: 'directional', aimDirection: aim.direction, power: aim.power },
      })
    }
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
    const viewportPoint = this.pointerViewportPoint(event)
    return this.cameras.main.getWorldPoint(viewportPoint.x, viewportPoint.y)
  }

  private pointerViewportPoint(event: PointerEvent): Vector {
    return canvasPointToWorld(
      event.clientX,
      event.clientY,
      this.canvas.getBoundingClientRect(),
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    )
  }

  private weaponAtViewportPoint(point: Vector): WeaponId | null {
    const layout = this.weaponRackLayout()
    if (point.y < layout.rackY || point.y > layout.rackY + layout.rackHeight) return null
    const index = Math.round(
      (point.x - layout.rackX - layout.rackPadding - layout.weaponRadius) /
        (layout.weaponDiameter + layout.rackGap),
    )
    const weaponId = WEAPON_ORDER[index]
    if (!weaponId) return null
    const centerX =
      layout.rackX +
      layout.rackPadding +
      layout.weaponRadius +
      index * (layout.weaponDiameter + layout.rackGap)
    return Math.hypot(point.x - centerX, point.y - layout.weaponCenterY) <=
      layout.weaponRadius
      ? weaponId
      : null
  }

  private edgeAdjustedPullDistance(event: PointerEvent, pointer: Vector): number {
    const origin = this.aimOrigin()
    const zoom = this.cameras.main.zoom
    const pullX = (pointer.x - origin.x) * zoom
    const pullY = (pointer.y - origin.y) * zoom
    const rawDistance = Math.hypot(pullX, pullY)
    const bounds = this.canvas.getBoundingClientRect()
    const scaleX = bounds.width / VIEWPORT_WIDTH
    const scaleY = bounds.height / VIEWPORT_HEIGHT
    const originClientX = event.clientX - pullX * scaleX
    const originClientY = event.clientY - pullY * scaleY
    const clientPullX = event.clientX - originClientX
    const clientPullY = event.clientY - originClientY
    const clientDistance = Math.hypot(clientPullX, clientPullY)
    if (clientDistance === 0) return rawDistance

    const directionX = clientPullX / clientDistance
    const directionY = clientPullY / clientDistance
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0
    const top = viewport?.offsetTop ?? 0
    const right = left + (viewport?.width ?? window.innerWidth)
    const bottom = top + (viewport?.height ?? window.innerHeight)
    const boundaryDistances = [
      directionX < 0 ? (left - originClientX) / directionX : Number.POSITIVE_INFINITY,
      directionX > 0 ? (right - originClientX) / directionX : Number.POSITIVE_INFINITY,
      directionY < 0 ? (top - originClientY) / directionY : Number.POSITIVE_INFINITY,
      directionY > 0 ? (bottom - originClientY) / directionY : Number.POSITIVE_INFINITY,
    ].filter((distance) => distance >= 0)
    const availableClientDistance = Math.min(...boundaryDistances)
    const cssScale = (scaleX + scaleY) / 2
    const availableDistance = availableClientDistance / Math.max(cssScale, Number.EPSILON)
    if (!Number.isFinite(availableDistance) || availableDistance >= DRAG_MAX_DISTANCE)
      return rawDistance

    // Preserve angle while mapping the constrained edge travel across the full power range.
    const usableDistance = Math.max(availableDistance, DRAG_START_DISTANCE + 1)
    const progress = Math.max(
      0,
      Math.min(
        1,
        (rawDistance - DRAG_START_DISTANCE) / (usableDistance - DRAG_START_DISTANCE),
      ),
    )
    return DRAG_MIN_DISTANCE + progress * (DRAG_MAX_DISTANCE - DRAG_MIN_DISTANCE)
  }

  private selectedWeapon() {
    return WEAPONS[this.pendingWeaponId ?? this.source.activePlayer.selectedWeapon]
  }

  private selectWeapon(weaponId: WeaponId): void {
    this.pendingWeaponId = weaponId
    this.send({ type: 'select-weapon', weaponId }, () => {
      if (this.pendingWeaponId === weaponId) this.pendingWeaponId = null
    })
  }

  private cycleWeapon(direction: -1 | 1): void {
    const player = this.source.activePlayer
    const current = WEAPON_ORDER.indexOf(this.selectedWeapon().id)
    for (let offset = 1; offset <= WEAPON_ORDER.length; offset += 1) {
      const index = (current + direction * offset + WEAPON_ORDER.length) % WEAPON_ORDER.length
      const weaponId = WEAPON_ORDER[index]
      const ammo = player.inventory[weaponId]
      if (ammo === 'unlimited' || ammo > 0) {
        this.selectWeapon(weaponId)
        return
      }
    }
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
    const facing = this.source?.activePlayer?.facing ?? 1
    const radians = (DEFAULT_AIM_ELEVATION * Math.PI) / 180
    return {
      direction: { x: Math.cos(radians) * facing, y: -Math.sin(radians) },
      power: DEFAULT_POWER_PERCENT,
      distance: 112 / (this.cameras?.main?.zoom || 1),
      worldAngle: facing === 1 ? DEFAULT_AIM_ELEVATION : 180 - DEFAULT_AIM_ELEVATION,
    }
  }

  private rememberedAim(playerId: string): DragAim {
    return structuredClone(this.rememberedAims.get(playerId) ?? this.defaultAim())
  }

  private configureWorldCamera(): void {
    if (!this.source || !this.cameras?.main) return
    const { worldWidth, worldHeight } = this.source.state
    const camera = this.cameras.main
    camera.setBounds(0, 0, worldWidth, worldHeight)
    camera.setZoom(this.fitCameraZoom())
    camera.centerOn(worldWidth / 2, worldHeight / 2)
  }

  private fitCameraZoom(): number {
    const { worldWidth, worldHeight } = this.source.state
    return Math.min(VIEWPORT_WIDTH / worldWidth, VIEWPORT_HEIGHT / worldHeight)
  }

  private updateWorldCamera(delta: number): void {
    const state = this.source.state
    const camera = this.cameras.main
    const fitZoom = this.fitCameraZoom()
    const showingOverview = this.preferences.cameraMode === 'fit' || this.introDuration > 0
    const targetZoom = showingOverview ? fitZoom : Math.min(1, fitZoom * 1.32)
    const focus = showingOverview
      ? { x: state.worldWidth / 2, y: state.worldHeight / 2 }
      : (state.projectiles[0]?.position ??
        (this.visualTime < this.actionFocusUntil ? this.actionFocus : null) ??
        this.source.activePlayer.position)
    const easing = this.preferences.reducedMotion ? 1 : 1 - Math.exp(-delta * 6)
    const zoom = Phaser.Math.Linear(camera.zoom, targetZoom, easing)
    camera.setZoom(zoom)
    const visibleWidth = VIEWPORT_WIDTH / zoom
    const visibleHeight = VIEWPORT_HEIGHT / zoom
    const targetScrollX = Phaser.Math.Clamp(
      focus.x - visibleWidth / 2,
      0,
      Math.max(0, state.worldWidth - visibleWidth),
    )
    const targetScrollY = Phaser.Math.Clamp(
      focus.y - visibleHeight / 2,
      0,
      Math.max(0, state.worldHeight - visibleHeight),
    )
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, easing)
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, easing)
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
    const map = getMap(this.source.state.mapId)
    const { width, height, theme } = map
    this.backgroundGraphics.clear().fillStyle(theme.sky).fillRect(0, 0, width, height)
    this.backgroundGraphics.fillStyle(theme.sun, 0.72).fillCircle(width - width * 0.11, height * 0.19, 46)
    this.backgroundGraphics
      .fillStyle(theme.backHill, 0.45)
      .fillEllipse(width * 0.18, height * 0.63, width * 0.45, height * 0.29)
      .fillEllipse(width * 0.81, height * 0.61, width * 0.49, height * 0.31)
    this.backgroundGraphics
      .fillStyle(0xffffff, 0.62)
      .fillEllipse(width * 0.14, height * 0.21, 115, 20)
      .fillEllipse(width * 0.68, height * 0.27, 145, 25)
  }

  private renderTerrain(): void {
    const state = this.source.state
    const terrain = this.source.getTerrain()
    if (
      this.renderedTerrainMatchId === state.matchId &&
      this.renderedTerrainOperationCount === state.terrainOperations.length &&
      this.renderedTerrain === terrain
    )
      return
    this.renderedTerrainMatchId = state.matchId
    this.renderedTerrainOperationCount = state.terrainOperations.length
    this.renderedTerrain = terrain
    const map = getMap(state.mapId)
    this.terrainGraphics.clear()
    for (let x = 0; x < terrain.width; x += 1) {
      let start = 0
      let material = TERRAIN_MATERIAL.empty as TerrainMaterialId
      for (let y = 0; y <= terrain.height; y += 1) {
        const next =
          y < terrain.height
            ? (terrain.cells[y * terrain.width + x] as TerrainMaterialId)
            : TERRAIN_MATERIAL.empty
        if (next !== material) {
          if (material !== TERRAIN_MATERIAL.empty)
            this.terrainGraphics
              .fillStyle(this.terrainMaterialColor(material))
              .fillRect(
                x * terrain.scale,
                start * terrain.scale,
                terrain.scale,
                (y - start) * terrain.scale,
              )
          material = next
          start = y
        }
      }
    }
    for (let y = 0; y < terrain.height; y += 1)
      for (let x = 0; x < terrain.width; x += 1) {
        const material = terrain.cells[y * terrain.width + x] as TerrainMaterialId
        const above = y === 0 ? TERRAIN_MATERIAL.empty : terrain.cells[(y - 1) * terrain.width + x]
        if (material !== TERRAIN_MATERIAL.empty && above === TERRAIN_MATERIAL.empty)
          this.terrainGraphics
            .fillStyle(
              material === TERRAIN_MATERIAL.soil
                ? map.theme.surface
                : this.terrainMaterialColor(material),
              0.95,
            )
            .fillRect(x * terrain.scale, y * terrain.scale - 1, terrain.scale, 2)
      }
  }

  private terrainMaterialColor(material: TerrainMaterialId): number {
    const theme = getMap(this.source.state.mapId).theme
    if (material === TERRAIN_MATERIAL.brick) return theme.brick
    if (material === TERRAIN_MATERIAL.stone) return theme.stone
    if (material === TERRAIN_MATERIAL.steel) return theme.steel
    return theme.terrain
  }

  private renderActors(): void {
    this.actorGraphics.clear()
    this.source.state.players.forEach((player, index) => {
      const reaction = this.reactions.get(player.id)
      const moving = player.moveDirection !== 0 && player.grounded
      const weaponPose = this.resolveWeaponPose(player, index, reaction)
      const aimingFacing = Math.sign(weaponPose.direction.x)
      const facing = player.moveDirection || aimingFacing || player.facing
      const bob =
        !this.preferences.reducedMotion && player.grounded
          ? Math.sin(this.visualTime * (moving ? 11 : 3) + index) * (moving ? 2.5 : 1.25)
          : 0
      const { x } = player.position
      const hurt = (reaction?.hurtUntil ?? 0) > this.visualTime
      const defeated = !player.alive
      const victory =
        player.alive &&
        this.source.state.phase === 'victory' &&
        this.source.state.winnerTeamId === player.teamId
      const victoryBob =
        victory && !this.preferences.reducedMotion
          ? -Math.abs(Math.sin(this.visualTime * 7)) * 7
          : 0
      const y = player.position.y + bob + victoryBob
      const scale = ACTOR_VISUAL_SCALE
      const shadowY =
        this.source
          .getTerrain()
          .surfaceY(x, Math.max(0, player.position.y - player.radius + 1)) ?? y + player.radius
      this.actorGraphics
        .fillStyle(0x473b31, 0.7)
        .fillEllipse(x + 3 * scale, shadowY + 7 * scale, 32 * scale, 9 * scale)
      this.actorGraphics
        .fillStyle(hurt ? 0xffffff : ACTOR_COLORS[index % ACTOR_COLORS.length])
        .fillRoundedRect(
          x - 17 * scale,
          y - (defeated ? 4 : 13) * scale,
          34 * scale,
          (defeated ? 16 : 31) * scale,
          12 * scale,
        )
      this.actorGraphics
        .fillStyle(0xfff6d8)
        .fillEllipse(x + facing * 3 * scale, y - 3 * scale, 22 * scale, 15 * scale)
      this.actorGraphics
        .fillStyle(0x24313a)
        .fillCircle(x + facing * 7 * scale, y - 4 * scale, 2.8 * scale)
        .fillCircle(x + facing * scale, y - 4 * scale, 2.8 * scale)
      this.actorGraphics
        .lineStyle(2 * scale, 0x24313a)
        .lineBetween(
          x + facing * 2 * scale,
          y + 5 * scale,
          x + facing * (hurt ? 5 : 8) * scale,
          y + (hurt ? 8 : 5) * scale,
        )
      this.actorGraphics
        .fillStyle(ACTOR_COLORS[index % ACTOR_COLORS.length])
        .fillTriangle(
          x - 13 * facing * scale,
          y - 13 * scale,
          x - 4 * facing * scale,
          y - 25 * scale,
          x - 3 * facing * scale,
          y - 11 * scale,
        )
      this.actorGraphics
        .lineStyle(2.5, TEAM_COLORS[player.teamId])
        .strokeRoundedRect(x - 17 * scale, y - 13 * scale, 34 * scale, 31 * scale, 12 * scale)
      if (player.frozenTurnsRemaining > 0)
        this.actorGraphics
          .lineStyle(3, 0x8ee8ff, 0.9)
          .strokeRoundedRect(x - 19 * scale, y - 15 * scale, 38 * scale, 35 * scale, 13 * scale)
      for (let marker = 0; marker <= player.teamSlot; marker += 1)
        this.actorGraphics
          .fillStyle(0xfff6d8)
          .fillCircle(x - player.teamSlot * 3 + marker * 6, y + 13 * scale, 1.8)
      if (!defeated)
        this.renderHeldWeapon(
          { x, y },
          weaponPose.direction,
          weaponPose.weaponId,
          reaction,
          facing,
        )
    })
  }

  private resolveWeaponPose(
    player: SimPlayer,
    index: number,
    reaction?: Reaction,
  ): { direction: Vector; weaponId: WeaponId } {
    const fired = (reaction?.firedUntil ?? 0) > this.visualTime && reaction?.fireWeapon
    if (fired)
      return {
        direction: normalizeDirection(reaction.fireDirection, { x: player.facing, y: 0 }),
        weaponId: reaction.fireWeapon!,
      }

    const equippedWeapon =
      reaction?.equippedWeapon &&
      reaction.equippedAt !== undefined &&
      (player.selectedWeapon === reaction.equippedWeapon ||
        this.visualTime - reaction.equippedAt < 1)
        ? reaction.equippedWeapon
        : player.selectedWeapon
    const locallyControlled =
      index === this.source.state.activePlayerIndex && this.source.canControlActivePlayer()
    if (locallyControlled) {
      if (equippedWeapon === 'teleporter' && this.teleportTarget)
        return {
          direction: normalizeDirection({
            x: this.teleportTarget.x - player.position.x,
            y: this.teleportTarget.y - player.position.y,
          }),
          weaponId: equippedWeapon,
        }
      if (WEAPONS[equippedWeapon].aimMode === 'directional')
        return {
          direction: normalizeDirection((this.dragPreview ?? this.shotAim).direction),
          weaponId: equippedWeapon,
        }
    }

    const presentation = getWeaponPresentation(equippedWeapon)
    const elevation = (presentation.restElevation * Math.PI) / 180
    return {
      direction: { x: Math.cos(elevation) * player.facing, y: Math.sin(elevation) },
      weaponId: equippedWeapon,
    }
  }

  private renderHeldWeapon(
    actorCenter: Vector,
    direction: Vector,
    weaponId: WeaponId,
    reaction: Reaction | undefined,
    facing: number,
  ): void {
    const presentation = getWeaponPresentation(weaponId)
    const policy = this.weaponMotionPolicy(weaponId)
    const firedAge = this.visualTime - (reaction?.firedAt ?? -Infinity)
    const recoilProgress =
      reaction?.fireWeapon === weaponId && policy.recoilDurationMs > 0
        ? Phaser.Math.Clamp(firedAge / (policy.recoilDurationMs / 1000), 0, 1)
        : 1
    const recoil = policy.recoilDistance * (1 - recoilProgress)
    const forward = normalizeDirection(direction, { x: facing, y: 0 })
    const origin = {
      x: actorCenter.x - forward.x * recoil,
      y:
        actorCenter.y -
        forward.y * recoil +
        (!this.preferences.reducedMotion &&
        reaction?.equippedAt !== undefined &&
        reaction.equippedWeapon === weaponId
          ? Math.max(0, 1 - (this.visualTime - reaction.equippedAt) / 0.16) * 7
          : 0),
    }
    const modelScale = weaponModelScale(weaponId)
    const handedness = heldWeaponHandedness(forward, facing)
    const posePoint = (x: number, y: number) =>
      transformLocalPoint(origin, forward, { x, y: y * handedness })
    const local = (x: number, y: number) =>
      posePoint(x * modelScale, y * modelScale)
    const grip = local(presentation.grip.x, presentation.grip.y)
    const support = local(
      Math.min(presentation.body.length * 0.62, presentation.muzzle.x - 5),
      presentation.grip.y * 0.35,
    )
    const shoulderBack = posePoint(-5, 4.5)
    const shoulderFront = posePoint(1, -2.5)

    this.actorGraphics
      .lineStyle(7, INK_COLOR)
      .lineBetween(shoulderBack.x, shoulderBack.y, grip.x, grip.y)
      .lineBetween(shoulderFront.x, shoulderFront.y, support.x, support.y)
      .lineStyle(4, 0xffdca8)
      .lineBetween(shoulderBack.x, shoulderBack.y, grip.x, grip.y)
      .lineBetween(shoulderFront.x, shoulderFront.y, support.x, support.y)

    this.drawWeaponModel(this.actorGraphics, weaponId, local, modelScale)
    this.actorGraphics
      .fillStyle(INK_COLOR)
      .fillCircle(grip.x, grip.y, 4.2)
      .fillCircle(support.x, support.y, 4.2)
      .fillStyle(0xffe2b2)
      .fillCircle(grip.x, grip.y, 2.5)
      .fillCircle(support.x, support.y, 2.5)
  }

  private drawWeaponModel(
    graphics: Phaser.GameObjects.Graphics,
    weaponId: WeaponId,
    local: (x: number, y: number) => Vector,
    shapeScale: number,
  ): void {
    const presentation = getWeaponPresentation(weaponId)
    const outline = Math.max(1.25, 3 * shapeScale)
    const polygon = (points: Array<[number, number]>, color: number): void => {
      const worldPoints = points.map(([x, y]) => {
        const point = local(x, y)
        return new Phaser.Math.Vector2(point.x, point.y)
      })
      graphics
        .fillStyle(color)
        .fillPoints(worldPoints, true)
        .lineStyle(outline, INK_COLOR)
        .strokePoints(worldPoints, true)
    }
    const line = (width: number, color: number, from: [number, number], to: [number, number]) => {
      const start = local(...from)
      const end = local(...to)
      const innerWidth = Math.max(1, width * shapeScale)
      graphics
        .lineStyle(innerWidth + outline, INK_COLOR)
        .lineBetween(start.x, start.y, end.x, end.y)
        .lineStyle(innerWidth, color)
        .lineBetween(start.x, start.y, end.x, end.y)
    }
    const body = presentation.body
    const halfWidth = body.width / 2

    switch (presentation.heldModel) {
      case 'shoulder-rocket-tube':
        polygon(
          [
            [-7, -halfWidth * 0.7],
            [body.length - 2, -halfWidth * 0.7],
            [body.length - 2, halfWidth * 0.7],
            [-7, halfWidth * 0.7],
          ],
          presentation.colors.primary,
        )
        polygon(
          [
            [body.length - 5, -halfWidth],
            [presentation.muzzle.x + 2, -halfWidth * 1.15],
            [presentation.muzzle.x + 2, halfWidth * 1.15],
            [body.length - 5, halfWidth],
          ],
          presentation.colors.accent,
        )
        line(3, presentation.colors.accent, [-5, 0], [body.length - 7, 0])
        return
      case 'long-brass-rail-cannon':
        polygon(
          [
            [-8, -halfWidth * 0.55],
            [body.length, -halfWidth * 0.55],
            [presentation.muzzle.x + 2, 0],
            [body.length, halfWidth * 0.55],
            [-8, halfWidth * 0.55],
          ],
          presentation.colors.primary,
        )
        line(2.5, presentation.colors.accent, [2, -halfWidth], [presentation.muzzle.x, -halfWidth])
        line(2.5, presentation.colors.accent, [2, halfWidth], [presentation.muzzle.x, halfWidth])
        return
      case 'stubby-bell-mortar':
        polygon(
          [
            [-7, -halfWidth * 0.42],
            [body.length * 0.5, -halfWidth * 0.6],
            [presentation.muzzle.x + 2, -halfWidth],
            [presentation.muzzle.x + 2, halfWidth],
            [body.length * 0.5, halfWidth * 0.6],
            [-7, halfWidth * 0.42],
          ],
          presentation.colors.primary,
        )
        line(4, presentation.colors.accent, [body.length * 0.45, -halfWidth * 0.58], [body.length * 0.45, halfWidth * 0.58])
        return
      case 'compact-grenade-cup-launcher':
        polygon(
          [
            [-6, -halfWidth * 0.45],
            [body.length - 7, -halfWidth * 0.6],
            [body.length - 7, halfWidth * 0.6],
            [-6, halfWidth * 0.45],
          ],
          presentation.colors.primary,
        )
        polygon(
          [
            [body.length - 9, -halfWidth],
            [presentation.muzzle.x + 2, -halfWidth * 0.85],
            [presentation.muzzle.x + 2, halfWidth * 0.85],
            [body.length - 9, halfWidth],
          ],
          presentation.colors.accent,
        )
        line(4, presentation.colors.primary, [presentation.grip.x, 3], [presentation.grip.x - 2, 13])
        return
      case 'wide-scrap-blunderbuss':
        polygon(
          [
            [-7, -halfWidth * 0.35],
            [body.length * 0.45, -halfWidth * 0.45],
            [presentation.muzzle.x + 2, -halfWidth],
            [presentation.muzzle.x + 2, halfWidth],
            [body.length * 0.45, halfWidth * 0.45],
            [-7, halfWidth * 0.35],
          ],
          presentation.colors.primary,
        )
        line(3, presentation.colors.accent, [body.length * 0.5, -halfWidth * 0.45], [presentation.muzzle.x, -halfWidth * 0.85])
        line(3, presentation.colors.accent, [body.length * 0.5, halfWidth * 0.45], [presentation.muzzle.x, halfWidth * 0.85])
        return
      case 'heavy-segmented-cluster-canister':
        polygon(
          [
            [-6, -halfWidth * 0.7],
            [presentation.muzzle.x, -halfWidth * 0.7],
            [presentation.muzzle.x, halfWidth * 0.7],
            [-6, halfWidth * 0.7],
          ],
          presentation.colors.primary,
        )
        for (const segment of [5, 16, 27, 38])
          line(3, presentation.colors.accent, [segment, -halfWidth * 0.7], [segment, halfWidth * 0.7])
        return
      case 'spiral-borer-launcher':
        polygon(
          [
            [-7, -halfWidth * 0.65],
            [body.length * 0.62, -halfWidth * 0.65],
            [presentation.muzzle.x + 3, 0],
            [body.length * 0.62, halfWidth * 0.65],
            [-7, halfWidth * 0.65],
          ],
          presentation.colors.primary,
        )
        for (const x of [20, 27, 34])
          line(2.5, presentation.colors.accent, [x - 4, -halfWidth * 0.58], [x + 4, halfWidth * 0.58])
        return
      case 'red-plunger-minelayer':
        polygon(
          [
            [-6, -halfWidth * 0.55],
            [body.length * 0.72, -halfWidth * 0.8],
            [presentation.muzzle.x, -halfWidth * 0.35],
            [presentation.muzzle.x, halfWidth * 0.35],
            [body.length * 0.72, halfWidth * 0.8],
            [-6, halfWidth * 0.55],
          ],
          presentation.colors.primary,
        )
        line(3, presentation.colors.accent, [body.length * 0.35, -halfWidth * 0.65], [body.length * 0.35, halfWidth * 0.65])
        return
      case 'folding-pocket-knife':
        polygon(
          [
            [-6, -halfWidth],
            [10, -halfWidth],
            [10, halfWidth],
            [-6, halfWidth],
          ],
          presentation.colors.primary,
        )
        polygon(
          [
            [10, -halfWidth * 0.55],
            [presentation.muzzle.x + 2, 0],
            [10, halfWidth * 0.55],
          ],
          presentation.colors.accent,
        )
        return
      case 'signal-beacon-launcher':
        polygon(
          [
            [-6, -halfWidth * 0.65],
            [body.length - 5, -halfWidth * 0.65],
            [presentation.muzzle.x + 2, -halfWidth],
            [presentation.muzzle.x + 2, halfWidth],
            [body.length - 5, halfWidth * 0.65],
            [-6, halfWidth * 0.65],
          ],
          presentation.colors.primary,
        )
        line(3, presentation.colors.accent, [body.length * 0.55, -halfWidth], [body.length * 0.55, halfWidth])
        return
      case 'twin-prong-fork-launcher':
        polygon(
          [
            [-7, -halfWidth * 0.5],
            [body.length * 0.55, -halfWidth * 0.5],
            [body.length * 0.55, halfWidth * 0.5],
            [-7, halfWidth * 0.5],
          ],
          presentation.colors.primary,
        )
        line(4, presentation.colors.accent, [body.length * 0.45, -3], [presentation.muzzle.x, -halfWidth * 0.7])
        line(4, presentation.colors.accent, [body.length * 0.45, 3], [presentation.muzzle.x, halfWidth * 0.7])
        return
      case 'spring-shoe-slinger':
        polygon(
          [
            [-7, -halfWidth * 0.5],
            [body.length * 0.62, -halfWidth * 0.7],
            [presentation.muzzle.x, -halfWidth * 0.25],
            [presentation.muzzle.x, halfWidth * 0.25],
            [body.length * 0.62, halfWidth * 0.7],
            [-7, halfWidth * 0.5],
          ],
          presentation.colors.primary,
        )
        line(3, presentation.colors.accent, [4, -halfWidth * 0.6], [body.length * 0.55, halfWidth * 0.6])
        return
      case 'oversized-siege-bazooka':
        polygon(
          [
            [-11, -halfWidth * 0.72],
            [body.length, -halfWidth * 0.72],
            [presentation.muzzle.x + 3, -halfWidth],
            [presentation.muzzle.x + 3, halfWidth],
            [body.length, halfWidth * 0.72],
            [-11, halfWidth * 0.72],
          ],
          presentation.colors.primary,
        )
        for (const x of [2, 28, 50])
          line(4, presentation.colors.accent, [x, -halfWidth * 0.72], [x, halfWidth * 0.72])
        return
      case 'frost-coil-launcher':
        polygon(
          [
            [-6, -halfWidth * 0.6],
            [body.length, -halfWidth * 0.6],
            [presentation.muzzle.x + 2, 0],
            [body.length, halfWidth * 0.6],
            [-6, halfWidth * 0.6],
          ],
          presentation.colors.primary,
        )
        for (const x of [8, 16, 24, 32])
          line(2.5, presentation.colors.accent, [x - 3, -halfWidth * 0.7], [x + 3, halfWidth * 0.7])
        return
      case 'mint-tuning-fork-teleporter': {
        polygon(
          [
            [-5, -halfWidth * 0.5],
            [body.length * 0.48, -halfWidth * 0.5],
            [body.length * 0.48, halfWidth * 0.5],
            [-5, halfWidth * 0.5],
          ],
          presentation.colors.primary,
        )
        line(4, presentation.colors.accent, [body.length * 0.42, -3], [presentation.muzzle.x, -halfWidth])
        line(4, presentation.colors.accent, [body.length * 0.42, 3], [presentation.muzzle.x, halfWidth])
        const ring = local(body.length * 0.7, 0)
        graphics
          .lineStyle(Math.max(1.25, 2.5 * shapeScale), INK_COLOR)
          .strokeCircle(ring.x, ring.y, 5.5 * shapeScale)
          .lineStyle(Math.max(1, 1.5 * shapeScale), presentation.colors.accent)
          .strokeCircle(ring.x, ring.y, 4 * shapeScale)
      }
    }
  }

  private renderOverlay(): void {
    this.overlayGraphics.clear()
    if (this.canInput()) {
      const aim = this.dragPreview ?? this.shotAim
      if (this.selectedWeapon().aimMode === 'target-position') this.renderTeleportMarker()
      else if (this.selectedWeapon().aimMode === 'directional') {
        if (this.selectedWeapon().id === 'scatter-shot')
          this.renderScatterGuide(this.aimOrigin(), aim.direction)
        else if (this.selectedWeapon().mechanic === 'melee')
          this.renderMeleeGuide(this.aimOrigin(), aim.direction)
        else this.renderAimGuide(this.projectileOrigin(aim.direction), aim.direction, aim.power)
      }
    }
    this.renderProjectileTrails()
    for (const projectile of this.source.state.projectiles) this.renderProjectile(projectile)
    this.renderMines()
    this.renderBeacons()
  }

  private reconcileProjectileTrails(): void {
    const present = new Set<string>()
    for (const projectile of this.source.state.projectiles) {
      present.add(projectile.id)
      const policy = this.weaponMotionPolicy(projectile.weaponId)
      const cap = Math.max(1, policy.trailSampleCount)
      const existing = this.projectileTrails.get(projectile.id)
      if (!existing) {
        this.projectileTrails.set(projectile.id, {
          weaponId: projectile.weaponId,
          kind: projectile.kind,
          points: [{ ...projectile.position }],
        })
        continue
      }
      existing.weaponId = projectile.weaponId
      existing.kind = projectile.kind
      const last = existing.points[existing.points.length - 1]
      const movement = Math.hypot(projectile.position.x - last.x, projectile.position.y - last.y)
      if (movement >= Math.max(0.8, policy.trailWidth * 0.35))
        existing.points.push({ ...projectile.position })
      if (existing.points.length > cap) existing.points.splice(0, existing.points.length - cap)
    }
    for (const id of this.projectileTrails.keys())
      if (!present.has(id)) this.projectileTrails.delete(id)
    while (this.projectileTrails.size > MAX_PROJECTILE_TRAILS) {
      const oldest = this.projectileTrails.keys().next().value as string | undefined
      if (!oldest) break
      this.projectileTrails.delete(oldest)
    }
  }

  private renderProjectileTrails(): void {
    for (const trail of this.projectileTrails.values()) {
      const policy = this.weaponMotionPolicy(trail.weaponId)
      const points = trail.points.slice(-policy.trailSampleCount)
      if (points.length < 2) continue
      const presentation = getWeaponPresentation(trail.weaponId)
      for (let index = 1; index < points.length; index += 1) {
        const alpha = (index / points.length) * 0.72
        const width =
          policy.trailWidth * (trail.kind === 'cluster-child' ? 0.65 : 1) *
          (0.45 + index / points.length / 2)
        this.overlayGraphics
          .lineStyle(width, presentation.trail.color, alpha)
          .lineBetween(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y)
      }
    }
  }

  private renderProjectile(projectile: SimProjectile): void {
    const presentation = getWeaponPresentation(projectile.weaponId)
    const policy = this.weaponMotionPolicy(projectile.weaponId)
    const direction = normalizeDirection(projectile.velocity)
    const local = (x: number, y: number) =>
      transformLocalPoint(projectile.position, direction, { x, y })
    const polygon = (points: Array<[number, number]>, color: number, outline = 2): void => {
      const worldPoints = points.map(([x, y]) => {
        const point = local(x, y)
        return new Phaser.Math.Vector2(point.x, point.y)
      })
      this.overlayGraphics
        .fillStyle(color)
        .fillPoints(worldPoints, true)
        .lineStyle(outline, INK_COLOR)
        .strokePoints(worldPoints, true)
    }

    if (projectile.kind === 'cluster-child') {
      polygon(
        [
          [-6, 0],
          [-2, -4],
          [4, -3],
          [7, 0],
          [4, 3],
          [-2, 4],
        ],
        presentation.colors.accent,
      )
      const bandA = local(-1, -3.5)
      const bandB = local(-1, 3.5)
      this.overlayGraphics
        .lineStyle(2, presentation.colors.primary)
        .lineBetween(bandA.x, bandA.y, bandB.x, bandB.y)
      return
    }

    switch (presentation.projectileModel) {
      case 'toy-rocket': {
        const flameLength = policy.pulse ? 8 + Math.sin(this.visualTime * 22) * 2 : 7
        polygon(
          [
            [-9, -2.5],
            [-9 - flameLength, 0],
            [-9, 2.5],
          ],
          presentation.colors.flash,
          1.5,
        )
        polygon(
          [
            [-8, -4],
            [5, -4],
            [10, 0],
            [5, 4],
            [-8, 4],
          ],
          presentation.colors.primary,
        )
        polygon(
          [
            [-6, -3],
            [-11, -8],
            [-1, -4],
          ],
          presentation.colors.accent,
          1.5,
        )
        polygon(
          [
            [-6, 3],
            [-11, 8],
            [-1, 4],
          ],
          presentation.colors.accent,
          1.5,
        )
        break
      }
      case 'needle-shell':
        polygon(
          [
            [-10, -2],
            [7, -2],
            [13, 0],
            [7, 2],
            [-10, 2],
          ],
          presentation.colors.primary,
          1.5,
        )
        {
          const streak = local(-16, 0)
          this.overlayGraphics
            .lineStyle(2, presentation.colors.flash, 0.8)
            .lineBetween(streak.x, streak.y, projectile.position.x, projectile.position.y)
        }
        break
      case 'heavy-mortar-shell':
        polygon(
          [
            [-7, -5],
            [5, -5],
            [10, 0],
            [5, 5],
            [-7, 5],
            [-11, 0],
          ],
          presentation.colors.primary,
        )
        {
          const bandTop = local(2, -5)
          const bandBottom = local(2, 5)
          this.overlayGraphics
            .lineStyle(2, presentation.colors.accent)
            .lineBetween(bandTop.x, bandTop.y, bandBottom.x, bandBottom.y)
        }
        break
      case 'clockwork-grenade': {
        const radius = projectile.radius + 1
        this.overlayGraphics
          .fillStyle(presentation.colors.primary)
          .fillCircle(projectile.position.x, projectile.position.y, radius)
          .lineStyle(2.5, INK_COLOR)
          .strokeCircle(projectile.position.x, projectile.position.y, radius)
          .lineStyle(1.5, presentation.colors.accent)
          .strokeCircle(projectile.position.x, projectile.position.y, radius * 0.55)
        const hand = local(radius * 0.45, 0)
        this.overlayGraphics
          .lineStyle(1.5, presentation.colors.flash)
          .lineBetween(projectile.position.x, projectile.position.y, hand.x, hand.y)
        const fuseStart = local(0, -radius)
        const fuseEnd = local(3, -radius - 5)
        const pin = local(-2, -radius - 3)
        this.overlayGraphics
          .lineStyle(2.5, INK_COLOR)
          .lineBetween(fuseStart.x, fuseStart.y, fuseEnd.x, fuseEnd.y)
          .lineStyle(1.5, presentation.colors.accent)
          .strokeCircle(pin.x, pin.y, 2.5)
          .fillStyle(presentation.colors.flash)
          .fillCircle(fuseEnd.x, fuseEnd.y, 2)
        if (policy.pulse) {
          const pulse = radius + 3 + Math.sin(this.visualTime * 12) * 1.5
          this.overlayGraphics
            .lineStyle(1.5, presentation.colors.accent, 0.45)
            .strokeCircle(projectile.position.x, projectile.position.y, pulse)
        }
        break
      }
      case 'segmented-cluster-canister': {
        polygon(
          [
            [-10, -5],
            [7, -5],
            [10, -2],
            [10, 2],
            [7, 5],
            [-10, 5],
          ],
          presentation.colors.primary,
        )
        for (const x of [-5, 1, 7]) {
          const top = local(x, -5)
          const bottom = local(x, 5)
          this.overlayGraphics
            .lineStyle(2, presentation.colors.accent)
            .lineBetween(top.x, top.y, bottom.x, bottom.y)
        }
        break
      }
      case 'scrap-pellet':
        polygon(
          [
            [-4, -3],
            [5, 0],
            [-4, 3],
          ],
          presentation.colors.accent,
        )
        break
      case 'spinning-drill': {
        polygon(
          [
            [-9, -5],
            [2, -5],
            [12, 0],
            [2, 5],
            [-9, 5],
          ],
          presentation.colors.primary,
        )
        const phase = this.preferences.reducedMotion ? 0 : Math.sin(this.visualTime * 32) * 3
        for (const x of [-5, 1, 7]) {
          const top = local(x + phase, -4)
          const bottom = local(x - phase, 4)
          this.overlayGraphics
            .lineStyle(2, presentation.colors.accent)
            .lineBetween(top.x, top.y, bottom.x, bottom.y)
        }
        break
      }
      case 'beacon-canister':
        polygon(
          projectile.kind === 'beacon-bomb'
            ? [
                [-8, -5],
                [5, -5],
                [9, 0],
                [5, 5],
                [-8, 5],
              ]
            : [
                [-6, -4],
                [6, -4],
                [9, 0],
                [6, 4],
                [-6, 4],
              ],
          projectile.kind === 'beacon-bomb'
            ? presentation.colors.primary
            : presentation.colors.accent,
        )
        break
      case 'fork-rocket':
        polygon(
          [
            [-9, -4],
            [5, -4],
            [10, 0],
            [5, 4],
            [-9, 4],
          ],
          presentation.colors.primary,
        )
        {
          const upper = local(-5, -6)
          const lower = local(-5, 6)
          this.overlayGraphics
            .lineStyle(2, presentation.colors.accent)
            .lineBetween(upper.x, upper.y, lower.x, lower.y)
        }
        break
      case 'flying-shoe':
        polygon(
          [
            [-8, -3],
            [1, -5],
            [9, -2],
            [10, 3],
            [-2, 5],
            [-9, 2],
          ],
          presentation.colors.primary,
        )
        break
      case 'siege-rocket':
        polygon(
          [
            [-13, -7],
            [7, -7],
            [14, 0],
            [7, 7],
            [-13, 7],
          ],
          presentation.colors.primary,
        )
        {
          const bandTop = local(3, -7)
          const bandBottom = local(3, 7)
          this.overlayGraphics
            .lineStyle(3, presentation.colors.accent)
            .lineBetween(bandTop.x, bandTop.y, bandBottom.x, bandBottom.y)
        }
        break
      case 'cryo-capsule':
        this.overlayGraphics
          .fillStyle(presentation.colors.primary)
          .fillCircle(projectile.position.x, projectile.position.y, projectile.radius + 2)
          .lineStyle(2, INK_COLOR)
          .strokeCircle(projectile.position.x, projectile.position.y, projectile.radius + 2)
          .lineStyle(2, presentation.colors.flash, 0.8)
          .strokeCircle(projectile.position.x, projectile.position.y, projectile.radius - 1)
        break
      case 'none':
        break
    }
  }

  private renderMines(): void {
    const presentation = getWeaponPresentation('deployable-mine')
    for (const mine of this.source.state.mines) {
      const armed = this.source.state.turnNumber >= mine.armedTurn
      this.overlayGraphics
        .fillStyle(INK_COLOR, 0.55)
        .fillEllipse(mine.position.x, mine.position.y + mine.radius, mine.radius * 2.8, 5)
        .fillStyle(presentation.colors.primary)
        .fillEllipse(mine.position.x, mine.position.y, mine.radius * 2.4, mine.radius * 1.45)
        .lineStyle(2, INK_COLOR)
        .strokeEllipse(mine.position.x, mine.position.y, mine.radius * 2.4, mine.radius * 1.45)
        .fillStyle(armed ? presentation.colors.flash : 0x6e7478)
        .fillCircle(mine.position.x, mine.position.y - mine.radius * 0.55, 2.2)
      if (armed && !this.preferences.reducedMotion)
        this.overlayGraphics
          .lineStyle(1.5, presentation.colors.accent, 0.25 + Math.sin(this.visualTime * 7) * 0.1)
          .strokeCircle(mine.position.x, mine.position.y, mine.radius + 3)
    }
  }

  private renderBeacons(): void {
    const presentation = getWeaponPresentation('bomb-beacon')
    for (const beacon of this.source.state.beacons) {
      const seconds = Math.max(0, beacon.remainingTicks / SIMULATION_HZ)
      const pulse = this.preferences.reducedMotion ? 0 : Math.sin(this.visualTime * 9) * 2
      this.overlayGraphics
        .fillStyle(presentation.colors.primary)
        .fillCircle(beacon.position.x, beacon.position.y - 3, 7)
        .lineStyle(2, INK_COLOR)
        .strokeCircle(beacon.position.x, beacon.position.y - 3, 7)
        .lineStyle(2, presentation.colors.accent, 0.75)
        .strokeCircle(beacon.position.x, beacon.position.y - 3, 11 + pulse)
      this.overlayGraphics
        .fillStyle(presentation.colors.flash)
        .fillCircle(beacon.position.x, beacon.position.y - 5, seconds < 0.6 ? 3 : 2)
    }
  }

  private renderMeleeGuide(origin: Vector, direction: Vector): void {
    const range = this.selectedWeapon().meleeRange ?? 0
    this.overlayGraphics
      .lineStyle(4, getWeaponPresentation('pocket-knife').colors.flash, 0.7)
      .lineBetween(
        origin.x,
        origin.y,
        origin.x + direction.x * range,
        origin.y + direction.y * range,
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
      .strokeCircle(
        this.teleportTarget.x,
        this.teleportTarget.y,
        this.source.activePlayer.radius / this.cameras.main.zoom,
      )
  }

  private weaponRackLayout() {
    const rackMaxWidth = VIEWPORT_WIDTH - 40
    const rackGap = 6
    const rackPadding = 10
    const weaponDiameter = Math.min(
      48,
      (rackMaxWidth - rackPadding * 2 - rackGap * (WEAPON_ORDER.length - 1)) /
        WEAPON_ORDER.length,
    )
    const rackWidth =
      weaponDiameter * WEAPON_ORDER.length +
      rackGap * (WEAPON_ORDER.length - 1) +
      rackPadding * 2
    const rackX = (VIEWPORT_WIDTH - rackWidth) / 2
    const rackY = VIEWPORT_HEIGHT - 70
    const rackHeight = 62
    return {
      rackGap,
      rackPadding,
      weaponDiameter,
      rackWidth,
      rackX,
      rackY,
      rackHeight,
      weaponRadius: weaponDiameter / 2,
      weaponCenterY: rackY + 27,
    }
  }

  private renderHud(): void {
    const state = this.source.state
    const {
      rackGap,
      rackPadding,
      weaponDiameter,
      rackWidth,
      rackX,
      rackY,
      rackHeight,
      weaponRadius,
      weaponCenterY,
    } = this.weaponRackLayout()
    this.hudGraphics.clear().fillStyle(0x473b31, 0.88)
    this.hudGraphics.fillRoundedRect(VIEWPORT_WIDTH / 2 - 64, 9, 128, 47, 18)
    state.players.forEach((player, index) => {
      const cardX = player.teamId === 0 ? 12 : VIEWPORT_WIDTH - 237
      const cardY = 10 + player.teamSlot * 52
      this.hudGraphics.fillStyle(0x473b31, 0.88).fillRoundedRect(cardX, cardY, 225, 46, 10)
      this.hudGraphics
        .fillStyle(
          this.preferences.highContrastHud
            ? 0x72e58d
            : ACTOR_COLORS[index % ACTOR_COLORS.length],
        )
        .fillRoundedRect(
          player.teamId === 0 ? cardX + 20 : cardX + 55,
          cardY + 30,
          150 * ((this.displayedHealth[index] ?? player.health) / 100),
          6,
          3,
        )
      const text = this.playerHudTexts[index]
      if (text)
        text
          .setVisible(true)
          .setPosition(player.teamId === 0 ? cardX + 15 : cardX + 210, cardY + 7)
          .setOrigin(player.teamId === 0 ? 0 : 1, 0)
          .setText(
            `${state.activePlayerIndex === index ? '◆ ' : ''}${player.name} · ${Math.ceil(player.health)}${player.frozenTurnsRemaining > 0 ? ' · FROZEN' : ''}`,
          )
    })
    for (let index = state.players.length; index < this.playerHudTexts.length; index += 1)
      this.playerHudTexts[index].setVisible(false)
    this.hudGraphics
      .fillStyle(this.source.timerRemainingSeconds <= 5 ? 0xe65d3d : 0xf7bd3f)
      .fillCircle(VIEWPORT_WIDTH / 2, 31, 18)
    this.hudGraphics
      .fillStyle(0x24313a, 0.94)
      .fillRoundedRect(rackX, rackY, rackWidth, rackHeight, rackHeight / 2)
      .lineStyle(2, 0xfff4d8, 0.28)
      .strokeRoundedRect(rackX, rackY, rackWidth, rackHeight, rackHeight / 2)
      .fillStyle(0x24313a, 0.94)
      .fillRoundedRect(VIEWPORT_WIDTH / 2 - 220, rackY - 25, 440, 20, 10)
    WEAPON_ORDER.forEach((id, index) => {
      const ammo = this.source.activePlayer.inventory[id]
      const available = ammo === 'unlimited' || ammo > 0
      const selected = this.selectedWeapon().id === id
      const centerX =
        rackX + rackPadding + weaponRadius + index * (weaponDiameter + rackGap)
      const presentation = getWeaponPresentation(id)
      const circleColor = selected
        ? 0xffe29a
        : available
          ? this.preferences.highContrastHud
            ? 0x111111
            : 0x31464d
          : 0x202a2d
      this.hudGraphics
        .fillStyle(circleColor, 0.98)
        .fillCircle(centerX, weaponCenterY, weaponRadius)
        .lineStyle(
          selected ? 4 : 1.5,
          selected ? presentation.colors.accent : 0xfff4d8,
          selected ? 1 : 0.42,
        )
        .strokeCircle(centerX, weaponCenterY, weaponRadius)
      const iconScale = 0.43 * (weaponDiameter / 48)
      const iconOrigin = { x: centerX - 3, y: weaponCenterY + 1 }
      this.drawWeaponModel(
        this.hudGraphics,
        id,
        (x, y) => ({ x: iconOrigin.x + x * iconScale, y: iconOrigin.y + y * iconScale }),
        iconScale,
      )
      if (!available)
        this.hudGraphics
          .lineStyle(3, 0xe65d3d, 0.9)
          .lineBetween(
            centerX - weaponRadius * 0.65,
            weaponCenterY + weaponRadius * 0.65,
            centerX + weaponRadius * 0.65,
            weaponCenterY - weaponRadius * 0.65,
          )
      const ammoLabel = ammo === 'unlimited' ? '∞' : String(ammo)
      this.hudGraphics
        .fillStyle(selected ? 0xfff4d8 : 0x18272c, 0.96)
        .fillRoundedRect(centerX - 12, weaponCenterY + weaponRadius - 8, 24, 13, 6)
      this.weaponHudTexts[index]
        .setPosition(centerX, weaponCenterY + weaponRadius - 6)
        .setOrigin(0.5, 0)
        .setAlpha(available || selected || this.preferences.highContrastHud ? 1 : 0.5)
        .setColor(selected ? '#24313a' : '#fff8df')
        .setText(ammoLabel)
    })
    this.canvas.setAttribute('data-wind', String(state.wind))
    this.canvas.setAttribute(
      'data-effect-count',
      String(
        this.burstEffects.length +
          this.damageEffects.length +
          this.traceEffects.length +
          this.weaponEffects.length,
      ),
    )
    const hint =
      this.canTriggerActiveWeapon()
        ? 'Space now to split into two rockets'
        : this.source.activePlayer.frozenTurnsRemaining > 0 &&
            state.turnNumber > this.source.activePlayer.frozenAppliedTurn
          ? 'Frozen · aim and fire, but movement is locked'
          : this.selectedWeapon().aimMode === 'target-position'
        ? 'Point at safe ground · Space to warp'
        : this.selectedWeapon().aimMode === 'self'
          ? 'Face a clear ledge · Space to deploy'
        : this.selectedWeapon().powerMode === 'fixed'
          ? 'Short-range spread · Space to fire'
          : `Power ${Math.round((this.dragPreview ?? this.shotAim).power)}% · drag toward target · Space to fire`
    this.bottomHud
      .setPosition(VIEWPORT_WIDTH / 2, rackY - 23)
      .setOrigin(0.5, 0)
      .setText(`${this.selectedWeapon().displayName} · ${hint} · click a tool or [ ] cycle`)
    if (this.introDuration > 0) {
      const countdown = this.introDuration > 0.6 ? Math.ceil(this.introDuration / 0.6) : 'Begin'
      this.bannerText
        .setText(
          `${getMap(state.config.mapId).displayName}\n${state.config.mode !== '1v1' ? 'Team Comet vs Team Ember' : `${state.players[0].name} vs ${state.players[1].name}`}\n${countdown}`,
        )
        .setVisible(true)
    } else if (this.turnBannerDuration > 0)
      this.bannerText
        .setText(
          this.bannerOverride ||
            `${this.source.activePlayer.name}'s Turn\n${state.config.mode !== '1v1' ? `Team ${this.source.activePlayer.teamId === 0 ? 'Comet' : 'Ember'} · ` : ''}${this.windLabel(state.wind)}`,
        )
        .setVisible(true)
    else this.bannerText.setVisible(false)
    const remaining = Math.ceil(this.source.timerRemainingSeconds)
    this.timerText.setText(
      remaining <= 5 && state.phase === 'input' ? `! ${remaining}s !` : `${remaining}s`,
    )
    this.windText.setText(`${this.windLabel(state.wind)} · Turn ${state.turnNumber}`)
    this.cameraModeText.setText(
      `${this.preferences.cameraMode === 'fit' ? 'Fit map' : 'Follow action'} · C to switch`,
    )
    this.canvas.setAttribute('data-camera-mode', this.preferences.cameraMode)
  }

  private consumeMatchEvent(event: MatchEvent): void {
    if (!this.eventGuard.consume(event)) return
    const reaction = (playerId: string) => this.reactions.get(playerId) ?? {}
    switch (event.type) {
      case 'turn-started':
        this.turnBannerDuration = this.preferences.reducedMotion ? 0.45 : 0.9
        this.bannerOverride = ''
        this.pendingWeaponId = null
        this.shotAim = this.rememberedAim(event.playerId)
        this.teleportTarget = null
        return
      case 'turn-expired':
        this.bannerOverride = 'Time expired'
        this.turnBannerDuration = 0.7
        return
      case 'weapon-selected':
        {
          const state = reaction(event.playerId)
          state.equippedAt = this.visualTime
          state.equippedWeapon = event.weaponId
          this.reactions.set(event.playerId, state)
        }
        this.audio.play('weapon-select')
        return
      case 'weapon-fired': {
        const state = reaction(event.playerId)
        const policy = this.weaponMotionPolicy(event.weaponId)
        const player = this.source.state.players.find((candidate) => candidate.id === event.playerId)
        const direction = normalizeDirection(event.direction, { x: player?.facing ?? 1, y: 0 })
        state.firedAt = this.visualTime
        state.firedUntil = this.visualTime + Math.max(0.14, policy.recoilDurationMs / 1000)
        state.fireDirection = direction
        state.fireWeapon = event.weaponId
        this.reactions.set(event.playerId, state)
        const effectPosition =
          event.weaponId === 'teleporter' || event.weaponId === 'deployable-mine'
            ? event.origin
            : {
                x: event.origin.x + direction.x * 24,
                y: event.origin.y + direction.y * 24,
              }
        const requestedLifetime =
          event.weaponId === 'teleporter'
            ? 360
            : event.weaponId === 'scatter-shot'
              ? 150
              : event.weaponId === 'cluster-charge'
                ? 210
                : event.weaponId === 'timed-grenade'
                  ? 195
                  : 180
        this.addWeaponEffect(
          'muzzle',
          event.weaponId,
          effectPosition,
          direction,
          requestedLifetime,
          event.sequence,
        )
        const cue: Record<WeaponId, SoundCue> = {
          'basic-rocket': 'rocket-fire',
          'precision-cannon': 'cannon-fire',
          'high-arc-mortar': 'mortar-fire',
          'timed-grenade': 'grenade-fire',
          'scatter-shot': 'scatter-fire',
          'cluster-charge': 'cluster-fire',
          'terrain-boring-drill': 'drill-fire',
          'deployable-mine': 'mine-deploy',
          'pocket-knife': 'knife-swing',
          'bomb-beacon': 'beacon-fire',
          'fork-rocket': 'fork-fire',
          'old-shoe': 'shoe-fire',
          'siege-bazooka': 'siege-fire',
          'cryo-shot': 'cryo-fire',
          teleporter: 'teleport',
        }
        this.audio.play(cue[event.weaponId])
        return
      }
      case 'projectile-spawned':
        return
      case 'projectile-bounced':
        this.addWeaponEffect(
          'bounce',
          event.weaponId,
          event.position,
          { x: 0, y: -1 },
          240,
          event.sequence,
        )
        this.audio.play('grenade-bounce')
        return
      case 'cluster-split':
        this.addBurst('explosion', event.position, 25, event.sequence, 'cluster-charge')
        this.addWeaponEffect(
          'split',
          'cluster-charge',
          event.position,
          { x: 1, y: 0 },
          300,
          event.sequence,
        )
        this.audio.play('cluster-split')
        return
      case 'remote-split':
        this.addWeaponEffect(
          'split',
          'fork-rocket',
          event.position,
          { x: 1, y: 0 },
          260,
          event.sequence,
        )
        this.audio.play('fork-split')
        return
      case 'drill-bored':
        this.addWeaponEffect(
          'split',
          'terrain-boring-drill',
          event.to,
          normalizeDirection({ x: event.to.x - event.from.x, y: event.to.y - event.from.y }),
          280,
          event.sequence,
        )
        return
      case 'scatter-fired': {
        const lifetime =
          this.weaponMotionPolicy('scatter-shot').transientDurationMs(
            this.preferences.reducedMotion ? 100 : 220,
          ) / 1000
        this.traceEffects.push({
          weaponId: 'scatter-shot',
          origin: event.origin,
          endpoints: event.endpoints,
          age: 0,
          lifetime,
        })
        if (this.traceEffects.length > 16)
          this.traceEffects.splice(0, this.traceEffects.length - 16)
        return
      }
      case 'explosion-resolved':
        this.actionFocus = { ...event.position }
        this.actionFocusUntil = this.visualTime + (this.preferences.reducedMotion ? 0 : 0.65)
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
        this.actionFocus = { ...event.to }
        this.actionFocusUntil = this.visualTime + (this.preferences.reducedMotion ? 0 : 0.5)
        this.addBurst('teleport', event.from, 28, event.sequence, 'teleporter')
        this.addBurst('teleport', event.to, 34, event.sequence + 1, 'teleporter')
        return
      case 'mine-deployed':
        return
      case 'mine-triggered':
        this.actionFocus = { ...event.position }
        this.actionFocusUntil = this.visualTime + (this.preferences.reducedMotion ? 0 : 0.55)
        this.audio.play('mine-trigger')
        return
      case 'beacon-deployed':
        this.audio.play('beacon-armed')
        return
      case 'barrage-released':
        this.actionFocus = { ...event.position }
        this.actionFocusUntil = this.visualTime + (this.preferences.reducedMotion ? 0 : 0.8)
        this.audio.play('barrage-release')
        return
      case 'melee-struck':
        this.traceEffects.push({
          weaponId: 'pocket-knife',
          origin: event.origin,
          endpoints: [event.endpoint],
          age: 0,
          lifetime: this.preferences.reducedMotion ? 0.08 : 0.2,
        })
        this.audio.play(event.targetPlayerId ? 'knife-hit' : 'knife-swing')
        return
      case 'player-frozen': {
        const player = this.source.state.players.find(
          (candidate) => candidate.id === event.playerId,
        )
        if (player)
          this.addWeaponEffect(
            'split',
            'cryo-shot',
            player.position,
            { x: 0, y: -1 },
            420,
            event.sequence,
          )
        this.audio.play('freeze')
        return
      }
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
        this.uiCamera.ignore(label)
        this.damageEffects.push({
          playerId: event.playerId,
          amount: event.amount,
          selfDamage: event.selfDamage,
          age: 0,
          label,
        })
        if (this.damageEffects.length > 24) {
          const removed = this.damageEffects.splice(0, this.damageEffects.length - 24)
          for (const effect of removed) effect.label.destroy()
        }
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

  private weaponMotionPolicy(weaponId: WeaponId): WeaponMotionPolicy {
    return getWeaponMotionPolicy(weaponId, this.preferences.reducedMotion)
  }

  private addWeaponEffect(
    kind: WeaponEffect['kind'],
    weaponId: WeaponId,
    position: Vector,
    direction: Vector,
    requestedLifetimeMs: number,
    seed: number,
  ): void {
    const lifetime =
      this.weaponMotionPolicy(weaponId).transientDurationMs(requestedLifetimeMs) / 1000
    if (lifetime <= 0) return
    this.weaponEffects.push({
      kind,
      weaponId,
      position: { ...position },
      direction: normalizeDirection(direction),
      age: 0,
      lifetime,
      seed,
    })
    if (this.weaponEffects.length > MAX_WEAPON_EFFECTS)
      this.weaponEffects.splice(0, this.weaponEffects.length - MAX_WEAPON_EFFECTS)
  }

  private addBurst(
    kind: BurstEffect['kind'],
    position: Vector,
    radius: number,
    seed: number,
    weaponId?: SimProjectile['weaponId'],
  ): void {
    const lifetime = weaponId
      ? this.weaponMotionPolicy(weaponId).transientDurationMs(700) / 1000
      : this.preferences.reducedMotion
        ? 0.22
        : 0.7
    this.burstEffects.push({
      kind,
      position: { ...position },
      weaponId,
      radius,
      seed,
      age: 0,
      lifetime,
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
        weaponId === 'high-arc-mortar' || weaponId === 'deployable-mine'
          ? 0.007
          : weaponId === 'siege-bazooka'
            ? 0.011
          : weaponId === 'timed-grenade'
            ? 0.006
            : weaponId === 'cluster-charge'
              ? 0.002
              : 0.0045,
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
    for (const effect of this.weaponEffects) {
      const progress = Phaser.Math.Clamp(effect.age / effect.lifetime, 0, 1)
      const alpha = 1 - progress
      const presentation = getWeaponPresentation(effect.weaponId)
      const policy = this.weaponMotionPolicy(effect.weaponId)
      const forward = normalizeDirection(effect.direction)
      const across = perpendicular(forward)
      const point = (forwardDistance: number, acrossDistance: number): Vector => ({
        x:
          effect.position.x +
          forward.x * forwardDistance +
          across.x * acrossDistance,
        y:
          effect.position.y +
          forward.y * forwardDistance +
          across.y * acrossDistance,
      })

      if (
        effect.kind === 'muzzle' &&
        (effect.weaponId === 'teleporter' || effect.weaponId === 'deployable-mine')
      ) {
        const ringProgress = policy.pulse ? progress : Math.min(progress, 0.35)
        this.overlayGraphics
          .lineStyle(3, presentation.colors.accent, alpha)
          .strokeCircle(
            effect.position.x,
            effect.position.y,
            (effect.weaponId === 'deployable-mine' ? 5 : 8) + ringProgress * 22,
          )
          .lineStyle(2, presentation.colors.flash, alpha * 0.8)
          .strokeCircle(effect.position.x, effect.position.y, 3 + ringProgress * 14)
        continue
      }

      if (effect.kind === 'muzzle') {
        const length =
          effect.weaponId === 'scatter-shot'
            ? 18
            : effect.weaponId === 'cluster-charge'
              ? 14
              : 12
        const width = effect.weaponId === 'scatter-shot' ? 12 : 7
        const tip = point(length * (1 - progress * 0.35), 0)
        const upper = point(1, -width * (1 - progress * 0.45))
        const lower = point(1, width * (1 - progress * 0.45))
        this.overlayGraphics
          .fillStyle(presentation.colors.flash, alpha)
          .fillTriangle(upper.x, upper.y, lower.x, lower.y, tip.x, tip.y)
          .lineStyle(2, presentation.colors.accent, alpha)
          .lineBetween(upper.x, upper.y, tip.x, tip.y)
          .lineBetween(lower.x, lower.y, tip.x, tip.y)
        if (effect.weaponId === 'cluster-charge') {
          for (const offset of [-7, 0, 7]) {
            const spark = point(7 + progress * 8, offset)
            this.overlayGraphics
              .fillStyle(presentation.colors.accent, alpha)
              .fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3)
          }
        }
        continue
      }

      if (effect.kind === 'bounce') {
        const travel = policy.pulse ? progress * 13 : 2
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = -Math.PI * 0.9 + (spark / 4) * Math.PI * 0.8
          const distance = 4 + travel * (0.65 + spark * 0.08)
          const endpoint = {
            x: effect.position.x + Math.cos(angle) * distance,
            y: effect.position.y + Math.sin(angle) * distance,
          }
          this.overlayGraphics
            .lineStyle(2, spark % 2 ? presentation.colors.accent : presentation.colors.flash, alpha)
            .lineBetween(effect.position.x, effect.position.y, endpoint.x, endpoint.y)
        }
        continue
      }

      const spokeDistance = (policy.pulse ? 8 + progress * 22 : 12)
      for (let spoke = 0; spoke < 10; spoke += 1) {
        const angle = effect.seed * 0.13 + (spoke / 10) * Math.PI * 2
        const inner = spokeDistance * 0.35
        this.overlayGraphics
          .lineStyle(
            spoke % 2 ? 2 : 3,
            spoke % 2 ? presentation.colors.accent : presentation.colors.impact,
            alpha,
          )
          .lineBetween(
            effect.position.x + Math.cos(angle) * inner,
            effect.position.y + Math.sin(angle) * inner,
            effect.position.x + Math.cos(angle) * spokeDistance,
            effect.position.y + Math.sin(angle) * spokeDistance,
          )
      }
    }
    for (const effect of this.burstEffects) {
      const progress = effect.age / effect.lifetime
      const colors = effect.weaponId ? getWeaponPresentation(effect.weaponId).colors : null
      const color = colors?.impact ?? (effect.kind === 'teleport' ? 0x74f1d0 : 0xffc04d)
      const size = effect.radius * (0.25 + progress * 0.9)
      this.overlayGraphics
        .lineStyle(4 - progress * 2, color, 1 - progress)
        .strokeCircle(effect.position.x, effect.position.y, size)
      if (progress < 0.3)
        this.overlayGraphics
          .fillStyle(colors?.flash ?? 0xfff7cf, 1 - progress / 0.3)
          .fillCircle(effect.position.x, effect.position.y, effect.radius * (0.45 - progress * 0.6))
      if (!this.preferences.reducedMotion && effect.kind === 'explosion') {
        const fragments = effect.weaponId === 'cluster-charge' ? 3 : 6
        for (let index = 0; index < fragments; index += 1) {
          const angle = effect.seed * 0.73 + index * 2.4
          const distance = progress * effect.radius * 0.85
          this.overlayGraphics
            .fillStyle(
              index % 2 ? (colors?.impact ?? 0x8f6848) : (colors?.accent ?? 0xd7ad66),
              1 - progress,
            )
            .fillCircle(
              effect.position.x + Math.cos(angle) * distance,
              effect.position.y + Math.sin(angle) * distance - progress * 12,
              2.5,
            )
        }
        const smokeCount =
          effect.weaponId === 'timed-grenade' ? 4 : effect.weaponId === 'cluster-charge' ? 1 : 3
        const dustColor = getMap(this.source.state.mapId).theme.dust
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
      const alpha = 1 - trace.age / trace.lifetime
      const colors = getWeaponPresentation(trace.weaponId).colors
      this.overlayGraphics.lineStyle(2, colors.flash, alpha)
      for (const endpoint of trace.endpoints)
        this.overlayGraphics.lineBetween(trace.origin.x, trace.origin.y, endpoint.x, endpoint.y)
      for (const endpoint of trace.endpoints)
        this.overlayGraphics.fillStyle(colors.impact, alpha).fillCircle(endpoint.x, endpoint.y, 2.5)
    }
    for (const damage of this.damageEffects) {
      const player = this.source.state.players.find((candidate) => candidate.id === damage.playerId)
      if (!player) continue
      const progress = damage.age
      const rise = this.preferences.reducedMotion ? 0 : progress * 20
      this.overlayGraphics
        .fillStyle(damage.selfDamage ? 0xffb061 : 0xffffff, 1 - progress)
        .fillRoundedRect(player.position.x - 18, player.position.y - 35 - rise, 36, 18, 6)
      this.overlayGraphics.fillStyle(0x8f2f2f, 1 - progress)
      const bars = Math.min(8, Math.max(1, Math.round(damage.amount / 8)))
      for (let bar = 0; bar < bars; bar += 1)
        this.overlayGraphics.fillRect(
          player.position.x - 12 + bar * 3,
          player.position.y - 29 - rise,
          2,
          6,
        )
    }
  }

  private updateHealthPresentation(delta: number): void {
    this.source.state.players.forEach((player, index) => {
      if (this.preferences.reducedMotion) this.displayedHealth[index] = player.health
      else {
        const current = this.displayedHealth[index] ?? player.health
        this.displayedHealth[index] =
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
