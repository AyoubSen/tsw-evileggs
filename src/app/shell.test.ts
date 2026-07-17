import { describe, expect, it } from 'vitest'
import { BRAND } from './branding'
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences'
import { DEFAULT_PLAYER_NAMES, sanitizePlayerName, validateMatchConfig } from '../match/config'

function memoryStorage(seed?: Record<string, string>): Storage {
  const values = new Map(Object.entries(seed ?? {}))
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('local match configuration', () => {
  it('trims names, applies defaults, and limits names', () => {
    expect(sanitizePlayerName('  Nova  ', 'Lumen')).toBe('Nova')
    expect(sanitizePlayerName('   ', 'Lumen')).toBe('Lumen')
    expect(sanitizePlayerName('x'.repeat(30), 'Lumen')).toHaveLength(18)
  })

  it('falls back safely for an invalid map and duration', () => {
    const config = validateMatchConfig({
      playerNames: ['', '  Morrow '],
      mapId: 'crater-basin' as never,
      turnDurationSeconds: 99 as never,
    })
    expect(config.playerNames).toEqual([DEFAULT_PLAYER_NAMES[0], 'Morrow'])
    expect(config.mapId).toBe('rolling-hills')
    expect(config.turnDurationSeconds).toBe(30)
  })
})

describe('preferences', () => {
  it('falls back for malformed values and removed maps', () => {
    const key = `${BRAND.storageNamespace}:preferences`
    expect(loadPreferences(memoryStorage({ [key]: '{broken' }))).toEqual(DEFAULT_PREFERENCES)
    const preferences = loadPreferences(
      memoryStorage({ [key]: JSON.stringify({ version: 1, lastMapId: 'crater-basin' }) }),
    )
    expect(preferences.lastMapId).toBe('rolling-hills')
  })

  it('saves only versioned preferences and tolerates unavailable storage', () => {
    const storage = memoryStorage()
    savePreferences({ ...DEFAULT_PREFERENCES, playerNames: ['Ash', 'Birch'] }, storage)
    expect(loadPreferences(storage).playerNames).toEqual([
      'Ash',
      'Birch',
      'Nova',
      'Bramble',
      'Sable',
      'Quill',
    ])
    expect(() => savePreferences(DEFAULT_PREFERENCES, undefined)).not.toThrow()
  })

  it('loads and clamps persisted audio preferences', () => {
    const key = `${BRAND.storageNamespace}:preferences`
    const preferences = loadPreferences(
      memoryStorage({
        [key]: JSON.stringify({
          ...DEFAULT_PREFERENCES,
          mute: true,
          masterVolume: 2,
          soundEffectsVolume: 0.35,
        }),
      }),
    )
    expect(preferences).toMatchObject({
      mute: true,
      masterVolume: 1,
      soundEffectsVolume: 0.35,
    })
  })

  it('migrates and sanitizes cosmetic loadouts', () => {
    const key = `${BRAND.storageNamespace}:preferences`
    expect(loadPreferences(memoryStorage({ [key]: JSON.stringify({ version: 5 }) })).cosmeticLoadout)
      .toEqual(DEFAULT_PREFERENCES.cosmeticLoadout)
    expect(loadPreferences(memoryStorage({ [key]: JSON.stringify({ ...DEFAULT_PREFERENCES, cosmeticLoadout: { weaponSkin: 'sunset-brass', projectileSkin: 'future' } }) })).cosmeticLoadout)
      .toEqual({ version: 1, weaponSkin: 'sunset-brass', projectileSkin: 'standard' })
  })
})
