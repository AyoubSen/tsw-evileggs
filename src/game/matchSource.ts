import type { MatchCommandInput, CommandRejection } from '../simulation/match/MatchCommand'
import type { MatchEvent } from '../simulation/match/MatchEvent'
import type { MatchState, SimPlayer } from '../simulation/match/MatchState'
import type { TerrainMask } from '../terrain/TerrainMask'
import type { Vector } from '../shared/types'
import type { NetworkCommandRejection } from '../network/protocol'

export type MatchSourceCommandResult =
  | { accepted: true; commandId: number; authoritativeTick: number }
  | {
      accepted: false
      commandId: number
      authoritativeTick: number
      reason: CommandRejection | NetworkCommandRejection | 'navigation-cancelled'
    }

export interface MatchSource {
  readonly state: MatchState
  readonly activePlayer: SimPlayer
  readonly timerRemainingSeconds: number
  readonly localSeat: number | null
  readonly online: boolean
  readonly presentationRevision: number
  update(deltaSeconds: number): void
  sendCommand(command: MatchCommandInput): Promise<MatchSourceCommandResult>
  drainEvents(): MatchEvent[]
  getTerrain(): TerrainMask
  resolveTeleportTarget(pointer: Vector): Vector | null
  isValidTeleport(target: Vector): boolean
  canControlActivePlayer(): boolean
  setPaused(paused: boolean): void
  restart(): void
  dispose(): void
}
