import {
  defaultMapForMode,
  getMap,
  mapIdsForMode,
  type MapId,
  type MatchMode,
} from '../maps/registry'
import { PLAYER_COUNT_BY_MODE, type ProjectileBoundaryMode } from '../maps/mapDocument'
import {
  DEFAULT_PLAYER_APPEARANCES,
  sanitizePlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'
import { sanitizeArsenalRules, type ArsenalRules } from './arsenal'

export const DEFAULT_PLAYER_NAMES = ['Lumen', 'Morrow', 'Nova', 'Bramble', 'Sable', 'Quill'] as const
export { PLAYER_COUNT_BY_MODE }
export const TURN_DURATIONS = [20, 30, 45] as const
export type TurnDuration = (typeof TURN_DURATIONS)[number]

export type LocalMatchConfig = {
  mode: MatchMode
  playerNames: readonly string[]
  playerAppearances: readonly PlayerAppearance[]
  mapId: MapId
  turnDurationSeconds: TurnDuration
  projectileBoundaryMode: ProjectileBoundaryMode
  arsenal: ArsenalRules
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
  const appearances = value?.playerAppearances ?? DEFAULT_PLAYER_APPEARANCES
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
    playerAppearances: Array.from({ length: playerCount }, (_, index) =>
      sanitizePlayerAppearance(appearances[index], DEFAULT_PLAYER_APPEARANCES[index]),
    ),
    mapId: map.id,
    turnDurationSeconds: duration,
    projectileBoundaryMode: map.projectileBoundary.supportedModes.includes(
      value?.projectileBoundaryMode as ProjectileBoundaryMode,
    )
      ? (value!.projectileBoundaryMode as ProjectileBoundaryMode)
      : map.projectileBoundary.defaultMode,
    arsenal: sanitizeArsenalRules(value?.arsenal),
  }
}
