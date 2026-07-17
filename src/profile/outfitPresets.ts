import {
  clonePlayerAppearance,
  validatePlayerAppearance,
  type PlayerAppearance,
} from '../players/appearanceRegistry'
import { resolveAccessoryFit } from '../players/playerVisualRecipes'

export const OUTFIT_PRESET_VERSION = 1 as const
export const MAX_OUTFIT_PRESETS = 12

export type OutfitPreset = {
  version: typeof OUTFIT_PRESET_VERSION
  id: string
  name: string
  appearance: PlayerAppearance
  updatedAt: number
  ownerId?: string
  scope?: 'local' | 'account' | 'shared'
  syncRevision?: string
  deleted?: false
}

export type OutfitPresetTombstone = Omit<OutfitPreset, 'appearance' | 'deleted'> & { deleted: true }
export type OutfitPresetRecord = OutfitPreset | OutfitPresetTombstone
export type OutfitPresetEnvelope = Readonly<{ version: 1; records: readonly OutfitPresetRecord[]; quarantined: readonly unknown[] }>
export interface OutfitPresetRepository {
  load(): OutfitPresetEnvelope
  save(envelope: OutfitPresetEnvelope): void
}

const validId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const validSyncRevision = /^(0|[1-9][0-9]{0,19})$/

export function sanitizeOutfitPresetName(value: unknown, fallback = 'Outfit'): string {
  const sanitized = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim()
    : ''
  return sanitized || fallback.slice(0, 24)
}

export function validateOutfitPreset(value: unknown): value is OutfitPreset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Record<string, unknown>
  return preset.version === OUTFIT_PRESET_VERSION &&
    typeof preset.id === 'string' && validId.test(preset.id) &&
    typeof preset.name === 'string' && preset.name === sanitizeOutfitPresetName(preset.name) &&
    validatePlayerAppearance(preset.appearance) && resolveAccessoryFit((preset.appearance as PlayerAppearance).body, (preset.appearance as PlayerAppearance).accessory).safe &&
    typeof preset.updatedAt === 'number' && Number.isSafeInteger(preset.updatedAt) && preset.updatedAt >= 0
}

export function sanitizeOutfitPreset(value: unknown): OutfitPreset | null {
  if (!value || typeof value !== 'object') return null
  const preset = value as Record<string, unknown>
  if (preset.version !== OUTFIT_PRESET_VERSION) return null
  if (typeof preset.id !== 'string' || !validId.test(preset.id)) return null
  if (typeof preset.updatedAt !== 'number' || !Number.isSafeInteger(preset.updatedAt) || preset.updatedAt < 0)
    return null
  if (!validatePlayerAppearance(preset.appearance)) return null
  if (!resolveAccessoryFit(preset.appearance.body, preset.appearance.accessory).safe) return null
  const candidate: OutfitPreset = {
    version: OUTFIT_PRESET_VERSION,
    id: preset.id,
    name: sanitizeOutfitPresetName(preset.name),
    appearance: clonePlayerAppearance(preset.appearance),
    updatedAt: preset.updatedAt,
    ...(typeof preset.ownerId === 'string' ? { ownerId: preset.ownerId.slice(0, 128) } : {}),
    ...(preset.scope === 'local' || preset.scope === 'account' || preset.scope === 'shared'
      ? { scope: preset.scope }
      : {}),
    ...(typeof preset.syncRevision === 'string' && validSyncRevision.test(preset.syncRevision)
      ? { syncRevision: preset.syncRevision.slice(0, 128) }
      : {}),
  }
  return validateOutfitPreset(candidate) ? candidate : null
}

export function sanitizeOutfitPresetRecord(value: unknown): OutfitPresetRecord | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (source.deleted !== true) return sanitizeOutfitPreset(value)
  if (
    source.version !== OUTFIT_PRESET_VERSION ||
    typeof source.id !== 'string' ||
    !validId.test(source.id) ||
    typeof source.updatedAt !== 'number' ||
    !Number.isSafeInteger(source.updatedAt) ||
    source.updatedAt < 0
  )
    return null
  return {
    version: OUTFIT_PRESET_VERSION,
    id: source.id,
    name: sanitizeOutfitPresetName(source.name),
    updatedAt: source.updatedAt,
    deleted: true,
    ...(typeof source.ownerId === 'string' ? { ownerId: source.ownerId.slice(0, 128) } : {}),
    ...(source.scope === 'local' || source.scope === 'account' || source.scope === 'shared'
      ? { scope: source.scope }
      : {}),
    ...(typeof source.syncRevision === 'string' && validSyncRevision.test(source.syncRevision)
      ? { syncRevision: source.syncRevision.slice(0, 128) }
      : {}),
  }
}

export function migrateOutfitPresets(value: unknown): OutfitPreset[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const presets: OutfitPreset[] = []
  for (const entry of value) {
    const preset = sanitizeOutfitPreset(entry)
    if (!preset || ids.has(preset.id)) continue
    ids.add(preset.id)
    presets.push(preset)
  }
  return presets
}

export function makeOutfitPreset(
  id: string,
  name: unknown,
  appearance: Readonly<PlayerAppearance>,
  updatedAt: number,
): OutfitPreset {
  if (!validatePlayerAppearance(appearance) || !resolveAccessoryFit(appearance.body, appearance.accessory).safe)
    throw new Error('Cannot persist an invalid or unsafe player appearance.')
  return {
    version: OUTFIT_PRESET_VERSION,
    id,
    name: sanitizeOutfitPresetName(name),
    appearance: clonePlayerAppearance(appearance),
    updatedAt,
  }
}

export class LocalOutfitPresetRepository implements OutfitPresetRepository {
  constructor(private readonly storage: Storage | undefined, private readonly key: string) {}
  load(): OutfitPresetEnvelope {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(this.key) ?? 'null')
      const source = parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 1 && Array.isArray((parsed as { records?: unknown }).records)
        ? (parsed as { records: unknown[] }).records : Array.isArray(parsed) ? parsed : []
      const records: OutfitPresetRecord[] = []
      const quarantined: unknown[] = []
      for (const entry of source) {
        const record = sanitizeOutfitPresetRecord(entry)
        if (record) records.push(record)
        else quarantined.push(entry)
      }
      return Object.freeze({ version: 1, records: Object.freeze(records), quarantined: Object.freeze(quarantined) })
    } catch { return Object.freeze({ version: 1, records: Object.freeze([]), quarantined: Object.freeze([]) }) }
  }
  save(envelope: OutfitPresetEnvelope): void {
    const invalid = envelope.records.find((record) => !sanitizeOutfitPresetRecord(record))
    if (invalid) throw new Error('Refusing to persist an invalid outfit preset.')
    this.storage?.setItem(this.key, JSON.stringify(envelope))
  }
}
