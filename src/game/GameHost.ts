import Phaser from 'phaser'
import { MatchScene } from './scenes/MatchScene'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/constants'

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#10172a',
    scene: [MatchScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
  })
}
