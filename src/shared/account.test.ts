import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../app/preferences'
import { DEFAULT_PLAYER_APPEARANCES } from '../players/appearanceRegistry'
import { MAX_OUTFIT_PRESETS, type OutfitPresetRecord } from '../profile/outfitPresets'
import { projectAccountPreferences, sanitizeAccountData, sanitizeAccountPreferences } from './account'

const appearance = DEFAULT_PLAYER_APPEARANCES[0]
const preset = (id: string, syncRevision?: string, deleted = false): OutfitPresetRecord => deleted
  ? { version: 1, id, name: id, updatedAt: 1, deleted: true, ...(syncRevision ? { syncRevision } : {}) }
  : { version: 1, id, name: id, appearance, updatedAt: 1, ...(syncRevision ? { syncRevision } : {}) }

describe('browser-safe account data', () => {
  it('sanitizes malformed and future preference values to supported values', () => {
    expect(sanitizeAccountPreferences({
      version: 99,
      displayName: '  Egg\u0000   Lord  ',
      preferredAppearance: { version: 99 },
      cameraShake: 'no',
      cameraMode: 'future',
      masterVolume: Infinity,
      soundEffectsVolume: 3,
      defaultMatch: { mode: '4v4', mapId: 'future-map', turnDurationSeconds: 99, projectileBoundaryMode: 'future' },
    })).toMatchObject({
      version: 2,
      displayName: 'Egg Lord',
      preferredAppearance: appearance,
      cameraShake: true,
      cameraMode: 'fit',
      masterVolume: 0.8,
      soundEffectsVolume: 1,
      defaultMatch: { mode: '1v1', mapId: 'rolling-hills', turnDurationSeconds: 30, projectileBoundaryMode: 'open' },
    })
  })

  it('projects only account preferences and sanitizes them', () => {
    const projected = projectAccountPreferences({
      ...DEFAULT_PREFERENCES,
      playerNames: ['  Cloud   Egg  ', 'Local only'],
      masterVolume: -2,
      reducedMotion: true,
    })
    expect(projected.preferences).toMatchObject({ displayName: 'Cloud Egg', masterVolume: 0, reducedMotion: true })
    expect(projected.preferences).not.toHaveProperty('playerNames')
  })

  it('caps active presets separately from tombstones', () => {
    const active = Array.from({ length: MAX_OUTFIT_PRESETS + 2 }, (_, index) => preset(`active-${index}`))
    const tombstones = Array.from({ length: 4 }, (_, index) => preset(`deleted-${index}`, '1', true))
    const records = sanitizeAccountData({ outfitPresets: [...tombstones, ...active] }).outfitPresets
    expect(records.filter((record) => record.deleted !== true)).toHaveLength(MAX_OUTFIT_PRESETS)
    expect(records.filter((record) => record.deleted === true)).toHaveLength(tombstones.length)
  })

  it('deduplicates IDs by revision and lets a same-revision tombstone win', () => {
    const records = sanitizeAccountData({
      outfitPresets: [preset('newest', '2'), preset('newest', '10'), preset('deleted', '7'), preset('deleted', '7', true)],
    }).outfitPresets
    expect(records).toEqual([preset('newest', '10'), preset('deleted', '7', true)])
  })

  it('drops malformed records and timestamps beyond the Date range', () => {
    const records = sanitizeAccountData({
      outfitPresets: [preset('valid'), { ...preset('future'), updatedAt: 8_640_000_000_000_001 }, { version: 2, id: 'future-version' }, null],
    }).outfitPresets
    expect(records).toEqual([preset('valid')])
  })
})
