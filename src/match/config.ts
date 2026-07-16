import {
  defaultMapForMode,
  getMap,
  mapIdsForMode,
  type MapId,
  type MatchMode,
} from '../maps/registry'

export const DEFAULT_PLAYER_NAMES = ['Lumen', 'Morrow', 'Nova', 'Bramble'] as const
export const PLAYER_COUNT_BY_MODE: Record<MatchMode, number> = { '1v1': 2, '2v2': 4, '3v3': 6 }
export const TURN_DURATIONS = [20, 30, 45] as const
export type TurnDuration = (typeof TURN_DURATIONS)[number]

export type LocalMatchConfig = {
  mode: MatchMode
  playerNames: readonly string[]
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
  const requestedMap = getMap(value?.mapId)
  const requestedMode: MatchMode = ['1v1', '2v2', '3v3'].includes(value?.mode as MatchMode)
    ? (value!.mode as MatchMode)
    : requestedMap.mode
  const mode = mapIdsForMode(requestedMode).length > 0 ? requestedMode : requestedMap.mode
  const map = requestedMap.mode === mode ? requestedMap : defaultMapForMode(mode)
  const playerCount = PLAYER_COUNT_BY_MODE[mode]
  const duration = TURN_DURATIONS.includes(value?.turnDurationSeconds as TurnDuration)
    ? (value!.turnDurationSeconds as TurnDuration)
    : 30
  return {
    mode,
    playerNames: Array.from({ length: playerCount }, (_, index) =>
      sanitizePlayerName(names[index], DEFAULT_PLAYER_NAMES[index] ?? `Player ${index + 1}`),
    ),
    mapId: map.id,
    turnDurationSeconds: duration,
  }
}
