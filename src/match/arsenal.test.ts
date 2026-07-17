import { describe, expect, it } from 'vitest'
import {
  ARSENAL_PRESETS,
  detectArsenalPreset,
  sanitizeArsenalRules,
  usableArsenalWeapons,
} from './arsenal'

describe('arsenal rules', () => {
  it('recognizes immutable built-in loadouts', () => {
    expect(detectArsenalPreset(ARSENAL_PRESETS.standard.ammunition)).toBe('standard')
    expect(detectArsenalPreset(ARSENAL_PRESETS.classic.ammunition)).toBe('classic')
    expect(usableArsenalWeapons(ARSENAL_PRESETS.classic)).toEqual([
      'basic-rocket',
      'high-arc-mortar',
      'timed-grenade',
      'pocket-knife',
      'old-shoe',
    ])
  })

  it('sanitizes ammunition and guarantees a non-dead-ending weapon', () => {
    const rules = sanitizeArsenalRules({
      ammunition: {
        ...ARSENAL_PRESETS.standard.ammunition,
        'basic-rocket': 0,
        'pocket-knife': 0,
        teleporter: -4,
      },
    })
    expect(rules.ammunition['basic-rocket']).toBe('unlimited')
    expect(rules.ammunition.teleporter).toBe(2)
    expect(rules.presetId).toBe('custom')
  })
})
