import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_APPEARANCES } from '../../src/players/appearanceRegistry'
import { sanitizeAccountPreferences, type AccountData } from '../../src/shared/account'
import { buildAccountSyncPlan, claimedWrite } from './repository'

const accountData = (): AccountData => ({
  preferences: sanitizeAccountPreferences({ displayName: 'Server Player' }),
  outfitPresets: [
    {
      version: 1,
      id: 'active',
      name: 'Active',
      appearance: DEFAULT_PLAYER_APPEARANCES[0],
      updatedAt: 1,
      scope: 'account',
    },
    {
      version: 1,
      id: 'deleted',
      name: 'Deleted',
      updatedAt: 2,
      deleted: true,
      scope: 'account',
    },
  ],
})

describe('account repository write decisions', () => {
  it('treats a missing optimistic update row as a conflict', () => {
    expect(claimedWrite([])).toBe(false)
    expect(claimedWrite([{ id: 'profile-id' }])).toBe(true)
  })

  it('uses server-controlled timestamps and the next revision for every write', () => {
    const now = new Date('2026-07-17T12:00:00.000Z')
    const plan = buildAccountSyncPlan(7, accountData(), now)

    expect(plan.profile).toMatchObject({ revision: 8, updatedAt: now })
    expect(plan.presets).toHaveLength(2)
    for (const preset of plan.presets) {
      expect(preset.updatedAt).toBe(now)
      expect(preset.serverRevision).toBe(8)
    }
    expect(plan.presets.map((preset) => preset.position)).toEqual([0, 1])
  })

  it('declares full preset cleanup and persists tombstones without appearance data', () => {
    const plan = buildAccountSyncPlan(0, accountData(), new Date(0))

    expect(plan.replaceExistingPresets).toBe(true)
    expect(plan.presets.find((preset) => preset.id === 'deleted')).toMatchObject({
      appearance: null,
      deleted: true,
    })
    expect(plan.presets.find((preset) => preset.id === 'active')).toMatchObject({ deleted: false })
  })

  it('processes a webhook only when its event row was newly claimed', () => {
    expect(claimedWrite([{ id: 'event-1' }])).toBe(true)
    expect(claimedWrite([])).toBe(false)
  })
})
