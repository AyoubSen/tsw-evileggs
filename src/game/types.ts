import type { SimulationMatchResult } from '../simulation/match/MatchEvent'

export type MatchResult = SimulationMatchResult

export type GameEvents = {
  onPauseRequest: () => void
  onResult: (result: MatchResult) => void
}
