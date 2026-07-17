import { describe, expect, it } from 'vitest'
import { rewardForMatch } from './progressionRepository'
import { progressionLevel } from '../../src/shared/progression'

describe('progression rewards', () => {
  it('awards participation, win, draw, and reduced forfeit-loss rewards', () => {
    expect(rewardForMatch({ winnerTeamId: 0, teamId: 0, isDraw: false, reason: 'normal' })).toEqual({ experience: 140, currency: 15, outcome: 'win' })
    expect(rewardForMatch({ winnerTeamId: 0, teamId: 1, isDraw: false, reason: 'normal' })).toEqual({ experience: 100, currency: 10, outcome: 'loss' })
    expect(rewardForMatch({ winnerTeamId: null, teamId: 1, isDraw: true, reason: 'normal' })).toEqual({ experience: 120, currency: 12, outcome: 'draw' })
    expect(rewardForMatch({ winnerTeamId: 0, teamId: 1, isDraw: false, reason: 'forfeit' })).toEqual({ experience: 50, currency: 0, outcome: 'loss' })
  })

  it('derives stable 500 XP levels', () => {
    expect(progressionLevel(0)).toEqual({ level: 1, levelExperience: 0, nextLevelExperience: 500 })
    expect(progressionLevel(650)).toEqual({ level: 2, levelExperience: 150, nextLevelExperience: 500 })
  })
})
