import Phaser from 'phaser'
import { MatchScene } from './scenes/MatchScene'
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../shared/constants'
import type { GameEvents } from './types'
import type { MatchSource } from './matchSource'
import { once } from '../shared/once'
import type { AudioDirector } from '../audio/AudioDirector'
import type { PresentationPreferences } from './presentation'

export type GameHost = {
  destroy: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  setPresentationPreferences: (preferences: PresentationPreferences) => void
}

export function createGame(
  parent: HTMLElement,
  source: MatchSource,
  events: GameEvents,
  preferences: PresentationPreferences,
  audio: AudioDirector,
): GameHost {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    backgroundColor: '#10172a',
    scene: [],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
  })
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add('match', MatchScene, false)
    game.scene.start('match', { source, events, preferences, audio })
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
    setPresentationPreferences: (next) => scene().setPresentationPreferences(next),
  }
}
