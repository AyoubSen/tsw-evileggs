import type { LocalMatchConfig } from '../../match/config'
import type { MatchCommand } from '../match/MatchCommand'
import { MatchSimulation } from '../match/MatchSimulation'
import { matchStateChecksum } from '../serialization/matchSerialization'

export type ReplayCommand = { tick: number; command: MatchCommand }
export type MatchReplay = {
  seed: number
  config: LocalMatchConfig
  commands: ReplayCommand[]
  endTick: number
}

export function replayMatch(replay: MatchReplay): MatchSimulation {
  const simulation = new MatchSimulation(replay.config, { seed: replay.seed })
  const commands = [...replay.commands].sort(
    (left, right) => left.tick - right.tick || left.command.sequence - right.command.sequence,
  )
  let commandIndex = 0
  while (simulation.state.tick < replay.endTick && simulation.state.phase !== 'victory') {
    while (commandIndex < commands.length && commands[commandIndex].tick === simulation.state.tick)
      simulation.applyCommand(commands[commandIndex++].command)
    simulation.step()
  }
  return simulation
}

export function replayChecksum(replay: MatchReplay): string {
  return matchStateChecksum(replayMatch(replay).state)
}
