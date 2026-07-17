import { and, asc, eq } from 'drizzle-orm'
import { sanitizeAccountData, sanitizeAccountPreferences, type AccountData, type AccountEnvelope } from '../../src/shared/account'
import { outfitPresets, profiles, webhookEvents } from '../db/schema'
import type { AccountDatabase } from '../db/client'

export type SyncResult = { ok: true; envelope: AccountEnvelope } | { ok: false; envelope: AccountEnvelope }

export interface AccountRepository {
  get(clerkUserId: string): Promise<AccountEnvelope>
  sync(clerkUserId: string, baseRevision: number, data: AccountData): Promise<SyncResult>
  deleteProfile(clerkUserId: string): Promise<void>
  processDeletedUser(eventId: string, clerkUserId: string): Promise<boolean>
}

const defaultPreferences = () => sanitizeAccountPreferences(undefined)

export function buildAccountSyncPlan(baseRevision: number, input: AccountData, now: Date) {
  const data = sanitizeAccountData(input)
  const revision = baseRevision + 1
  return {
    data,
    profile: { preferences: data.preferences, revision, updatedAt: now },
    replaceExistingPresets: true as const,
    presets: data.outfitPresets.map((preset, position) => ({
      id: preset.id,
      name: preset.name,
      appearance: preset.deleted ? null : preset.appearance,
      deleted: preset.deleted === true,
      position,
      updatedAt: now,
      serverRevision: revision,
    })),
  }
}

export const claimedWrite = (returnedRows: readonly unknown[]): boolean => returnedRows.length > 0

export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: AccountDatabase) {}

  private async read(executor: AccountDatabase, clerkUserId: string): Promise<AccountEnvelope> {
    const [profile] = await executor.select().from(profiles).where(eq(profiles.clerkUserId, clerkUserId)).limit(1)
    if (!profile) throw new Error('Account profile was not created')
    const presets = await executor.select().from(outfitPresets).where(eq(outfitPresets.profileId, profile.id)).orderBy(asc(outfitPresets.position), asc(outfitPresets.id))
    return {
      revision: profile.revision,
      data: sanitizeAccountData({
        preferences: profile.preferences,
        outfitPresets: presets.map((preset) => ({
          version: 1,
          id: preset.id,
          name: preset.name,
          updatedAt: preset.updatedAt.getTime(),
          deleted: preset.deleted || undefined,
          ...(!preset.deleted && preset.appearance ? { appearance: preset.appearance } : {}),
          scope: 'account',
          syncRevision: String(preset.serverRevision),
        })),
      }),
    }
  }

  async get(clerkUserId: string): Promise<AccountEnvelope> {
    await this.db.insert(profiles).values({ clerkUserId, preferences: defaultPreferences() }).onConflictDoNothing()
    return this.read(this.db, clerkUserId)
  }

  async sync(clerkUserId: string, baseRevision: number, input: AccountData): Promise<SyncResult> {
    const plan = buildAccountSyncPlan(baseRevision, input, new Date())
    return this.db.transaction(async (tx) => {
      await tx.insert(profiles).values({ clerkUserId, preferences: defaultPreferences() }).onConflictDoNothing()
      const updatedRows = await tx.update(profiles).set(plan.profile)
        .where(and(eq(profiles.clerkUserId, clerkUserId), eq(profiles.revision, baseRevision))).returning({ id: profiles.id })
      if (!claimedWrite(updatedRows)) return { ok: false as const, envelope: await this.read(tx as unknown as AccountDatabase, clerkUserId) }
      const updated = updatedRows[0]!
      await tx.delete(outfitPresets).where(eq(outfitPresets.profileId, updated.id))
      if (plan.presets.length) await tx.insert(outfitPresets).values(plan.presets.map((preset) => ({
        profileId: updated.id,
        ...preset,
      })))
      return { ok: true as const, envelope: await this.read(tx as unknown as AccountDatabase, clerkUserId) }
    })
  }

  async deleteProfile(clerkUserId: string): Promise<void> {
    await this.db.delete(profiles).where(eq(profiles.clerkUserId, clerkUserId))
  }

  async processDeletedUser(eventId: string, clerkUserId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx.insert(webhookEvents).values({ id: eventId, eventType: 'user.deleted' })
        .onConflictDoNothing().returning({ id: webhookEvents.id })
      if (!claimedWrite(inserted)) return false
      await tx.delete(profiles).where(eq(profiles.clerkUserId, clerkUserId))
      return true
    })
  }
}
