import Phaser from 'phaser'
import { MatchScene } from './scenes/MatchScene'
import { GAME_HEIGHT, GAME_WIDTH } from '../shared/constants'
import type { GameEvents } from './types'
import type { MatchSource } from './matchSource'
import { once } from '../shared/once'

export type GameHost = {
  destroy: () => void
  pause: () => void
  resume: () => void
  restart: () => void
}

export function createGame(
  parent: HTMLElement,
  source: MatchSource,
  events: GameEvents,
  reducedMotion = false,
  aimGuide: 'normal' | 'minimal' = 'normal',
): GameHost {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#10172a',
    scene: [],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
  })
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add('match', MatchScene, false)
    game.scene.start('match', { source, events, reducedMotion, aimGuide })
  })
  const scene = () => game.scene.getScene('match') as MatchScene
  const destroy = once(() => {
    game.destroy(true)
    if (!source.online) source.dispose()
  })
  return {
    destroy,
    pause: () => scene().setPaused(true),
    resume: () => scene().setPaused(false),
    restart: () => scene().restartMatch(),
  }
}
