import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../app/preferences'
import { DEFAULT_PLAYER_APPEARANCES } from '../players/appearanceRegistry'
import { sanitizeAccountData, sanitizeAccountPreferences } from '../shared/account'
import type { OutfitPreset, OutfitPresetRecord } from '../profile/outfitPresets'
import {
  applyCloudAccountData,
  mergeAccountData,
  mergeAccountPreferences,
  mergeOutfitPresetRecords,
  projectLocalAccountData,
} from './sync'

const appearance = DEFAULT_PLAYER_APPEARANCES[0]
const preset = (id: string, name: string, deleted = false): OutfitPresetRecord => deleted
  ? { version: 1, id, name, updatedAt: 1, deleted: true }
  : { version: 1, id, name, appearance, updatedAt: 1 }

describe('account synchronization helpers', () => {
  it('applies cloud-owned fields while preserving local players after the first', () => {
    const cloud = sanitizeAccountData({
      preferences: { displayName: 'Cloud', reducedMotion: true, defaultMatch: { mode: '2v2' } },
      outfitPresets: [preset('active', 'Active'), preset('gone', 'Gone', true)],
    })
    const applied = applyCloudAccountData({ ...DEFAULT_PREFERENCES, playerNames: ['Guest', 'Keep me'] }, cloud)
    expect(applied.playerNames).toEqual(['Cloud', 'Keep me'])
    expect(applied.outfitPresets).toEqual([preset('active', 'Active')])
    expect(applied).toMatchObject({ reducedMotion: true, lastMode: '2v2' })
  })

  it('merges independent preference edits and prefers local conflicting edits', () => {
    const base = sanitizeAccountPreferences({ displayName: 'Base', reducedMotion: false })
    const local = { ...base, displayName: 'Local' }
    const remote = { ...base, reducedMotion: true }
    expect(mergeAccountPreferences(base, local, remote)).toMatchObject({ displayName: 'Local', reducedMotion: true })
    expect(mergeAccountPreferences(base, local, { ...base, displayName: 'Remote' }).displayName).toBe('Local')
  })

  it('reconciles loading and conflict results without dropping remote-only changes', () => {
    const base = sanitizeAccountData({ preferences: { displayName: 'Base' }, outfitPresets: [] })
    const local = sanitizeAccountData({ preferences: { ...base.preferences, displayName: 'Local' }, outfitPresets: [] })
    const remote = sanitizeAccountData({ preferences: { ...base.preferences, reducedMotion: true }, outfitPresets: [preset('remote', 'Remote')] })
    const merged = mergeAccountData(base, local, remote)
    expect(merged.preferences).toMatchObject({ displayName: 'Local', reducedMotion: true })
    expect(merged.outfitPresets).toEqual([preset('remote', 'Remote')])
  })

  it('merges preset changes and gives a remote tombstone priority on conflict', () => {
    const base = [preset('shared', 'Base'), preset('remote-only', 'Base')]
    const local = [preset('shared', 'Local'), preset('remote-only', 'Base')]
    const remote = [preset('shared', 'Deleted', true), preset('remote-only', 'Remote')]
    expect(mergeOutfitPresetRecords(base, local, remote)).toEqual([
      preset('shared', 'Deleted', true),
      preset('remote-only', 'Remote'),
    ])
  })

  it('preserves unchanged revisions and creates tombstones for removed cloud presets', () => {
    const unchanged = { ...preset('same', 'Same'), syncRevision: '4' } as OutfitPresetRecord
    const removed = { ...preset('removed', 'Removed'), syncRevision: '5' } as OutfitPresetRecord
    const preferences = { ...DEFAULT_PREFERENCES, outfitPresets: [preset('same', 'Same') as OutfitPreset] }
    const projected = projectLocalAccountData(preferences, sanitizeAccountData({ outfitPresets: [unchanged, removed] }))
    expect(projected.outfitPresets).toEqual([
      unchanged,
      { version: 1, id: 'removed', name: 'Removed', updatedAt: 1, deleted: true },
    ])
  })
})
