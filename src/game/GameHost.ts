import Phaser from 'phaser'
import { MatchScene } from './scenes/MatchScene'
import type { GameEvents } from './types'
import type { MatchSource } from './matchSource'
import { once } from '../shared/once'
import type { AudioDirector } from '../audio/AudioDirector'
import type { PresentationPreferences } from './presentation'
import { backingSize, renderScaleForElement } from './renderQuality'

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
  let renderScale = renderScaleForElement(parent)
  let dimensions = backingSize(renderScale)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor: '#10172a',
    scene: [],
    scale: {
      width: dimensions.width,
      height: dimensions.height,
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: { antialias: true, pixelArt: false },
  })
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.add('match', MatchScene, false)
    game.scene.start('match', { source, events, preferences, audio, renderScale })
  })
  const scene = () => game.scene.getScene('match') as MatchScene
  let resizeFrame = 0
  const syncRenderScale = () => {
    resizeFrame = 0
    const nextScale = renderScaleForElement(parent)
    if (nextScale === renderScale) return
    renderScale = nextScale
    dimensions = backingSize(renderScale)
    if (game.scene.isActive('match')) scene().setRenderScale(renderScale)
    game.scale.setGameSize(dimensions.width, dimensions.height)
  }
  const scheduleRenderScaleSync = () => {
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(syncRenderScale)
  }
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRenderScaleSync)
  resizeObserver?.observe(parent)
  window.addEventListener('resize', scheduleRenderScaleSync)
  const destroy = once(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeObserver?.disconnect()
    window.removeEventListener('resize', scheduleRenderScaleSync)
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
