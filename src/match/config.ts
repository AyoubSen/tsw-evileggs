import { getMap, type MapId } from '../maps/registry'

export const DEFAULT_PLAYER_NAMES: readonly [string, string] = ['Lumen', 'Morrow']
export const TURN_DURATIONS = [20, 30, 45] as const
export type TurnDuration = (typeof TURN_DURATIONS)[number]

export type LocalMatchConfig = {
  playerNames: readonly [string, string]
  mapId: MapId
  turnDurationSeconds: TurnDuration
}

export function sanitizePlayerName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const name = value.trim().slice(0, 18)
  return name || fallback
}

export function validateMatchConfig(
  value: Partial<LocalMatchConfig> | undefined,
): LocalMatchConfig {
  const names = value?.playerNames ?? DEFAULT_PLAYER_NAMES
  const duration = TURN_DURATIONS.includes(value?.turnDurationSeconds as TurnDuration)
    ? (value!.turnDurationSeconds as TurnDuration)
    : 30
  return {
    playerNames: [
      sanitizePlayerName(names[0], DEFAULT_PLAYER_NAMES[0]),
      sanitizePlayerName(names[1], DEFAULT_PLAYER_NAMES[1]),
    ],
    mapId: getMap(value?.mapId).id,
    turnDurationSeconds: duration,
  }
}
