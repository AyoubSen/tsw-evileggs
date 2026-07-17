import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { PURCHASABLE_COSMETICS } from '../../src/cosmetics/cosmeticLoadout'
import { sanitizeAccountPreferences } from '../../src/shared/account'
import { PROGRESSION_GOALS, progressionLevel, progressionReward, type MatchOutcome, type ProgressionOverview } from '../../src/shared/progression'
import type { MapId, MatchMode, TeamId } from '../../src/maps/registry'
import type { AccountDatabase } from '../db/client'
import { cosmeticEntitlements, currencyLedger, matchParticipants, onlineMatches, profiles, progressionProfiles } from '../db/schema'

export type ProgressionParticipant = { seat: number; teamId: TeamId; clerkUserId: string | null }
export type CompletedOnlineMatch = {
  id: string
  mode: MatchMode
  mapId: MapId
  reason: 'normal' | 'forfeit'
  winnerTeamId: TeamId | null
  isDraw: boolean
  turnsTaken: number
  durationSeconds: number
  participants: readonly ProgressionParticipant[]
}
export type MatchReward = { experience: number; currency: number; outcome: MatchOutcome }

export function rewardForMatch(input: { winnerTeamId: TeamId | null; teamId: TeamId; isDraw: boolean; reason: 'normal' | 'forfeit' }): MatchReward {
  return progressionReward(input)
}

export interface ProgressionRepository {
  recordCompletedMatch(match: CompletedOnlineMatch): Promise<boolean>
  getOverview(clerkUserId: string, recentLimit?: number): Promise<ProgressionOverview>
  purchaseCosmetic(clerkUserId: string, cosmeticId: string): Promise<'purchased' | 'owned' | 'insufficient-funds' | 'not-found'>
}

export class DrizzleProgressionRepository implements ProgressionRepository {
  constructor(private readonly db: AccountDatabase) {}

  async recordCompletedMatch(match: CompletedOnlineMatch): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const claimed = await tx.insert(onlineMatches).values({
        id: match.id, mode: match.mode, mapId: match.mapId, reason: match.reason,
        winnerTeamId: match.winnerTeamId, isDraw: match.isDraw,
        turnsTaken: match.turnsTaken, durationSeconds: match.durationSeconds,
      }).onConflictDoNothing().returning({ id: onlineMatches.id })
      if (!claimed.length) return false
      for (const participant of match.participants) {
        if (!participant.clerkUserId) continue
        await tx.insert(profiles).values({ clerkUserId: participant.clerkUserId, preferences: sanitizeAccountPreferences(undefined) }).onConflictDoNothing()
        const [profile] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.clerkUserId, participant.clerkUserId)).limit(1)
        if (!profile) throw new Error('Progression profile could not be resolved.')
        const reward = rewardForMatch({ winnerTeamId: match.winnerTeamId, teamId: participant.teamId, isDraw: match.isDraw, reason: match.reason })
        await tx.insert(progressionProfiles).values({ profileId: profile.id }).onConflictDoNothing()
        await tx.insert(matchParticipants).values({
          matchId: match.id, profileId: profile.id, seat: participant.seat, teamId: participant.teamId,
          outcome: reward.outcome, experienceEarned: reward.experience, currencyEarned: reward.currency,
        })
        await tx.insert(currencyLedger).values({
          profileId: profile.id, amount: reward.currency, reason: 'match-reward', referenceId: match.id,
        }).onConflictDoNothing()
        const [updated] = await tx.update(progressionProfiles).set({
          experience: sql`${progressionProfiles.experience} + ${reward.experience}`,
          currencyBalance: sql`${progressionProfiles.currencyBalance} + ${reward.currency}`,
          matchesPlayed: sql`${progressionProfiles.matchesPlayed} + 1`,
          wins: sql`${progressionProfiles.wins} + ${reward.outcome === 'win' ? 1 : 0}`,
          losses: sql`${progressionProfiles.losses} + ${reward.outcome === 'loss' ? 1 : 0}`,
          draws: sql`${progressionProfiles.draws} + ${reward.outcome === 'draw' ? 1 : 0}`,
          updatedAt: new Date(),
        }).where(eq(progressionProfiles.profileId, profile.id)).returning({ matchesPlayed: progressionProfiles.matchesPlayed, wins: progressionProfiles.wins })
        if (!updated) throw new Error('Progression could not be updated.')
        for (const goal of PROGRESSION_GOALS) {
          if (updated[goal.metric] < goal.target) continue
          const claimedGoal = await tx.insert(currencyLedger).values({
            profileId: profile.id, amount: goal.reward.currency, reason: 'goal-reward', referenceId: goal.id,
          }).onConflictDoNothing().returning({ id: currencyLedger.id })
          if (!claimedGoal.length) continue
          await tx.update(progressionProfiles).set({
            experience: sql`${progressionProfiles.experience} + ${goal.reward.experience}`,
            currencyBalance: sql`${progressionProfiles.currencyBalance} + ${goal.reward.currency}`,
            updatedAt: new Date(),
          }).where(eq(progressionProfiles.profileId, profile.id))
          if (goal.reward.cosmeticId) await tx.insert(cosmeticEntitlements).values({
            profileId: profile.id, cosmeticId: goal.reward.cosmeticId, source: `goal:${goal.id}`,
          }).onConflictDoNothing()
        }
      }
      return true
    })
  }

  async getOverview(clerkUserId: string, recentLimit = 5): Promise<ProgressionOverview> {
    await this.db.insert(profiles).values({ clerkUserId, preferences: sanitizeAccountPreferences(undefined) }).onConflictDoNothing()
    const [profile] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.clerkUserId, clerkUserId)).limit(1)
    if (!profile) throw new Error('Profile not found.')
    await this.db.insert(progressionProfiles).values({ profileId: profile.id }).onConflictDoNothing()
    const [summary] = await this.db.select().from(progressionProfiles).where(eq(progressionProfiles.profileId, profile.id)).limit(1)
    const history = await this.db.select({ participant: matchParticipants, match: onlineMatches })
      .from(matchParticipants).innerJoin(onlineMatches, eq(matchParticipants.matchId, onlineMatches.id))
      .where(eq(matchParticipants.profileId, profile.id)).orderBy(desc(onlineMatches.completedAt)).limit(Math.max(1, Math.min(20, recentLimit)))
    const entitlements = await this.db.select({ id: cosmeticEntitlements.cosmeticId }).from(cosmeticEntitlements).where(eq(cosmeticEntitlements.profileId, profile.id))
    const goalClaims = await this.db.select({ id: currencyLedger.referenceId }).from(currencyLedger).where(and(eq(currencyLedger.profileId, profile.id), eq(currencyLedger.reason, 'goal-reward')))
    const experience = summary?.experience ?? 0
    return {
      summary: { ...progressionLevel(experience), experience, currencyBalance: summary?.currencyBalance ?? 0, matchesPlayed: summary?.matchesPlayed ?? 0, wins: summary?.wins ?? 0, losses: summary?.losses ?? 0, draws: summary?.draws ?? 0 },
      recentMatches: history.map(({ participant, match }) => ({ id: match.id, completedAt: match.completedAt.toISOString(), mode: match.mode as MatchMode, mapId: match.mapId as MapId, outcome: participant.outcome as MatchOutcome, reason: match.reason as 'normal' | 'forfeit', turnsTaken: match.turnsTaken, durationSeconds: match.durationSeconds, experienceEarned: participant.experienceEarned, currencyEarned: participant.currencyEarned })),
      entitlements: entitlements.map(({ id }) => id),
      goals: PROGRESSION_GOALS.map((goal) => ({ ...goal, progress: Math.min(goal.target, summary?.[goal.metric] ?? 0), completed: goalClaims.some(({ id }) => id === goal.id) })),
    }
  }

  async purchaseCosmetic(clerkUserId: string, cosmeticId: string): Promise<'purchased' | 'owned' | 'insufficient-funds' | 'not-found'> {
    const cosmetic = PURCHASABLE_COSMETICS.find((item) => item.entitlementId === cosmeticId)
    if (!cosmetic) return 'not-found'
    return this.db.transaction(async (tx) => {
      await tx.insert(profiles).values({ clerkUserId, preferences: sanitizeAccountPreferences(undefined) }).onConflictDoNothing()
      const [profile] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.clerkUserId, clerkUserId)).limit(1)
      if (!profile) throw new Error('Profile not found.')
      await tx.insert(progressionProfiles).values({ profileId: profile.id }).onConflictDoNothing()
      const granted = await tx.insert(cosmeticEntitlements).values({
        profileId: profile.id, cosmeticId, source: 'workshop-purchase',
      }).onConflictDoNothing().returning({ cosmeticId: cosmeticEntitlements.cosmeticId })
      if (!granted.length) return 'owned'
      const debited = await tx.update(progressionProfiles).set({
        currencyBalance: sql`${progressionProfiles.currencyBalance} - ${cosmetic.price}`,
        updatedAt: new Date(),
      }).where(and(
        eq(progressionProfiles.profileId, profile.id),
        gte(progressionProfiles.currencyBalance, cosmetic.price),
      )).returning({ profileId: progressionProfiles.profileId })
      if (!debited.length) {
        await tx.delete(cosmeticEntitlements).where(and(
          eq(cosmeticEntitlements.profileId, profile.id),
          eq(cosmeticEntitlements.cosmeticId, cosmeticId),
        ))
        return 'insufficient-funds'
      }
      await tx.insert(currencyLedger).values({
        profileId: profile.id, amount: -cosmetic.price, reason: 'cosmetic-purchase', referenceId: cosmeticId,
      })
      return 'purchased'
    })
  }
}

let progressionRepository: ProgressionRepository | null = null
export const configureProgressionRepository = (repository: ProgressionRepository | null): void => { progressionRepository = repository }
export const activeProgressionRepository = (): ProgressionRepository | null => progressionRepository
