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
  goals: ProgressionGoal[]
}

export type ProgressionGoal = {
  id: string
  title: string
  description: string
  metric: 'matchesPlayed' | 'wins'
  progress: number
  target: number
  completed: boolean
  reward: { experience: number; currency: number; cosmeticId?: string }
}

export const PROGRESSION_GOALS: readonly Omit<ProgressionGoal, 'progress' | 'completed'>[] = [
  { id: 'first-sortie', title: 'First Sortie', description: 'Complete an online match.', metric: 'matchesPlayed', target: 1, reward: { experience: 100, currency: 25 } },
  { id: 'first-victory', title: 'Crack the Shell', description: 'Win an online match.', metric: 'wins', target: 1, reward: { experience: 150, currency: 0, cosmeticId: 'weapon-skin:scrapyard' } },
  { id: 'regular-customer', title: 'Regular Customer', description: 'Complete 10 online matches.', metric: 'matchesPlayed', target: 10, reward: { experience: 300, currency: 75 } },
  { id: 'ace-gunner', title: 'Ace Gunner', description: 'Win 5 online matches.', metric: 'wins', target: 5, reward: { experience: 400, currency: 0, cosmeticId: 'weapon-skin:royal-icing' } },
]

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
