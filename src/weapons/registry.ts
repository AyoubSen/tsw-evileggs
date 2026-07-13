export type WeaponId =
  'basic-rocket' | 'timed-grenade' | 'scatter-shot' | 'cluster-charge' | 'teleporter'
export const WEAPON_REGISTRY_VERSION = 'weapons-2'
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
  windSensitivity: number
  knockbackForce: number
  fuseSeconds: number
  bounceRestitution: number
  bounceHorizontalRetention: number
  pelletCount: number
  pelletRange: number
  pelletSpreadRadians: number
  clusterChildCount: number
  clusterChildDamage: number
  clusterChildSpeed: number
  clusterChildLift: number
  teleportEdgeMargin: number
  teleportSurfaceGap: readonly [number, number]
  teleportPlayerClearance: number
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
    id: 'basic-rocket',
    displayName: 'Basic Rocket',
    description: 'Reliable explosive rocket',
    ammunition: 'unlimited',
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 55,
    blastRadius: 72,
    terrainRadius: 40,
    projectileSpeed: 950,
    gravityScale: 1,
    windSensitivity: 1,
    knockbackForce: 450,
    fuseSeconds: 0,
    bounceRestitution: 0,
    bounceHorizontalRetention: 0,
    pelletCount: 0,
    pelletRange: 0,
    pelletSpreadRadians: 0,
    clusterChildCount: 0,
    clusterChildDamage: 0,
    clusterChildSpeed: 0,
    clusterChildLift: 0,
    teleportEdgeMargin: 0,
    teleportSurfaceGap: [0, 0],
    teleportPlayerClearance: 0,
  },
  'timed-grenade': {
    id: 'timed-grenade',
    displayName: 'Timed Grenade',
    description: 'Bounces, then detonates after 3 seconds',
    ammunition: 3,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 52,
    blastRadius: 64,
    terrainRadius: 35,
    projectileSpeed: 760,
    gravityScale: 1,
    windSensitivity: 0.9,
    knockbackForce: 390,
    fuseSeconds: 3,
    bounceRestitution: 0.44,
    bounceHorizontalRetention: 0.52,
    pelletCount: 0,
    pelletRange: 0,
    pelletSpreadRadians: 0,
    clusterChildCount: 0,
    clusterChildDamage: 0,
    clusterChildSpeed: 0,
    clusterChildLift: 0,
    teleportEdgeMargin: 0,
    teleportSurfaceGap: [0, 0],
    teleportPlayerClearance: 0,
  },
  'scatter-shot': {
    id: 'scatter-shot',
    displayName: 'Scatter Shot',
    description: 'Short-range burst of 7 pellets',
    ammunition: 3,
    powerMode: 'fixed',
    aimMode: 'directional',
    baseDamage: 12,
    blastRadius: 0,
    terrainRadius: 0,
    projectileSpeed: 0,
    gravityScale: 0,
    windSensitivity: 0,
    knockbackForce: 72,
    fuseSeconds: 0,
    bounceRestitution: 0,
    bounceHorizontalRetention: 0,
    pelletCount: 7,
    pelletRange: 240,
    pelletSpreadRadians: 0.055,
    clusterChildCount: 0,
    clusterChildDamage: 0,
    clusterChildSpeed: 0,
    clusterChildLift: 0,
    teleportEdgeMargin: 0,
    teleportSurfaceGap: [0, 0],
    teleportPlayerClearance: 0,
  },
  'cluster-charge': {
    id: 'cluster-charge',
    displayName: 'Cluster Charge',
    description: 'Splits into 5 smaller explosives',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 25,
    blastRadius: 44,
    terrainRadius: 23,
    projectileSpeed: 820,
    gravityScale: 1,
    windSensitivity: 0.8,
    knockbackForce: 230,
    fuseSeconds: 0,
    bounceRestitution: 0,
    bounceHorizontalRetention: 0,
    pelletCount: 0,
    pelletRange: 0,
    pelletSpreadRadians: 0,
    clusterChildCount: 5,
    clusterChildDamage: 25,
    clusterChildSpeed: 220,
    clusterChildLift: 150,
    teleportEdgeMargin: 0,
    teleportSurfaceGap: [0, 0],
    teleportPlayerClearance: 0,
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
    windSensitivity: 0,
    knockbackForce: 0,
    fuseSeconds: 0,
    bounceRestitution: 0,
    bounceHorizontalRetention: 0,
    pelletCount: 0,
    pelletRange: 0,
    pelletSpreadRadians: 0,
    clusterChildCount: 0,
    clusterChildDamage: 0,
    clusterChildSpeed: 0,
    clusterChildLift: 0,
    teleportEdgeMargin: 20,
    teleportSurfaceGap: [10, 24],
    teleportPlayerClearance: 30,
  },
}

export function validateWeaponRegistry(): boolean {
  return WEAPON_ORDER.every((id) => {
    const weapon = WEAPONS[id]
    const finite = [
      weapon.baseDamage,
      weapon.blastRadius,
      weapon.terrainRadius,
      weapon.projectileSpeed,
      weapon.gravityScale,
      weapon.windSensitivity,
      weapon.knockbackForce,
      weapon.fuseSeconds,
      weapon.bounceRestitution,
      weapon.bounceHorizontalRetention,
      weapon.pelletCount,
      weapon.pelletRange,
      weapon.pelletSpreadRadians,
      weapon.clusterChildCount,
      weapon.clusterChildDamage,
      weapon.clusterChildSpeed,
      weapon.clusterChildLift,
      weapon.teleportEdgeMargin,
      ...weapon.teleportSurfaceGap,
      weapon.teleportPlayerClearance,
    ]
    return (
      finite.every((value) => Number.isFinite(value) && value >= 0) &&
      (weapon.ammunition === 'unlimited' ||
        (Number.isSafeInteger(weapon.ammunition) && weapon.ammunition > 0)) &&
      Number.isSafeInteger(weapon.pelletCount) &&
      Number.isSafeInteger(weapon.clusterChildCount) &&
      weapon.windSensitivity <= 1 &&
      weapon.bounceRestitution <= 1 &&
      weapon.bounceHorizontalRetention <= 1 &&
      weapon.teleportSurfaceGap[0] <= weapon.teleportSurfaceGap[1] &&
      (weapon.aimMode === 'target-position' || weapon.projectileSpeed > 0 || weapon.pelletCount > 0)
    )
  })
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
