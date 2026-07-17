import { getMap, type MapId, type MatchMode } from '../maps/registry'
import { DEFAULT_PLAYER_APPEARANCES, sanitizePlayerAppearance, type PlayerAppearance } from '../players/appearanceRegistry'
import { MAX_OUTFIT_PRESETS, sanitizeOutfitPresetRecord, type OutfitPresetRecord } from '../profile/outfitPresets'
import type { Preferences } from '../app/preferences'

export const ACCOUNT_PREFERENCES_VERSION = 1 as const

export type AccountPreferences = {
  version: typeof ACCOUNT_PREFERENCES_VERSION
  displayName: string
  preferredAppearance: PlayerAppearance
  reducedMotion: boolean
  highContrastHud: boolean
  cameraShake: boolean
  cameraMode: 'fit' | 'follow'
  aimGuide: 'normal' | 'minimal'
  screenFlash: 'normal' | 'reduced' | 'off'
  mute: boolean
  masterVolume: number
  soundEffectsVolume: number
  defaultMatch: {
    mode: MatchMode
    mapId: MapId
    turnDurationSeconds: 20 | 30 | 45
    projectileBoundaryMode: 'open' | 'reflect' | 'wrap'
  }
}

export type AccountData = {
  preferences: AccountPreferences
  outfitPresets: OutfitPresetRecord[]
}

export type AccountEnvelope = {
  revision: number
  data: AccountData
}

const cleanName = (value: unknown): string => {
  if (typeof value !== 'string') return 'Player 1'
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18).trim() || 'Player 1'
}
const volume = (value: unknown, fallback = 0.8): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

export function sanitizeAccountPreferences(value: unknown): AccountPreferences {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const match = source.defaultMatch && typeof source.defaultMatch === 'object'
    ? source.defaultMatch as Record<string, unknown> : {}
  const mode: MatchMode = match.mode === '2v2' || match.mode === '3v3' ? match.mode : '1v1'
  const duration = match.turnDurationSeconds
  const turnDurationSeconds = duration === 20 || duration === 45 ? duration : 30
  return {
    version: ACCOUNT_PREFERENCES_VERSION,
    displayName: cleanName(source.displayName),
    preferredAppearance: sanitizePlayerAppearance(source.preferredAppearance),
    reducedMotion: source.reducedMotion === true,
    highContrastHud: source.highContrastHud === true,
    cameraShake: source.cameraShake !== false,
    cameraMode: source.cameraMode === 'follow' ? 'follow' : 'fit',
    aimGuide: source.aimGuide === 'minimal' ? 'minimal' : 'normal',
    screenFlash: source.screenFlash === 'reduced' || source.screenFlash === 'off' ? source.screenFlash : 'normal',
    mute: source.mute === true,
    masterVolume: volume(source.masterVolume),
    soundEffectsVolume: volume(source.soundEffectsVolume),
    defaultMatch: {
      mode,
      mapId: getMap(typeof match.mapId === 'string' ? match.mapId : undefined).id,
      turnDurationSeconds,
      projectileBoundaryMode:
        match.projectileBoundaryMode === 'reflect' || match.projectileBoundaryMode === 'wrap'
          ? match.projectileBoundaryMode
          : 'open',
    },
  }
}

export function sanitizeAccountData(value: unknown): AccountData {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const byId = new Map<string, OutfitPresetRecord>()
  let activeCount = 0
  if (Array.isArray(source.outfitPresets)) for (const value of source.outfitPresets) {
    const record = sanitizeOutfitPresetRecord(value)
    if (!record || record.updatedAt > 8_640_000_000_000_000) continue
    const current = byId.get(record.id)
    const revision = record.syncRevision ? BigInt(record.syncRevision) : -1n
    const currentRevision = current?.syncRevision ? BigInt(current.syncRevision) : -1n
    if (current && (revision < currentRevision || revision === currentRevision && current.deleted === true)) continue
    if (!current && record.deleted !== true && activeCount >= MAX_OUTFIT_PRESETS) continue
    if (current?.deleted === true && record.deleted !== true) activeCount++
    if (current && current.deleted !== true && record.deleted === true) activeCount--
    if (!current && record.deleted !== true) activeCount++
    byId.set(record.id, record)
  }
  return { preferences: sanitizeAccountPreferences(source.preferences), outfitPresets: [...byId.values()] }
}

export function projectAccountPreferences(preferences: Readonly<Preferences>): AccountData {
  return sanitizeAccountData({
    preferences: {
      displayName: preferences.playerNames[0],
      preferredAppearance: preferences.playerAppearances[0] ?? DEFAULT_PLAYER_APPEARANCES[0],
      reducedMotion: preferences.reducedMotion,
      highContrastHud: preferences.highContrastHud,
      cameraShake: preferences.cameraShake,
      cameraMode: preferences.cameraMode,
      aimGuide: preferences.aimGuide,
      screenFlash: preferences.screenFlash,
      mute: preferences.mute,
      masterVolume: preferences.masterVolume,
      soundEffectsVolume: preferences.soundEffectsVolume,
      defaultMatch: {
        mode: preferences.lastMode,
        mapId: preferences.lastMapId,
        turnDurationSeconds: preferences.turnDurationSeconds,
        projectileBoundaryMode: preferences.projectileBoundaryMode,
      },
    },
    outfitPresets: preferences.outfitPresets,
  })
}
