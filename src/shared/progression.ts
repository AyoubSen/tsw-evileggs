import type { MapId, MatchMode, TeamId } from '../maps/registry'

export type MatchOutcome = 'win' | 'loss' | 'draw'
export type ProgressionSummary = {
  level: number
  experience: number
  levelExperience: number
  nextLevelExperience: number
  currencyBalance: number
  matchesPlayed: number
  wins: number
  losses: number
  draws: number
}
export type RecentProgressionMatch = {
  id: string
  completedAt: string
  mode: MatchMode
  mapId: MapId
  outcome: MatchOutcome
  reason: 'normal' | 'forfeit'
  turnsTaken: number
  durationSeconds: number
  experienceEarned: number
  currencyEarned: number
}
export type ProgressionOverview = {
  summary: ProgressionSummary
  recentMatches: RecentProgressionMatch[]
  entitlements: string[]
}

export type ProgressionReward = { experience: number; currency: number; outcome: MatchOutcome }

export function progressionReward(input: {
  winnerTeamId: TeamId | null
  teamId: TeamId
  isDraw: boolean
  reason: 'normal' | 'forfeit'
}): ProgressionReward {
  if (input.isDraw) return { experience: 120, currency: 12, outcome: 'draw' }
  if (input.winnerTeamId === input.teamId)
    return { experience: 140, currency: 15, outcome: 'win' }
  return input.reason === 'forfeit'
    ? { experience: 50, currency: 0, outcome: 'loss' }
    : { experience: 100, currency: 10, outcome: 'loss' }
}

export function progressionLevel(experience: number): Pick<ProgressionSummary, 'level' | 'levelExperience' | 'nextLevelExperience'> {
  const safe = Math.max(0, Math.floor(experience))
  return { level: Math.floor(safe / 500) + 1, levelExperience: safe % 500, nextLevelExperience: 500 }
}
