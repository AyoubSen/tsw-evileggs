import { MatchSimulation } from '../match/MatchSimulation'
import type { MatchState, SerializedMatchState } from '../match/MatchState'

export function serializeMatchState(state: MatchState): string {
  return JSON.stringify({ version: 4, state, accumulatorSeconds: 0 } satisfies SerializedMatchState)
}

export function deserializeMatchState(payload: string): SerializedMatchState {
  const parsed: unknown = JSON.parse(payload)
  if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 4)
    throw new Error('Unsupported match snapshot')
  const snapshot = parsed as SerializedMatchState
  if (
    !snapshot.state ||
    !Array.isArray(snapshot.state.players) ||
    !Array.isArray(snapshot.state.teamTurnCursors) ||
    !Array.isArray(snapshot.state.terrainOperations) ||
    !Number.isSafeInteger(snapshot.state.mapRevision) ||
    snapshot.state.mapRevision < 1 ||
    !Number.isFinite(snapshot.state.worldWidth) ||
    !Number.isFinite(snapshot.state.worldHeight) ||
    snapshot.state.worldWidth <= 0 ||
    snapshot.state.worldHeight <= 0 ||
    !Number.isFinite(snapshot.state.wind) ||
    !Number.isFinite(snapshot.accumulatorSeconds) ||
    snapshot.accumulatorSeconds < 0
  )
    throw new Error('Invalid match snapshot')
  return structuredClone(snapshot)
}

export function restoreMatchSimulation(payload: string): MatchSimulation {
  return new MatchSimulation(undefined, { snapshot: deserializeMatchState(payload) })
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`
}

export function matchStateChecksum(state: MatchState): string {
  let hash = 0x811c9dc5
  const input = canonical(state)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
