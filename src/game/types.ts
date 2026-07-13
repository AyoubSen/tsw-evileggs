import type { LocalMatchConfig } from '../match/config'

export type MatchResult = {
  config: LocalMatchConfig
  winnerIndex: number | null
  remainingHealth: number
  turnsTaken: number
  durationSeconds: number
}

export type GameEvents = {
  onPauseRequest: () => void
  onResult: (result: MatchResult) => void
}
