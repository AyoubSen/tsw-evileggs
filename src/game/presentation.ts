import type { MatchEvent } from '../simulation/match/MatchEvent'
import type { CosmeticLoadout } from '../cosmetics/cosmeticLoadout'

export type PresentationPreferences = {
  reducedMotion: boolean
  highContrastHud: boolean
  cameraShake: boolean
  cameraMode: 'fit' | 'follow'
  aimGuide: 'normal' | 'minimal'
  screenFlash: 'normal' | 'reduced' | 'off'
  cosmeticLoadout: CosmeticLoadout
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
