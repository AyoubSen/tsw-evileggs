import { WEAPONS, WEAPON_ORDER, type WeaponId, type WeaponInventory } from '../weapons/registry'

export type ArsenalPresetId = 'standard' | 'classic' | 'chaos' | 'custom'
export type ArsenalRules = { presetId: ArsenalPresetId; ammunition: WeaponInventory }

const standardInventory = (): WeaponInventory =>
  inventoryWith(WEAPON_ORDER.slice(0, 6))

export const MAX_LOADOUT_WEAPONS = 6

const inventoryWith = (
  enabled: readonly WeaponId[],
  overrides: Partial<WeaponInventory> = {},
): WeaponInventory =>
  Object.fromEntries(
    WEAPON_ORDER.map((id) => [id, enabled.includes(id) ? overrides[id] ?? WEAPONS[id].ammunition : 0]),
  ) as WeaponInventory

export const ARSENAL_PRESETS: Record<Exclude<ArsenalPresetId, 'custom'>, ArsenalRules> = {
  standard: { presetId: 'standard', ammunition: standardInventory() },
  classic: {
    presetId: 'classic',
    ammunition: inventoryWith([
      'basic-rocket',
      'high-arc-mortar',
      'timed-grenade',
      'pocket-knife',
      'old-shoe',
    ]),
  },
  chaos: {
    presetId: 'chaos',
    ammunition: inventoryWith(WEAPON_ORDER, {
      'basic-rocket': 'unlimited',
      'pocket-knife': 'unlimited',
      'siege-bazooka': 3,
      'cluster-charge': 4,
      'bomb-beacon': 4,
      'fork-rocket': 4,
      teleporter: 4,
    }),
  },
}

export const DEFAULT_ARSENAL_RULES = cloneArsenalRules(ARSENAL_PRESETS.standard)

export function cloneArsenalRules(rules: ArsenalRules): ArsenalRules {
  return { presetId: rules.presetId, ammunition: { ...rules.ammunition } }
}

export function usableArsenalWeapons(rules: ArsenalRules): WeaponId[] {
  return WEAPON_ORDER.filter((id) => rules.ammunition[id] === 'unlimited' || rules.ammunition[id] > 0)
}

export function detectArsenalPreset(ammunition: WeaponInventory): ArsenalPresetId {
  for (const presetId of ['standard', 'classic', 'chaos'] as const)
    if (WEAPON_ORDER.every((id) => ARSENAL_PRESETS[presetId].ammunition[id] === ammunition[id]))
      return presetId
  return 'custom'
}

export function sanitizeArsenalRules(value: unknown): ArsenalRules {
  if (!value || typeof value !== 'object') return cloneArsenalRules(DEFAULT_ARSENAL_RULES)
  const candidate = value as { ammunition?: Partial<Record<WeaponId, unknown>> }
  const ammunition = Object.fromEntries(
    WEAPON_ORDER.map((id) => {
      const amount = candidate.ammunition?.[id]
      return [
        id,
        amount === 'unlimited' || (Number.isSafeInteger(amount) && Number(amount) >= 0 && Number(amount) <= 99)
          ? amount
          : WEAPONS[id].ammunition,
      ]
    }),
  ) as WeaponInventory
  const isChaos = WEAPON_ORDER.every((id) => ARSENAL_PRESETS.chaos.ammunition[id] === ammunition[id])
  if (!isChaos) {
    const enabled = WEAPON_ORDER.filter((id) => ammunition[id] === 'unlimited' || ammunition[id] > 0)
    for (const id of enabled.slice(MAX_LOADOUT_WEAPONS)) ammunition[id] = 0
  }
  if (!WEAPON_ORDER.some((id) => ammunition[id] === 'unlimited'))
    ammunition['basic-rocket'] = 'unlimited'
  return { presetId: detectArsenalPreset(ammunition), ammunition }
}

export function arsenalSummary(rules: ArsenalRules): string {
  const enabled = usableArsenalWeapons(rules).length
  const unlimited = WEAPON_ORDER.filter((id) => rules.ammunition[id] === 'unlimited').length
  return `${enabled} weapons · ${unlimited} unlimited`
}
