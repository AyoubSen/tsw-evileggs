import type { Vector } from '../../shared/types'
import type { WeaponId } from '../../weapons/registry'

type CommandEnvelope = {
  sequence: number
  expectedTurn: number
  playerId: string
}

export type WeaponActivation =
  | { kind: 'directional'; aimDirection: Vector; power: number }
  | { kind: 'target-position'; target: Vector }
  | { kind: 'self' }

export type MatchCommand =
  | (CommandEnvelope & { type: 'move'; direction: -1 | 0 | 1; pressed: boolean })
  | (CommandEnvelope & { type: 'jump' })
  | (CommandEnvelope & { type: 'select-weapon'; weaponId: WeaponId })
  | (CommandEnvelope & { type: 'activate-weapon'; activation: WeaponActivation })
  | (CommandEnvelope & { type: 'trigger-weapon' })

export type MatchCommandInput = MatchCommand extends infer Command
  ? Command extends MatchCommand
    ? Omit<Command, keyof CommandEnvelope>
    : never
  : never

export type CommandRejection =
  | 'invalid-sequence'
  | 'stale-turn'
  | 'unknown-player'
  | 'not-active-player'
  | 'match-not-accepting-input'
  | 'player-dead'
  | 'invalid-command'
  | 'invalid-aim'
  | 'invalid-power'
  | 'invalid-weapon'
  | 'no-ammunition'
  | 'cannot-jump'
  | 'invalid-target'
  | 'invalid-placement'
  | 'cannot-trigger'
  | 'movement-locked'

export type CommandResult =
  | { accepted: true; sequence: number }
  | { accepted: false; sequence: number; reason: CommandRejection }
