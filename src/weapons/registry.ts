import { BASIC_ROCKET } from './basicRocket'

export type WeaponId =
  'basic-rocket' | 'timed-grenade' | 'scatter-shot' | 'cluster-charge' | 'teleporter'
export const WEAPON_REGISTRY_VERSION = 'weapons-1'
export type WeaponDefinition = {
  id: WeaponId
  displayName: string
  description: string
  ammunition: number | 'unlimited'
  powerMode: 'variable' | 'fixed'
  aimMode: 'directional' | 'target-position'
  baseDamage: number
  blastRadius: number
  terrainRadius: number
  projectileSpeed: number
  gravityScale: number
  knockbackForce: number
}

export const WEAPON_ORDER: WeaponId[] = [
  'basic-rocket',
  'timed-grenade',
  'scatter-shot',
  'cluster-charge',
  'teleporter',
]

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'basic-rocket': {
    ...BASIC_ROCKET,
    id: 'basic-rocket',
    description: 'Reliable explosive rocket',
    ammunition: 'unlimited',
    powerMode: 'variable',
    aimMode: 'directional',
  },
  'timed-grenade': {
    id: 'timed-grenade',
    displayName: 'Timed Grenade',
    description: 'Bounces, then detonates after 3 seconds',
    ammunition: 3,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 48,
    blastRadius: 62,
    terrainRadius: 34,
    projectileSpeed: 760,
    gravityScale: 1,
    knockbackForce: 370,
  },
  'scatter-shot': {
    id: 'scatter-shot',
    displayName: 'Scatter Shot',
    description: 'Short-range burst of 7 pellets',
    ammunition: 3,
    powerMode: 'fixed',
    aimMode: 'directional',
    baseDamage: 14,
    blastRadius: 0,
    terrainRadius: 0,
    projectileSpeed: 0,
    gravityScale: 0,
    knockbackForce: 105,
  },
  'cluster-charge': {
    id: 'cluster-charge',
    displayName: 'Cluster Charge',
    description: 'Splits into 5 smaller explosives',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 32,
    blastRadius: 48,
    terrainRadius: 26,
    projectileSpeed: 820,
    gravityScale: 1,
    knockbackForce: 290,
  },
  teleporter: {
    id: 'teleporter',
    displayName: 'Teleporter',
    description: 'Point at safe ground to relocate',
    ammunition: 2,
    powerMode: 'fixed',
    aimMode: 'target-position',
    baseDamage: 0,
    blastRadius: 0,
    terrainRadius: 0,
    projectileSpeed: 0,
    gravityScale: 0,
    knockbackForce: 0,
  },
}

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && value in WEAPONS
}

export type WeaponInventory = Record<WeaponId, number | 'unlimited'>
export function createWeaponInventory(): WeaponInventory {
  return Object.fromEntries(
    WEAPON_ORDER.map((id) => [id, WEAPONS[id].ammunition]),
  ) as WeaponInventory
}
export function canUseWeapon(inventory: WeaponInventory, id: WeaponId): boolean {
  return inventory[id] === 'unlimited' || inventory[id] > 0
}
export function consumeWeapon(inventory: WeaponInventory, id: WeaponId): WeaponInventory {
  return inventory[id] === 'unlimited' ? inventory : { ...inventory, [id]: inventory[id] - 1 }
}
