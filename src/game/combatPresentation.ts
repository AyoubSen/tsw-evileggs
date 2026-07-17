import type { MatchMode } from '../maps/mapDocument'
import type { CommandRejection } from '../simulation/match/MatchCommand'
import type { MatchPhase } from '../simulation/match/MatchState'
import type { WeaponDefinition } from '../weapons/registry'

const REJECTION_COPY: Record<CommandRejection, string> = {
  'invalid-sequence': 'Action not available',
  'stale-turn': 'Turn changed',
  'unknown-player': 'Player not available',
  'not-active-player': 'Waiting for the active player',
  'match-not-accepting-input': 'Wait for the current action',
  'player-dead': 'Player is out',
  'invalid-command': 'Action not available',
  'invalid-aim': 'Choose a valid direction',
  'invalid-power': 'Choose valid shot power',
  'invalid-weapon': 'Weapon not available',
  'no-ammunition': 'No ammunition',
  'cannot-jump': 'Cannot jump here',
  'invalid-target': 'Choose safe ground',
  'invalid-placement': 'Mine needs a clear ledge',
  'cannot-trigger': 'Nothing left to split',
  'movement-locked': 'Frozen: movement locked',
}

export function commandRejectionFeedback(reason: CommandRejection | string): string {
  return REJECTION_COPY[reason as CommandRejection] ?? 'Action not available'
}

export function visibleTurnCount(mode: MatchMode): number {
  return mode === '1v1' ? 2 : mode === '2v2' ? 4 : 6
}

export function combatHudHint(input: {
  paused: boolean
  phase: MatchPhase
  canControl: boolean
  activePlayerName: string
  canTriggerRemote: boolean
  movementLocked: boolean
  aimMode: WeaponDefinition['aimMode']
  powerMode: WeaponDefinition['powerMode']
  power: number
  remoteSplitSelected: boolean
}): string {
  if (input.paused) return 'Match paused'
  if (input.phase === 'victory') return 'Match complete'
  if (!input.canControl) return `Waiting for ${input.activePlayerName}`
  if (input.canTriggerRemote) return 'Space now to split into two rockets'
  if (input.phase !== 'input') return 'Wait for the current action'
  if (input.movementLocked) return 'Frozen · aim and fire, but movement is locked'
  if (input.aimMode === 'target-position') return 'Point at safe ground · Space to warp'
  if (input.aimMode === 'self') return 'Face a clear ledge · Space to deploy'
  if (input.remoteSplitSelected) return 'Fire, then press Space again to split'
  if (input.powerMode === 'fixed') return 'Short-range spread · Space to fire'
  return `Power ${input.power}% · drag toward target · Space to fire`
}
