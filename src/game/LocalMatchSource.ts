import type { LocalMatchConfig } from '../match/config'
import type { MatchCommand, MatchCommandInput } from '../simulation/match/MatchCommand'
import { MatchSimulation } from '../simulation/match/MatchSimulation'
import type { MatchSource, MatchSourceCommandResult } from './matchSource'
import type { Vector } from '../shared/types'

export class LocalMatchSource implements MatchSource {
  readonly online = false
  readonly localSeat = null
  private simulation: MatchSimulation
  private commandSequence = 0

  constructor(private readonly config: LocalMatchConfig) {
    this.simulation = this.createSimulation()
  }

  get state() {
    return this.simulation.state
  }

  get activePlayer() {
    return this.simulation.activePlayer
  }

  get timerRemainingSeconds(): number {
    return this.simulation.timerRemainingSeconds
  }

  update(deltaSeconds: number): void {
    this.simulation.advance(deltaSeconds)
  }

  async sendCommand(command: MatchCommandInput): Promise<MatchSourceCommandResult> {
    const sequence = ++this.commandSequence
    const result = this.simulation.applyCommand({
      ...command,
      sequence,
      expectedTurn: this.state.turnNumber,
      playerId: this.activePlayer.id,
    } as MatchCommand)
    return result.accepted
      ? { accepted: true, commandId: sequence, authoritativeTick: this.state.tick }
      : {
          accepted: false,
          commandId: sequence,
          authoritativeTick: this.state.tick,
          reason: result.reason,
        }
  }

  drainEvents() {
    return this.simulation.drainEvents()
  }

  getTerrain() {
    return this.simulation.getTerrain()
  }

  isValidTeleport(target: Vector): boolean {
    return this.simulation.isValidTeleport(target)
  }

  canControlActivePlayer(): boolean {
    return true
  }

  setPaused(paused: boolean): void {
    this.simulation.setPaused(paused)
  }

  restart(): void {
    this.simulation = this.createSimulation()
    this.commandSequence = 0
  }

  dispose(): void {}

  private createSimulation(): MatchSimulation {
    return new MatchSimulation(this.config, { seed: 1, matchId: 'local-match' })
  }
}
