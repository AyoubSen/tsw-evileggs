import type { LocalMatchConfig } from '../../match/config'
import { getMap } from '../../maps/registry'
import type { MatchCommand } from '../match/MatchCommand'
import { MatchSimulation } from '../match/MatchSimulation'
import { matchStateChecksum } from '../serialization/matchSerialization'

export type ReplayCommand = { tick: number; command: MatchCommand }
export type MatchReplay = {
  version: 1
  seed: number
  config: LocalMatchConfig
  mapRevision: number
  mapContentHash: string
  commands: ReplayCommand[]
  endTick: number
}

export function replayMatch(replay: MatchReplay): MatchSimulation {
  if (replay.version !== 1) throw new Error('Unsupported match replay.')
  const map = getMap(replay.config.mapId)
  if (
    map.id !== replay.config.mapId ||
    map.revision !== replay.mapRevision ||
    map.contentHash !== replay.mapContentHash
  )
    throw new Error('Match replay map does not match the installed map content.')
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
