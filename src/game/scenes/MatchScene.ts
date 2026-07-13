import Phaser from 'phaser'
import type { MatchCommandInput } from '../../simulation/match/MatchCommand'
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

export class MatchScene extends Phaser.Scene {
  private source!: MatchSource
  private eventsFromHost: GameEvents | null = null
  private reducedMotion = false
  private aimGuide: 'normal' | 'minimal' = 'normal'
  private backgroundGraphics!: Phaser.GameObjects.Graphics
  private terrainGraphics!: Phaser.GameObjects.Graphics
  private actorGraphics!: Phaser.GameObjects.Graphics
  private overlayGraphics!: Phaser.GameObjects.Graphics
  private hudGraphics!: Phaser.GameObjects.Graphics
  private leftHud!: Phaser.GameObjects.Text
  private rightHud!: Phaser.GameObjects.Text
  private bottomHud!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
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

  constructor() {
    super('match')
  }

  init(data: {
    source: MatchSource
    events?: GameEvents
    reducedMotion?: boolean
    aimGuide?: 'normal' | 'minimal'
  }): void {
    this.source = data.source
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
  }

  update(_: number, deltaMilliseconds: number): void {
    const delta = Math.min(deltaMilliseconds / 1000, 0.25)
    this.visualTime += delta
    if (this.introDuration > 0) this.introDuration = Math.max(0, this.introDuration - delta)
    else this.source.update(delta)
    this.turnBannerDuration = Math.max(0, this.turnBannerDuration - delta)
    for (const event of this.source.drainEvents()) {
      if (event.type === 'turn-started') {
        this.turnBannerDuration = this.reducedMotion ? 0 : 0.75
        this.shotAim = this.defaultAim()
        this.teleportTarget = null
      }
      if (event.type === 'match-ended') this.eventsFromHost?.onResult(event.result)
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

  private resetPresentation(): void {
    this.pressedCodes.clear()
    this.clearDrag()
    this.teleportTarget = null
    this.shotAim = this.defaultAim()
    this.introDuration = this.reducedMotion ? 0 : 1.8
    this.turnBannerDuration = 0
    this.render()
  }

  private send(command: MatchCommandInput): void {
    void this.source.sendCommand(command)
  }

  private canInput(): boolean {
    return (
      this.introDuration <= 0 &&
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
    if (this.introDuration > 0 && ['Enter', 'Space'].includes(event.code)) {
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
      if (!player.alive) return
      const facing = index === 0 ? 1 : -1
      const bob = player.grounded ? Math.sin(this.visualTime * 3 + index) * 1.5 : 0
      const { x } = player.position
      const y = player.position.y + bob
      this.actorGraphics.fillStyle(0x473b31, 0.85).fillEllipse(x + 3, y + player.radius + 8, 32, 9)
      this.actorGraphics
        .fillStyle(index === 0 ? 0x2863b7 : 0xed7090)
        .fillRoundedRect(x - 17, y - 13, 34, 31, 12)
      this.actorGraphics.fillStyle(0xfff6d8).fillEllipse(x + facing * 3, y - 3, 22, 15)
      this.actorGraphics
        .fillStyle(0x24313a)
        .fillCircle(x + facing * 7, y - 4, 2.8)
        .fillCircle(x + facing, y - 4, 2.8)
      this.actorGraphics
        .lineStyle(2, 0x24313a)
        .lineBetween(x + facing * 2, y + 5, x + facing * 8, y + 5)
      this.actorGraphics
        .fillStyle(index === 0 ? 0xf7bd3f : 0xed7090)
        .fillTriangle(x - 13 * facing, y - 13, x - 4 * facing, y - 25, x - 3 * facing, y - 11)
      if (this.source.state.phase === 'input' && index === this.source.state.activePlayerIndex)
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
        this.renderAimGuide(this.projectileOrigin(aim.direction), aim.direction, aim.power)
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
    const steps = this.aimGuide === 'minimal' ? 3 : AIM_GUIDE_STEPS
    for (let step = 0; step < steps; step += 1) {
      projectile = integrateProjectile(
        projectile,
        GRAVITY * this.selectedWeapon().gravityScale,
        FIXED_STEP_SECONDS,
      )
      this.overlayGraphics.fillCircle(projectile.position.x, projectile.position.y, 2)
    }
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
      .fillStyle(0x5bbf72)
      .fillRoundedRect(32, 40, 150 * (left.health / 100), 6, 3)
      .fillRoundedRect(GAME_WIDTH - 182, 40, 150 * (right.health / 100), 6, 3)
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
    this.timerText.setText(`${Math.ceil(this.source.timerRemainingSeconds)}s`)
    const weapons = WEAPON_ORDER.map((id, index) => {
      const ammo = this.source.activePlayer.inventory[id]
      return `${this.source.activePlayer.selectedWeapon === id ? '◆' : '◇'} ${index + 1} ${ammo === 'unlimited' ? '∞' : ammo}`
    }).join('    ')
    const hint =
      this.selectedWeapon().aimMode === 'target-position'
        ? 'Point at safe ground · Space to warp'
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
      this.bannerText.setText(`${this.source.activePlayer.name}'s Turn`).setVisible(true)
    else this.bannerText.setVisible(false)
  }
}
