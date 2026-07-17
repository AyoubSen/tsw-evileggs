import { describe, expect, it } from 'vitest'
import { commandRejectionFeedback, combatHudHint, visibleTurnCount } from './combatPresentation'

describe('combat presentation decisions', () => {
  it.each([
    ['no-ammunition', 'No ammunition'],
    ['invalid-target', 'Choose safe ground'],
    ['invalid-placement', 'Mine needs a clear ledge'],
    ['movement-locked', 'Frozen: movement locked'],
    ['cannot-trigger', 'Nothing left to split'],
  ] as const)('explains %s', (reason, message) => {
    expect(commandRejectionFeedback(reason)).toBe(message)
  })

  it('shows a complete mode turn cycle', () => {
    expect(visibleTurnCount('1v1')).toBe(2)
    expect(visibleTurnCount('2v2')).toBe(4)
    expect(visibleTurnCount('3v3')).toBe(6)
  })

  it('prioritizes control ownership and remote actions in HUD guidance', () => {
    const base = {
      paused: false,
      phase: 'input' as const,
      canControl: true,
      activePlayerName: 'A1',
      canTriggerRemote: false,
      movementLocked: false,
      aimMode: 'directional' as const,
      powerMode: 'variable' as const,
      power: 68,
      remoteSplitSelected: false,
    }
    expect(combatHudHint({ ...base, canControl: false })).toBe('Waiting for A1')
    expect(combatHudHint({ ...base, phase: 'projectile', canTriggerRemote: true })).toBe(
      'Space now to split into two rockets',
    )
    expect(combatHudHint({ ...base, remoteSplitSelected: true })).toBe(
      'Fire, then press Space again to split',
    )
  })
})
