import { BRAND } from './branding'
import {
  DEFAULT_PLAYER_NAMES,
  validateMatchConfig,
  type LocalMatchConfig,
  type TurnDuration,
} from '../match/config'
import { getMap, type MapId, type MatchMode } from '../maps/registry'
import {
  DEFAULT_PLAYER_APPEARANCES,
  sanitizePlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'

export type Preferences = {
  version: 2
  playerNames: string[]
  playerAppearances: PlayerAppearance[]
  lastMode: MatchMode
  lastMapId: MapId
  turnDurationSeconds: TurnDuration
  projectileBoundaryMode: LocalMatchConfig['projectileBoundaryMode']
  reducedMotion: boolean
  highContrastHud: boolean
  cameraShake: boolean
  cameraMode: 'fit' | 'follow'
  aimGuide: 'normal' | 'minimal'
  screenFlash: 'normal' | 'reduced' | 'off'
  mute: boolean
  masterVolume: number
  soundEffectsVolume: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: 2,
  playerNames: [...DEFAULT_PLAYER_NAMES],
  playerAppearances: DEFAULT_PLAYER_APPEARANCES.map((appearance) => ({ ...appearance })),
  lastMode: '1v1',
  lastMapId: 'rolling-hills',
  turnDurationSeconds: 30,
  projectileBoundaryMode: 'open',
  reducedMotion: false,
  highContrastHud: false,
  cameraShake: true,
  cameraMode: 'fit',
  aimGuide: 'normal',
  screenFlash: 'normal',
  mute: false,
  masterVolume: 0.8,
  soundEffectsVolume: 0.8,
}

const storageKey = `${BRAND.storageNamespace}:preferences`

export function loadPreferences(
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  try {
    const raw = storage?.getItem(storageKey)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      ![1, 2].includes((parsed as { version?: number }).version ?? 0)
    )
      return DEFAULT_PREFERENCES
    const value = parsed as Partial<Preferences> & { version: 1 | 2 }
    const playerNames = DEFAULT_PLAYER_NAMES.map((fallback, index) => {
      const name = value.playerNames?.[index]
      return typeof name === 'string' && name.trim() ? name.trim().slice(0, 18) : fallback
    })
    const config = validateMatchConfig({
      mode: value.lastMode,
      playerNames,
      mapId: value.lastMapId,
      turnDurationSeconds: value.turnDurationSeconds,
      projectileBoundaryMode: value.projectileBoundaryMode,
      playerAppearances: value.playerAppearances,
    })
    return {
      ...DEFAULT_PREFERENCES,
      ...config,
      playerNames,
      playerAppearances: DEFAULT_PLAYER_APPEARANCES.map((fallback, index) =>
        sanitizePlayerAppearance(value.playerAppearances?.[index], fallback),
      ),
      version: 2,
      lastMode: config.mode,
      lastMapId: getMap(config.mapId).id,
      projectileBoundaryMode: config.projectileBoundaryMode,
      reducedMotion: value.reducedMotion === true,
      highContrastHud: value.highContrastHud === true,
      cameraShake: value.cameraShake !== false,
      cameraMode: value.cameraMode === 'follow' ? 'follow' : 'fit',
      aimGuide: value.aimGuide === 'minimal' ? 'minimal' : 'normal',
      screenFlash:
        value.screenFlash === 'reduced' || value.screenFlash === 'off'
          ? value.screenFlash
          : 'normal',
      mute: value.mute === true,
      masterVolume:
        typeof value.masterVolume === 'number'
          ? Math.max(0, Math.min(1, value.masterVolume))
          : DEFAULT_PREFERENCES.masterVolume,
      soundEffectsVolume:
        typeof value.soundEffectsVolume === 'number'
          ? Math.max(0, Math.min(1, value.soundEffectsVolume))
          : DEFAULT_PREFERENCES.soundEffectsVolume,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(
  preferences: Preferences,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // Storage can be blocked by privacy settings; the game remains usable without it.
  }
}
