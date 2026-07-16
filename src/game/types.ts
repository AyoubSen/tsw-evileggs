import type { SimulationMatchResult } from '../simulation/match/MatchEvent'
import type { PresentationPreferences } from './presentation'

export type MatchResult = SimulationMatchResult

export type GameEvents = {
  onPauseRequest: () => void
  onResult: (result: MatchResult) => void
  onCameraModeChange?: (mode: PresentationPreferences['cameraMode']) => void
}
