import { BRAND } from './branding'
import { DEFAULT_PLAYER_NAMES, validateMatchConfig, type TurnDuration } from '../match/config'
import { getMap, type MapId } from '../maps/registry'

export type Preferences = {
  version: 1
  playerNames: [string, string]
  lastMapId: MapId
  turnDurationSeconds: TurnDuration
  reducedMotion: boolean
  highContrastHud: boolean
  cameraShake: boolean
  aimGuide: 'normal' | 'minimal'
  screenFlash: 'normal' | 'reduced' | 'off'
  mute: boolean
  masterVolume: number
  soundEffectsVolume: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  playerNames: [...DEFAULT_PLAYER_NAMES],
  lastMapId: 'rolling-hills',
  turnDurationSeconds: 30,
  reducedMotion: false,
  highContrastHud: false,
  cameraShake: true,
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
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1)
      return DEFAULT_PREFERENCES
    const value = parsed as Partial<Preferences>
    const config = validateMatchConfig({
      playerNames: value.playerNames,
      mapId: value.lastMapId,
      turnDurationSeconds: value.turnDurationSeconds,
    })
    return {
      ...DEFAULT_PREFERENCES,
      ...config,
      playerNames: [...config.playerNames],
      lastMapId: getMap(config.mapId).id,
      reducedMotion: value.reducedMotion === true,
      highContrastHud: value.highContrastHud === true,
      cameraShake: value.cameraShake !== false,
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
