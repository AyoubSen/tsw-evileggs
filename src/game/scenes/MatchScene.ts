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
import type { AudioDirector } from '../../audio/AudioDirector'
import { EventSequenceGuard, type PresentationPreferences } from '../presentation'
import {
  getWeaponPresentation,
  heldWeaponHandedness,
  normalizeDirection,
  perpendicular,
  transformLocalPoint,
  weaponModelScale,
  type WeaponMotionPolicy,
} from '../weaponPresentation'
import {
  getProjectileVisual,
  getWeaponVisual,
  resolveWeaponPalette,
  type ActivationEffectKind,
  type ImpactStyle,
} from '../weaponVisualRecipes'
import { drawShapeRecipe } from '../weaponRenderer'

type BurstEffect = {
  kind: 'explosion' | 'teleport'
  style: ImpactStyle
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
  style: 'scatter' | 'knife-hit' | 'knife-miss' | 'knife-blocked'
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
  kind: ActivationEffectKind | 'bounce' | 'split' | 'bore' | 'freeze'
  weaponId: WeaponId
  position: Vector
  direction: Vector
  age: number
  lifetime: number
  seed: number
}
type ReflectionEffect = {
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
const MAX_REFLECTION_EFFECTS = 24

export class MatchScene extends Phaser.Scene {
  private source!: MatchSource
  private renderScale = 1
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
  private mapObjectGraphics!: Phaser.GameObjects.Graphics
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
  private reflectionEffects: ReflectionEffect[] = []
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
  private lastReflectionAudioAt = -1
  private lastShakeAt = -1
  private renderedTerrainMatchId = ''
  private renderedTerrainOperationCount = -1
  private renderedTerrain: TerrainMask | null = null
  private renderedMapObjectsKey = ''
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
    renderScale?: number
  }): void {
    this.source = data.source
    this.eventsFromHost = data.events ?? null
    this.preferences = data.preferences
    this.audio = data.audio
    this.renderScale = Math.max(1, data.renderScale ?? 1)
  }

  create(): void {
    this.backgroundGraphics = this.add.graphics()
    this.terrainGraphics = this.add.graphics()
    this.mapObjectGraphics = this.add.graphics()
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
    this.uiCamera = this.cameras
      .add(0, 0, VIEWPORT_WIDTH * this.renderScale, VIEWPORT_HEIGHT * this.renderScale)
      .setOrigin(0, 0)
      .setScroll(0, 0)
      .setZoom(this.renderScale)
    const worldObjects = [
      this.backgroundGraphics,
      this.terrainGraphics,
      this.mapObjectGraphics,
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
    this.applyTextResolution()
    this.installInput()
    this.updateRenderDiagnostics()
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
    this.reflectionEffects.forEach((effect) => (effect.age += presentationDelta))
    this.burstEffects = this.burstEffects.filter((effect) => effect.age < effect.lifetime)
    this.damageEffects = this.damageEffects.filter((effect) => {
      if (effect.age < 1) return true
      effect.label.destroy()
      return false
    })
    this.traceEffects = this.traceEffects.filter((effect) => effect.age < effect.lifetime)
    this.weaponEffects = this.weaponEffects.filter((effect) => effect.age < effect.lifetime)
    this.reflectionEffects = this.reflectionEffects.filter(
      (effect) => effect.age < effect.lifetime,
    )
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

  public setRenderScale(nextScale: number): void {
    const renderScale = Math.max(1, nextScale)
    if (renderScale === this.renderScale || !this.cameras?.main) return
    const mainCamera = this.cameras.main
    const center = { x: mainCamera.midPoint.x, y: mainCamera.midPoint.y }
    const logicalZoom = mainCamera.zoom / this.renderScale
    this.renderScale = renderScale
    const width = VIEWPORT_WIDTH * renderScale
    const height = VIEWPORT_HEIGHT * renderScale
    mainCamera
      .setViewport(0, 0, width, height)
      .setZoom(logicalZoom * renderScale)
      .centerOn(center.x, center.y)
    this.uiCamera
      .setViewport(0, 0, width, height)
      .setOrigin(0, 0)
      .setScroll(0, 0)
      .setZoom(renderScale)
    this.applyTextResolution()
    this.updateRenderDiagnostics()
  }

  private applyTextResolution(): void {
    const texts = [
      ...this.playerHudTexts,
      ...this.weaponHudTexts,
      this.bottomHud,
      this.timerText,
      this.windText,
      this.bannerText,
      this.cameraModeText,
    ]
    for (const text of texts) text?.setResolution(this.renderScale)
    for (const effect of this.damageEffects) effect.label.setResolution(this.renderScale)
  }

  private updateRenderDiagnostics(): void {
    const canvas = this.canvas ?? this.game?.canvas
    canvas?.setAttribute('data-render-scale', String(this.renderScale))
    canvas?.setAttribute('data-backing-width', String(Math.round(VIEWPORT_WIDTH * this.renderScale)))
    canvas?.setAttribute(
      'data-backing-height',
      String(Math.round(VIEWPORT_HEIGHT * this.renderScale)),
    )
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
    this.reflectionEffects = []
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
    this.renderedMapObjectsKey = ''
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
    this.reflectionEffects = []
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
        this.logicalCameraZoom() >=
      DRAG_START_DISTANCE
    )
      this.dragPreview = dragAim(
        this.aimOrigin(),
        pointer,
        POWER_MIN_PERCENT,
        POWER_MAX_PERCENT,
        this.logicalCameraZoom(),
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
    return this.cameras.main.getWorldPoint(
      viewportPoint.x * this.renderScale,
      viewportPoint.y * this.renderScale,
    )
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
    const zoom = this.logicalCameraZoom()
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
      distance: 112 / (this.cameras?.main ? this.logicalCameraZoom() : 1),
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
    camera.setViewport(
      0,
      0,
      VIEWPORT_WIDTH * this.renderScale,
      VIEWPORT_HEIGHT * this.renderScale,
    )
    camera.setBounds(0, 0, worldWidth, worldHeight)
    camera.setZoom(this.fitCameraZoom() * this.renderScale)
    camera.centerOn(worldWidth / 2, worldHeight / 2)
  }

  private fitCameraZoom(): number {
    const { worldWidth, worldHeight } = this.source.state
    return Math.min(VIEWPORT_WIDTH / worldWidth, VIEWPORT_HEIGHT / worldHeight)
  }

  private logicalCameraZoom(): number {
    return (this.cameras?.main?.zoom ?? this.renderScale) / this.renderScale
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
    const logicalZoom = Phaser.Math.Linear(this.logicalCameraZoom(), targetZoom, easing)
    camera.setZoom(logicalZoom * this.renderScale)
    const visibleWidth = VIEWPORT_WIDTH / logicalZoom
    const visibleHeight = VIEWPORT_HEIGHT / logicalZoom
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
    const nextScrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, easing)
    const nextScrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, easing)
    const worldUnitsPerPixel = 1 / Math.max(camera.zoom, Number.EPSILON)
    camera.scrollX = Math.round(nextScrollX / worldUnitsPerPixel) * worldUnitsPerPixel
    camera.scrollY = Math.round(nextScrollY / worldUnitsPerPixel) * worldUnitsPerPixel
  }

  private render(): void {
    if (!this.source) return
    this.renderBackdrop()
    this.renderTerrain()
    this.renderMapObjects()
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

  private renderMapObjects(): void {
    const state = this.source.state
    const cacheKey = `${state.matchId}:${state.mapId}:${state.mapRevision}:${state.mapContentHash}`
    if (cacheKey === this.renderedMapObjectsKey) return
    this.renderedMapObjectsKey = cacheKey
    this.mapObjectGraphics.clear()

    const map = getMap(state.mapId)
    for (const object of map.objects) {
      if (object.type !== 'reflector-wall') continue
      const dx = object.end.x - object.start.x
      const dy = object.end.y - object.start.y
      const length = Math.hypot(dx, dy)
      if (length === 0) continue
      const along = { x: dx / length, y: dy / length }
      const across = { x: -along.y, y: along.x }
      const outerWidth = object.thickness + 7
      this.mapObjectGraphics
        .lineStyle(outerWidth, INK_COLOR)
        .lineBetween(object.start.x, object.start.y, object.end.x, object.end.y)
        .lineStyle(object.thickness, map.theme.steel)
        .lineBetween(object.start.x, object.start.y, object.end.x, object.end.y)
        .lineStyle(2, 0xd8e2df, 0.72)
        .lineBetween(
          object.start.x + across.x * object.thickness * 0.24,
          object.start.y + across.y * object.thickness * 0.24,
          object.end.x + across.x * object.thickness * 0.24,
          object.end.y + across.y * object.thickness * 0.24,
        )

      const hatchHalfLength = Math.max(3, object.thickness * 0.38)
      for (let distance = 14; distance < length - 10; distance += 20) {
        const center = {
          x: object.start.x + along.x * distance,
          y: object.start.y + along.y * distance,
        }
        this.mapObjectGraphics
          .lineStyle(2.5, 0x17252b, 0.9)
          .lineBetween(
            center.x - across.x * hatchHalfLength - along.x * 3,
            center.y - across.y * hatchHalfLength - along.y * 3,
            center.x + across.x * hatchHalfLength + along.x * 3,
            center.y + across.y * hatchHalfLength + along.y * 3,
          )
      }

      for (const end of [object.start, object.end]) {
        this.mapObjectGraphics
          .lineStyle(6, INK_COLOR)
          .lineBetween(
            end.x - across.x * outerWidth * 0.58,
            end.y - across.y * outerWidth * 0.58,
            end.x + across.x * outerWidth * 0.58,
            end.y + across.y * outerWidth * 0.58,
          )
          .lineStyle(2.5, 0xb6c3c2)
          .lineBetween(
            end.x - across.x * object.thickness * 0.48,
            end.y - across.y * object.thickness * 0.48,
            end.x + across.x * object.thickness * 0.48,
            end.y + across.y * object.thickness * 0.48,
          )
          .fillStyle(0x17252b)
          .fillCircle(end.x, end.y, 2.5)
      }
    }
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
      if (player.frozenTurnsRemaining > 0) {
        const cryoPalette = resolveWeaponPalette('cryo-shot', this.preferences.highContrastHud)
        this.actorGraphics
          .lineStyle(3, cryoPalette.flash, 0.9)
          .strokeRoundedRect(x - 19 * scale, y - 15 * scale, 38 * scale, 35 * scale, 13 * scale)
        this.actorGraphics
          .lineStyle(1.5, cryoPalette.ink, 0.8)
          .lineBetween(x - 13, y - 10, x + 13, y + 10)
          .lineBetween(x - 13, y + 10, x + 13, y - 10)
      }
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
    const visual = getWeaponVisual(weaponId)
    const palette = resolveWeaponPalette(weaponId, this.preferences.highContrastHud)
    const policy = this.weaponMotionPolicy(weaponId)
    const firedAge = this.visualTime - (reaction?.firedAt ?? -Infinity)
    const recoilProgress =
      reaction?.fireWeapon === weaponId && policy.recoilDurationMs > 0
        ? Phaser.Math.Clamp(firedAge / (policy.recoilDurationMs / 1000), 0, 1)
        : 1
    const recoil = policy.recoilDistance * (1 - recoilProgress)
    let forward = normalizeDirection(direction, { x: facing, y: 0 })
    const firing = reaction?.fireWeapon === weaponId && firedAge >= 0 && recoilProgress < 1
    if (firing && !this.preferences.reducedMotion) {
      const side = Math.sign(facing) || 1
      const poseRotation =
        visual.pose === 'one-hand'
          ? (-0.72 + recoilProgress * 1.18) * side
          : visual.pose === 'throw'
            ? -0.9 * (1 - recoilProgress) * side
            : visual.pose === 'place'
              ? 0.35 * (1 - recoilProgress) * side
              : 0
      const cosine = Math.cos(poseRotation)
      const sine = Math.sin(poseRotation)
      forward = {
        x: forward.x * cosine - forward.y * sine,
        y: forward.x * sine + forward.y * cosine,
      }
    }
    const origin = {
      x:
        actorCenter.x -
        forward.x * recoil -
        (firing && visual.pose === 'throw' ? forward.x * (1 - recoilProgress) * 5 : 0),
      y:
        actorCenter.y -
        forward.y * recoil +
        (!this.preferences.reducedMotion &&
        reaction?.equippedAt !== undefined &&
        reaction.equippedWeapon === weaponId
          ? Math.max(0, 1 - (this.visualTime - reaction.equippedAt) / 0.16) * 7
          : 0),
    }
    const modelScale = weaponModelScale(weaponId) * visual.heldScale
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
      .lineStyle(4, 0xffdca8)
      .lineBetween(shoulderBack.x, shoulderBack.y, grip.x, grip.y)
    if (visual.pose !== 'one-hand' && visual.pose !== 'throw' && visual.pose !== 'place')
      this.actorGraphics
        .lineStyle(7, INK_COLOR)
        .lineBetween(shoulderFront.x, shoulderFront.y, support.x, support.y)
        .lineStyle(4, 0xffdca8)
        .lineBetween(shoulderFront.x, shoulderFront.y, support.x, support.y)

    drawShapeRecipe(this.actorGraphics, visual.held, {
      origin,
      direction: forward,
      scale: modelScale,
      mirrorY: handedness < 0,
      palette,
    })
    this.actorGraphics
      .fillStyle(INK_COLOR)
      .fillCircle(grip.x, grip.y, 4.2)
      .fillStyle(0xffe2b2)
      .fillCircle(grip.x, grip.y, 2.5)
    if (visual.pose !== 'one-hand' && visual.pose !== 'throw' && visual.pose !== 'place')
      this.actorGraphics
        .fillStyle(INK_COLOR)
        .fillCircle(support.x, support.y, 4.2)
        .fillStyle(0xffe2b2)
        .fillCircle(support.x, support.y, 2.5)
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
      const palette = resolveWeaponPalette(trail.weaponId, this.preferences.highContrastHud)
      const projectileVisual = getProjectileVisual(trail.weaponId, trail.kind)
      for (let index = 1; index < points.length; index += 1) {
        const alpha = (index / points.length) * 0.72
        const width =
          policy.trailWidth * (projectileVisual?.scale ?? 1) *
          (0.45 + index / points.length / 2)
        this.overlayGraphics
          .lineStyle(width, palette.trail, alpha)
          .lineBetween(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y)
      }
    }
  }

  private renderProjectile(projectile: SimProjectile): void {
    const visual = getProjectileVisual(projectile.weaponId, projectile.kind)
    if (!visual) {
      this.overlayGraphics
        .fillStyle(0xffffff)
        .fillCircle(projectile.position.x, projectile.position.y, Math.max(2, projectile.radius))
        .lineStyle(2, INK_COLOR)
        .strokeCircle(projectile.position.x, projectile.position.y, Math.max(2, projectile.radius))
      return
    }
    const palette = resolveWeaponPalette(projectile.weaponId, this.preferences.highContrastHud)
    const velocityDirection = normalizeDirection(projectile.velocity)
    const spin = this.preferences.reducedMotion ? 0 : visual.spinRadiansPerSecond * this.visualTime
    const cosine = Math.cos(spin)
    const sine = Math.sin(spin)
    const direction = {
      x: velocityDirection.x * cosine - velocityDirection.y * sine,
      y: velocityDirection.x * sine + velocityDirection.y * cosine,
    }
    drawShapeRecipe(this.overlayGraphics, visual.shape, {
      origin: projectile.position,
      direction,
      scale: visual.scale,
      palette,
    })
  }

  private renderMines(): void {
    const visual = getWeaponVisual('deployable-mine')
    const palette = resolveWeaponPalette('deployable-mine', this.preferences.highContrastHud)
    for (const mine of this.source.state.mines) {
      const armed = this.source.state.turnNumber >= mine.armedTurn
      this.overlayGraphics
        .fillStyle(INK_COLOR, 0.55)
        .fillEllipse(mine.position.x, mine.position.y + mine.radius, mine.radius * 2.8, 5)
      drawShapeRecipe(this.overlayGraphics, visual.icon, {
        origin: { x: mine.position.x, y: mine.position.y - 1 },
        scale: mine.radius / 15,
        palette,
      })
      this.overlayGraphics
        .fillStyle(armed ? palette.flash : palette.neutral)
        .fillCircle(mine.position.x, mine.position.y - mine.radius * 0.55, 2.2)
      if (armed && !this.preferences.reducedMotion)
        this.overlayGraphics
          .lineStyle(1.5, palette.accent, 0.25 + Math.sin(this.visualTime * 7) * 0.1)
          .strokeCircle(mine.position.x, mine.position.y, mine.radius + 3)
    }
  }

  private renderBeacons(): void {
    const visual = getWeaponVisual('bomb-beacon')
    const palette = resolveWeaponPalette('bomb-beacon', this.preferences.highContrastHud)
    for (const beacon of this.source.state.beacons) {
      const seconds = Math.max(0, beacon.remainingTicks / SIMULATION_HZ)
      const pulse = this.preferences.reducedMotion ? 0 : Math.sin(this.visualTime * 9) * 2
      drawShapeRecipe(this.overlayGraphics, visual.icon, {
        origin: { x: beacon.position.x, y: beacon.position.y - 3 },
        scale: 0.48,
        palette,
      })
      this.overlayGraphics
        .lineStyle(2, palette.accent, 0.75)
        .strokeCircle(beacon.position.x, beacon.position.y - 3, 11 + pulse)
      this.overlayGraphics
        .fillStyle(palette.flash)
        .fillCircle(beacon.position.x, beacon.position.y - 5, seconds < 0.6 ? 3 : 2)
    }
  }

  private renderMeleeGuide(origin: Vector, direction: Vector): void {
    const range = this.selectedWeapon().meleeRange ?? 0
    const palette = resolveWeaponPalette('pocket-knife', this.preferences.highContrastHud)
    const baseAngle = Math.atan2(direction.y, direction.x)
    let previous = origin
    this.overlayGraphics.lineStyle(4, palette.flash, 0.72)
    for (let step = 1; step <= 7; step += 1) {
      const progress = step / 7
      const angle = baseAngle - 0.42 + progress * 0.84
      const point = {
        x: origin.x + Math.cos(angle) * range,
        y: origin.y + Math.sin(angle) * range,
      }
      this.overlayGraphics.lineBetween(previous.x, previous.y, point.x, point.y)
      previous = point
    }
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
    const palette = resolveWeaponPalette('teleporter', this.preferences.highContrastHud)
    const radius = this.source.activePlayer.radius / this.logicalCameraZoom()
    this.overlayGraphics
      .lineStyle(3, valid ? palette.success : palette.impact)
      .strokeCircle(
        this.teleportTarget.x,
        this.teleportTarget.y,
        radius,
      )
    if (valid)
      this.overlayGraphics
        .lineStyle(3, palette.success)
        .lineBetween(this.teleportTarget.x - 6, this.teleportTarget.y, this.teleportTarget.x - 1, this.teleportTarget.y + 5)
        .lineBetween(this.teleportTarget.x - 1, this.teleportTarget.y + 5, this.teleportTarget.x + 8, this.teleportTarget.y - 7)
    else
      this.overlayGraphics
        .lineStyle(3, palette.impact)
        .lineBetween(this.teleportTarget.x - 6, this.teleportTarget.y - 6, this.teleportTarget.x + 6, this.teleportTarget.y + 6)
        .lineBetween(this.teleportTarget.x - 6, this.teleportTarget.y + 6, this.teleportTarget.x + 6, this.teleportTarget.y - 6)
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
      const visual = getWeaponVisual(id)
      const palette = resolveWeaponPalette(id, this.preferences.highContrastHud)
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
          selected ? palette.accent : 0xfff4d8,
          selected ? 1 : 0.42,
        )
        .strokeCircle(centerX, weaponCenterY, weaponRadius)
      const iconScale = 0.72 * visual.iconScale * (weaponDiameter / 48)
      drawShapeRecipe(this.hudGraphics, visual.icon, {
        origin: { x: centerX, y: weaponCenterY - 1 },
        scale: iconScale,
        palette,
      })
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
          this.weaponEffects.length +
          this.reflectionEffects.length,
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
        const visual = getWeaponVisual(event.weaponId)
        const policy = this.weaponMotionPolicy(event.weaponId)
        const player = this.source.state.players.find((candidate) => candidate.id === event.playerId)
        const direction = normalizeDirection(event.direction, { x: player?.facing ?? 1, y: 0 })
        state.firedAt = this.visualTime
        state.firedUntil = this.visualTime + Math.max(0.14, policy.recoilDurationMs / 1000)
        state.fireDirection = direction
        state.fireWeapon = event.weaponId
        this.reactions.set(event.playerId, state)
        const effectPosition =
          visual.activationEffect === 'warp' || visual.activationEffect === 'place'
            ? event.origin
            : {
                x: event.origin.x + direction.x * 24,
                y: event.origin.y + direction.y * 24,
              }
        const requestedLifetime =
          visual.activationEffect === 'warp'
            ? 360
            : visual.activationEffect === 'slash' || visual.activationEffect === 'throw'
              ? 260
              : visual.activationEffect === 'place'
                ? 220
                : Math.max(160, policy.recoilDurationMs)
        this.addWeaponEffect(
          visual.activationEffect,
          event.weaponId,
          effectPosition,
          direction,
          requestedLifetime,
          event.sequence,
        )
        this.audio.play(visual.audio.fire)
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
      case 'projectile-reflected': {
        this.reflectionEffects.push({
          position: { ...event.position },
          direction: normalizeDirection(
            {
              x: event.outgoingVelocity.x - event.incomingVelocity.x,
              y: event.outgoingVelocity.y - event.incomingVelocity.y,
            },
            normalizeDirection(event.outgoingVelocity),
          ),
          age: 0,
          lifetime: this.preferences.reducedMotion ? 0.18 : 0.32,
          seed: event.sequence,
        })
        if (this.reflectionEffects.length > MAX_REFLECTION_EFFECTS)
          this.reflectionEffects.splice(
            0,
            this.reflectionEffects.length - MAX_REFLECTION_EFFECTS,
          )
        if (this.visualTime - this.lastReflectionAudioAt > 0.04) {
          this.audio.play('reflector-hit')
          this.lastReflectionAudioAt = this.visualTime
        }
        if (
          this.preferences.cameraShake &&
          !this.preferences.reducedMotion &&
          this.visualTime - this.lastShakeAt > 0.08
        ) {
          this.cameras.main.shake(70, 0.0025)
          this.lastShakeAt = this.visualTime
        }
        return
      }
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
          'bore',
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
          style: 'scatter',
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
          this.audio.play(getWeaponVisual(event.weaponId).audio.impact)
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
        {
          const outcome =
            event.result === 'player' ? 'hit' : event.result === 'terrain' ? 'blocked' : 'miss'
        this.traceEffects.push({
          weaponId: 'pocket-knife',
          style: `knife-${outcome}` as TraceEffect['style'],
          origin: event.origin,
          endpoints: [event.endpoint],
          age: 0,
          lifetime: this.preferences.reducedMotion ? 0.08 : 0.2,
        })
          if (outcome !== 'miss')
            this.audio.play(getWeaponVisual('pocket-knife').meleeOutcomes![outcome].sound)
        return
        }
      case 'player-frozen': {
        const player = this.source.state.players.find(
          (candidate) => candidate.id === event.playerId,
        )
        if (player)
          this.addWeaponEffect(
            'freeze',
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
          .setResolution(this.renderScale)
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
    const motion = getWeaponVisual(weaponId).motion[
      this.preferences.reducedMotion ? 'reduced' : 'standard'
    ]
    return {
      recoilDurationMs: motion.recoilDurationMs,
      recoilDistance: motion.recoilDistance,
      trailSampleCount: motion.trail.sampleCount,
      trailWidth: motion.trail.width,
      pulse: motion.pulse,
      transientDurationMs: (requestedDurationMs) =>
        Number.isFinite(requestedDurationMs)
          ? Math.max(0, requestedDurationMs) * motion.transientDurationScale
          : 0,
    }
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
      style: weaponId ? getWeaponVisual(weaponId).impactStyle : 'warp-arrival',
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
    const style = getWeaponVisual(weaponId).impactStyle
    const shakeIntensity: Partial<Record<ImpactStyle, number>> = {
      'heavy-blast': 0.007,
      'mine-blast': 0.007,
      'siege-blast': 0.011,
      'bounce-blast': 0.006,
      'cluster-burst': 0.002,
      'shoe-thud': 0.003,
      'pierce': 0.0025,
      'freeze-burst': 0.003,
    }
    if (
      this.preferences.cameraShake &&
      !this.preferences.reducedMotion &&
      (style !== 'cluster-burst' || this.visualTime - this.lastShakeAt > 0.14)
    )
      this.cameras.main.shake(110, shakeIntensity[style] ?? 0.0045)
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
    for (const effect of this.reflectionEffects) {
      const progress = Phaser.Math.Clamp(effect.age / effect.lifetime, 0, 1)
      const alpha = 1 - progress
      const forward = effect.direction
      const across = perpendicular(forward)
      const flashRadius = this.preferences.reducedMotion ? 8 : 6 + progress * 3
      this.overlayGraphics
        .fillStyle(0xfff4bc, alpha * 0.9)
        .fillCircle(effect.position.x, effect.position.y, flashRadius)
        .lineStyle(2.5, 0x26373d, alpha)
        .strokeCircle(effect.position.x, effect.position.y, flashRadius)
        .lineStyle(2, 0xffffff, alpha)
        .lineBetween(
          effect.position.x - across.x * 10,
          effect.position.y - across.y * 10,
          effect.position.x + across.x * 10,
          effect.position.y + across.y * 10,
        )
      if (this.preferences.reducedMotion) continue
      for (let spark = 0; spark < 6; spark += 1) {
        const spread = (spark - 2.5) * 0.28
        const direction = normalizeDirection({
          x: forward.x + across.x * spread,
          y: forward.y + across.y * spread,
        })
        const startDistance = 4 + ((effect.seed + spark) % 4)
        const endDistance = startDistance + 5 + progress * (12 + (spark % 3) * 3)
        this.overlayGraphics
          .lineStyle(spark % 2 ? 2 : 3, spark % 2 ? 0xffb43f : 0xfff2ad, alpha)
          .lineBetween(
            effect.position.x + direction.x * startDistance,
            effect.position.y + direction.y * startDistance,
            effect.position.x + direction.x * endDistance,
            effect.position.y + direction.y * endDistance,
          )
      }
    }
    for (const effect of this.weaponEffects) {
      const progress = Phaser.Math.Clamp(effect.age / effect.lifetime, 0, 1)
      const alpha = 1 - progress
      const visual = getWeaponVisual(effect.weaponId)
      const palette = resolveWeaponPalette(effect.weaponId, this.preferences.highContrastHud)
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

      if (effect.kind === 'warp' || effect.kind === 'place') {
        const ringProgress = policy.pulse ? progress : Math.min(progress, 0.35)
        this.overlayGraphics
          .lineStyle(3, palette.accent, alpha)
          .strokeCircle(
            effect.position.x,
            effect.position.y,
            (effect.kind === 'place' ? 5 : 8) + ringProgress * 22,
          )
          .lineStyle(2, palette.flash, alpha * 0.8)
          .strokeCircle(effect.position.x, effect.position.y, 3 + ringProgress * 14)
        if (effect.kind === 'place')
          this.overlayGraphics
            .lineStyle(2, palette.ink, alpha)
            .strokeRect(effect.position.x - 8, effect.position.y - 3, 16, 6)
        continue
      }

      if (effect.kind === 'slash') {
        const radius = 18 + (policy.pulse ? progress * 9 : 0)
        let previous: Vector | null = null
        this.overlayGraphics.lineStyle(4, palette.flash, alpha)
        for (let step = 0; step <= 8; step += 1) {
          const angle = -0.75 + (step / 8) * 1.5
          const direction = {
            x: forward.x * Math.cos(angle) - forward.y * Math.sin(angle),
            y: forward.x * Math.sin(angle) + forward.y * Math.cos(angle),
          }
          const current = {
            x: effect.position.x + direction.x * radius,
            y: effect.position.y + direction.y * radius,
          }
          if (previous)
            this.overlayGraphics.lineBetween(previous.x, previous.y, current.x, current.y)
          previous = current
        }
        continue
      }

      if (effect.kind === 'throw') {
        for (const offset of [-6, 0, 6]) {
          const start = point(-8, offset)
          const end = point(14 + progress * 8, offset * 0.35)
          this.overlayGraphics
            .lineStyle(offset === 0 ? 3 : 2, offset === 0 ? palette.flash : palette.accent, alpha)
            .lineBetween(start.x, start.y, end.x, end.y)
        }
        continue
      }

      if (effect.kind === 'muzzle') {
        const length = visual.transitionStyle === 'scatter' ? 18 : visual.transitionStyle === 'split' ? 14 : 12
        const width = visual.transitionStyle === 'scatter' ? 12 : 7
        const tip = point(length * (1 - progress * 0.35), 0)
        const upper = point(1, -width * (1 - progress * 0.45))
        const lower = point(1, width * (1 - progress * 0.45))
        this.overlayGraphics
          .fillStyle(palette.flash, alpha)
          .fillTriangle(upper.x, upper.y, lower.x, lower.y, tip.x, tip.y)
          .lineStyle(2, palette.accent, alpha)
          .lineBetween(upper.x, upper.y, tip.x, tip.y)
          .lineBetween(lower.x, lower.y, tip.x, tip.y)
        if (visual.transitionStyle === 'split') {
          for (const offset of [-7, 0, 7]) {
            const spark = point(7 + progress * 8, offset)
            this.overlayGraphics
              .fillStyle(palette.accent, alpha)
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
            .lineStyle(2, spark % 2 ? palette.accent : palette.flash, alpha)
            .lineBetween(effect.position.x, effect.position.y, endpoint.x, endpoint.y)
        }
        continue
      }

      if (effect.kind === 'bore') {
        for (let chip = -3; chip <= 3; chip += 1) {
          const start = point(-2, chip * 2.5)
          const end = point(-12 - progress * (8 + Math.abs(chip) * 2), chip * 5)
          this.overlayGraphics
            .lineStyle(chip % 2 ? 2 : 3, chip % 2 ? palette.accent : palette.impact, alpha)
            .lineBetween(start.x, start.y, end.x, end.y)
        }
        continue
      }

      if (effect.kind === 'freeze') {
        const radius = policy.pulse ? 8 + progress * 20 : 12
        for (let spoke = 0; spoke < 6; spoke += 1) {
          const angle = (spoke / 6) * Math.PI * 2
          this.overlayGraphics
            .lineStyle(3, spoke % 2 ? palette.flash : palette.accent, alpha)
            .lineBetween(
              effect.position.x,
              effect.position.y,
              effect.position.x + Math.cos(angle) * radius,
              effect.position.y + Math.sin(angle) * radius,
            )
        }
        continue
      }

      const spokeDistance = policy.pulse ? 8 + progress * 22 : 12
      for (let spoke = 0; spoke < 10; spoke += 1) {
        const angle = effect.seed * 0.13 + (spoke / 10) * Math.PI * 2
        const inner = spokeDistance * 0.35
        this.overlayGraphics
          .lineStyle(
            spoke % 2 ? 2 : 3,
            spoke % 2 ? palette.accent : palette.impact,
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
      const palette = resolveWeaponPalette(
        effect.weaponId ?? 'teleporter',
        this.preferences.highContrastHud,
      )
      const color = palette.impact
      const alpha = 1 - progress
      if (effect.style === 'shoe-thud') {
        const width = effect.radius * (0.45 + progress * 0.45)
        this.overlayGraphics
          .fillStyle(palette.primary, alpha * 0.32)
          .fillEllipse(effect.position.x, effect.position.y + 4, width * 1.8, width * 0.55)
          .lineStyle(3, palette.impact, alpha)
          .lineBetween(effect.position.x - width, effect.position.y, effect.position.x - width * 1.35, effect.position.y - 8)
          .lineBetween(effect.position.x + width, effect.position.y, effect.position.x + width * 1.35, effect.position.y - 8)
          .lineStyle(2, palette.accent, alpha)
          .lineBetween(effect.position.x - 7, effect.position.y - 8, effect.position.x + 7, effect.position.y + 8)
        continue
      }
      if (effect.style === 'freeze-burst') {
        const radius = effect.radius * (0.35 + progress * 0.7)
        for (let shard = 0; shard < 8; shard += 1) {
          const angle = effect.seed * 0.11 + (shard / 8) * Math.PI * 2
          this.overlayGraphics
            .lineStyle(shard % 2 ? 2 : 4, shard % 2 ? palette.accent : palette.flash, alpha)
            .lineBetween(
              effect.position.x + Math.cos(angle) * radius * 0.2,
              effect.position.y + Math.sin(angle) * radius * 0.2,
              effect.position.x + Math.cos(angle) * radius,
              effect.position.y + Math.sin(angle) * radius,
            )
        }
        continue
      }
      if (effect.style === 'pierce') {
        const radius = effect.radius * (0.3 + progress * 0.55)
        this.overlayGraphics
          .lineStyle(3, palette.flash, alpha)
          .lineBetween(effect.position.x - radius, effect.position.y, effect.position.x + radius, effect.position.y)
          .lineStyle(2, palette.accent, alpha)
          .lineBetween(effect.position.x, effect.position.y - radius * 0.55, effect.position.x, effect.position.y + radius * 0.55)
        continue
      }
      if (effect.style === 'cluster-burst')
        for (const offset of [-0.42, 0, 0.42])
          this.overlayGraphics
            .lineStyle(2.5, palette.accent, alpha)
            .strokeCircle(
              effect.position.x + offset * effect.radius,
              effect.position.y - Math.abs(offset) * effect.radius * 0.35,
              effect.radius * (0.12 + progress * 0.28),
            )
      if (effect.style === 'drill-burst')
        for (let tooth = 0; tooth < 7; tooth += 1) {
          const angle = effect.seed * 0.17 + (tooth / 7) * Math.PI * 2
          this.overlayGraphics
            .lineStyle(tooth % 2 ? 2 : 3, palette.accent, alpha)
            .lineBetween(
              effect.position.x + Math.cos(angle) * effect.radius * 0.18,
              effect.position.y + Math.sin(angle) * effect.radius * 0.18,
              effect.position.x + Math.cos(angle) * effect.radius * (0.45 + progress * 0.5),
              effect.position.y + Math.sin(angle) * effect.radius * (0.45 + progress * 0.5),
            )
        }
      if (effect.style === 'mine-blast') {
        const groundWidth = effect.radius * (0.35 + progress * 0.55)
        this.overlayGraphics
          .lineStyle(4, palette.impact, alpha)
          .lineBetween(effect.position.x - groundWidth, effect.position.y + 4, effect.position.x + groundWidth, effect.position.y + 4)
          .lineStyle(2.5, palette.flash, alpha)
        for (const offset of [-0.7, -0.35, 0, 0.35, 0.7])
          this.overlayGraphics.lineBetween(
            effect.position.x + offset * groundWidth * 0.45,
            effect.position.y + 3,
            effect.position.x + offset * groundWidth,
            effect.position.y - effect.radius * (0.3 + (1 - Math.abs(offset)) * 0.4),
          )
      }
      if (effect.style === 'beacon-strike')
        for (const offset of [-8, 0, 8])
          this.overlayGraphics
            .lineStyle(offset === 0 ? 4 : 2, palette.flash, alpha)
            .lineBetween(
              effect.position.x + offset,
              effect.position.y - effect.radius * (0.8 + progress),
              effect.position.x + offset * 0.3,
              effect.position.y + effect.radius * 0.18,
            )
      if (effect.style === 'fork-burst') {
        const forkOffset = effect.radius * 0.22
        this.overlayGraphics
          .lineStyle(3, palette.accent, alpha)
          .strokeCircle(effect.position.x - forkOffset, effect.position.y, effect.radius * (0.2 + progress * 0.45))
          .strokeCircle(effect.position.x + forkOffset, effect.position.y, effect.radius * (0.2 + progress * 0.45))
      }
      if (effect.style === 'siege-blast')
        this.overlayGraphics
          .lineStyle(6 - progress * 2, palette.ink, alpha * 0.8)
          .strokeCircle(effect.position.x, effect.position.y, effect.radius * (0.35 + progress * 1.05))
      const size = effect.radius * (0.25 + progress * 0.9)
      this.overlayGraphics
        .lineStyle(4 - progress * 2, color, 1 - progress)
        .strokeCircle(effect.position.x, effect.position.y, size)
      if (progress < 0.3)
        this.overlayGraphics
          .fillStyle(palette.flash, 1 - progress / 0.3)
          .fillCircle(effect.position.x, effect.position.y, effect.radius * (0.45 - progress * 0.6))
      if (!this.preferences.reducedMotion && effect.kind === 'explosion') {
        const fragments =
          effect.style === 'cluster-burst'
            ? 3
            : effect.style === 'siege-blast' || effect.style === 'heavy-blast'
              ? 9
              : effect.style === 'drill-burst'
                ? 7
                : 6
        for (let index = 0; index < fragments; index += 1) {
          const angle = effect.seed * 0.73 + index * 2.4
          const distance = progress * effect.radius * 0.85
          this.overlayGraphics
            .fillStyle(
              index % 2 ? palette.impact : palette.accent,
              1 - progress,
            )
            .fillCircle(
              effect.position.x + Math.cos(angle) * distance,
              effect.position.y + Math.sin(angle) * distance - progress * 12,
              2.5,
            )
        }
        const smokeCount =
          effect.style === 'bounce-blast'
            ? 4
            : effect.style === 'cluster-burst'
              ? 1
              : effect.style === 'siege-blast' || effect.style === 'heavy-blast'
                ? 5
                : 3
        const dustColor = getMap(this.source.state.mapId).theme.dust
        for (let puff = 0; puff < smokeCount; puff += 1) {
          const angle = effect.seed * 0.31 + puff * 2.2
          this.overlayGraphics
            .fillStyle(dustColor, Math.max(0, 0.5 - progress * 0.5))
            .fillCircle(
              effect.position.x + Math.cos(angle) * effect.radius * progress * 0.45,
              effect.position.y - progress * (18 + puff * 4),
              5 + progress * (effect.style === 'bounce-blast' ? 13 : 9),
            )
        }
      }
    }
    for (const trace of this.traceEffects) {
      const alpha = 1 - trace.age / trace.lifetime
      const palette = resolveWeaponPalette(trace.weaponId, this.preferences.highContrastHud)
      if (trace.style === 'scatter') {
        this.overlayGraphics.lineStyle(2, palette.flash, alpha)
        for (const endpoint of trace.endpoints)
          this.overlayGraphics.lineBetween(trace.origin.x, trace.origin.y, endpoint.x, endpoint.y)
        for (const endpoint of trace.endpoints)
          this.overlayGraphics.fillStyle(palette.impact, alpha).fillCircle(endpoint.x, endpoint.y, 2.5)
        continue
      }
      const endpoint = trace.endpoints[0]
      if (!endpoint) continue
      const direction = normalizeDirection({
        x: endpoint.x - trace.origin.x,
        y: endpoint.y - trace.origin.y,
      })
      const across = perpendicular(direction)
      let previous = trace.origin
      this.overlayGraphics.lineStyle(
        trace.style === 'knife-hit' ? 4 : 3,
        trace.style === 'knife-blocked' ? palette.blocked : trace.style === 'knife-miss' ? palette.miss : palette.flash,
        alpha,
      )
      for (let step = 1; step <= 8; step += 1) {
        const t = step / 8
        const bend = Math.sin(t * Math.PI) * 10
        const point = {
          x: trace.origin.x + (endpoint.x - trace.origin.x) * t + across.x * bend,
          y: trace.origin.y + (endpoint.y - trace.origin.y) * t + across.y * bend,
        }
        this.overlayGraphics.lineBetween(previous.x, previous.y, point.x, point.y)
        previous = point
      }
      if (trace.style === 'knife-hit')
        this.overlayGraphics.fillStyle(palette.impact, alpha).fillCircle(endpoint.x, endpoint.y, 4)
      else if (trace.style === 'knife-blocked')
        this.overlayGraphics
          .lineStyle(3, palette.blocked, alpha)
          .lineBetween(endpoint.x - 5, endpoint.y - 5, endpoint.x + 5, endpoint.y + 5)
          .lineBetween(endpoint.x - 5, endpoint.y + 5, endpoint.x + 5, endpoint.y - 5)
      else this.overlayGraphics.lineStyle(2, palette.miss, alpha).strokeCircle(endpoint.x, endpoint.y, 3)
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
