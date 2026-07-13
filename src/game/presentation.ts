import type { MatchEvent } from '../simulation/match/MatchEvent'

export type PresentationPreferences = {
  reducedMotion: boolean
  highContrastHud: boolean
  cameraShake: boolean
  aimGuide: 'normal' | 'minimal'
  screenFlash: 'normal' | 'reduced' | 'off'
}

export class EventSequenceGuard {
  private lastSequence = 0

  consume(event: MatchEvent): boolean {
    if (event.sequence <= this.lastSequence) return false
    this.lastSequence = event.sequence
    return true
  }

  reset(lastConsumedSequence = 0): void {
    this.lastSequence = lastConsumedSequence
  }

  get latest(): number {
    return this.lastSequence
  }
}
