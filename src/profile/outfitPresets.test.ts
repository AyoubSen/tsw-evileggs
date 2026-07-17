import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_APPEARANCES } from '../players/appearanceRegistry'
import { sanitizeOutfitPresetRecord } from './outfitPresets'

const record = (syncRevision: unknown, deleted = false) => ({
  version: 1,
  id: 'revision-test',
  name: 'Revision',
  updatedAt: 1,
  ...(deleted ? { deleted: true } : { appearance: DEFAULT_PLAYER_APPEARANCES[0] }),
  syncRevision,
})

describe('outfit preset revision sanitization', () => {
  it.each(['0', '1', '18446744073709551615'])('keeps canonical revision %s', (syncRevision) => {
    expect(sanitizeOutfitPresetRecord(record(syncRevision))).toMatchObject({ syncRevision })
    expect(sanitizeOutfitPresetRecord(record(syncRevision, true))).toMatchObject({ syncRevision })
  })

  it.each(['', '00', '01', '-1', '+1', '1.0', '184467440737095516150', 1, null])(
    'drops malformed or future revision %s',
    (syncRevision) => {
      expect(sanitizeOutfitPresetRecord(record(syncRevision))).not.toHaveProperty('syncRevision')
      expect(sanitizeOutfitPresetRecord(record(syncRevision, true))).not.toHaveProperty('syncRevision')
    },
  )
})
