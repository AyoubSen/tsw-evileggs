import Phaser from 'phaser'
import { MAP_ORDER, MAPS, type MapId } from '../../maps/registry'
import { GAME_HEIGHT, GAME_WIDTH } from '../../shared/constants'

export class MapSelectScene extends Phaser.Scene {
  private selected = 0
  private text!: Phaser.GameObjects.Text
  private graphics!: Phaser.GameObjects.Graphics
  constructor() {
    super('map-select')
  }
  create(): void {
    this.text = this.add.text(54, 44, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#eaf5ff',
      lineSpacing: 8,
    })
    this.graphics = this.add.graphics()
    this.input.keyboard!.on('keydown-LEFT', () => this.change(-1))
    this.input.keyboard!.on('keydown-A', () => this.change(-1))
    this.input.keyboard!.on('keydown-RIGHT', () => this.change(1))
    this.input.keyboard!.on('keydown-D', () => this.change(1))
    this.input.keyboard!.on('keydown-SPACE', () => this.startMatch())
    this.input.keyboard!.on('keydown-ENTER', () => this.startMatch())
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const index = Math.floor((pointer.y - 118) / 28)
      if (index >= 0 && index < MAP_ORDER.length) {
        this.selected = index
        this.startMatch()
      }
    })
    this.render()
  }
  private change(delta: number): void {
    this.selected = (this.selected + delta + MAP_ORDER.length) % MAP_ORDER.length
    this.render()
  }
  private startMatch(): void {
    this.scene.start('match', { mapId: MAP_ORDER[this.selected] })
  }
  private render(): void {
    const id = MAP_ORDER[this.selected] as MapId
    const map = MAPS[id]
    this.text.setText(
      `PROJECT SHELLSHOCK\n\nCHOOSE A BATTLEFIELD\n\n${MAP_ORDER.map((mapId, index) => `${index === this.selected ? '> ' : '  '}${MAPS[mapId].displayName}`).join('\n')}\n\n${map.description}\n\n[Left/Right or A/D] choose   [Enter/Space] start`,
    )
    this.cameras.main.setBackgroundColor('#10172a')
    this.graphics
      .clear()
      .fillStyle(0x315f47, 0.35)
      .fillRect(0, GAME_HEIGHT - 80, GAME_WIDTH, 80)
  }
}
