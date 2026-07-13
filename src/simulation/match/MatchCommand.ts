import type { Vector } from '../../shared/types'
import type { WeaponId } from '../../weapons/registry'

type CommandEnvelope = {
  sequence: number
  expectedTurn: number
  playerId: string
}

export type MatchCommand =
  | (CommandEnvelope & { type: 'move'; direction: -1 | 0 | 1; pressed: boolean })
  | (CommandEnvelope & { type: 'jump' })
  | (CommandEnvelope & { type: 'select-weapon'; weaponId: WeaponId })
  | (CommandEnvelope & { type: 'fire'; aimDirection: Vector; power: number })
  | (CommandEnvelope & { type: 'teleport'; destination: Vector })

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
  | 'invalid-teleport'

export type CommandResult =
  | { accepted: true; sequence: number }
  | { accepted: false; sequence: number; reason: CommandRejection }
