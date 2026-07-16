export type WeaponId =
  | 'basic-rocket'
  | 'precision-cannon'
  | 'high-arc-mortar'
  | 'timed-grenade'
  | 'scatter-shot'
  | 'cluster-charge'
  | 'terrain-boring-drill'
  | 'deployable-mine'
  | 'pocket-knife'
  | 'bomb-beacon'
  | 'fork-rocket'
  | 'old-shoe'
  | 'siege-bazooka'
  | 'cryo-shot'
  | 'teleporter'
export const WEAPON_REGISTRY_VERSION = 'weapons-4'
export type WeaponMechanic =
  | 'projectile'
  | 'timed-bounce'
  | 'scatter'
  | 'cluster'
  | 'teleport'
  | 'drill'
  | 'mine'
  | 'melee'
  | 'beacon'
  | 'remote-split'
  | 'freeze'
export type WeaponDefinition = {
  id: WeaponId
  mechanic: WeaponMechanic
  displayName: string
  description: string
  ammunition: number | 'unlimited'
  powerMode: 'variable' | 'fixed'
  aimMode: 'directional' | 'target-position' | 'self'
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
  drillDistance: number
  drillRadius: number
  mineRadius: number
  mineTriggerRadius: number
  teleportEdgeMargin: number
  teleportPlayerClearance: number
  meleeRange?: number
  beaconDelaySeconds?: number
  beaconBombCount?: number
  beaconBombSpacing?: number
  remoteSplitAngleRadians?: number
  freezeTurns?: number
}

export const WEAPON_ORDER: WeaponId[] = [
  'basic-rocket',
  'precision-cannon',
  'high-arc-mortar',
  'timed-grenade',
  'scatter-shot',
  'cluster-charge',
  'terrain-boring-drill',
  'deployable-mine',
  'pocket-knife',
  'bomb-beacon',
  'fork-rocket',
  'old-shoe',
  'siege-bazooka',
  'cryo-shot',
  'teleporter',
]

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'basic-rocket': {
    id: 'basic-rocket',
    mechanic: 'projectile',
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'precision-cannon': {
    id: 'precision-cannon',
    mechanic: 'projectile',
    displayName: 'Precision Cannon',
    description: 'Fast, low-drift shot with a tight blast',
    ammunition: 3,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 76,
    blastRadius: 30,
    terrainRadius: 14,
    projectileSpeed: 1480,
    gravityScale: 0.18,
    windSensitivity: 0.12,
    knockbackForce: 270,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'high-arc-mortar': {
    id: 'high-arc-mortar',
    mechanic: 'projectile',
    displayName: 'High-Arc Mortar',
    description: 'Heavy shell for steep shots over cover',
    ammunition: 3,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 64,
    blastRadius: 84,
    terrainRadius: 47,
    projectileSpeed: 610,
    gravityScale: 1.55,
    windSensitivity: 0.72,
    knockbackForce: 470,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'timed-grenade': {
    id: 'timed-grenade',
    mechanic: 'timed-bounce',
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'scatter-shot': {
    id: 'scatter-shot',
    mechanic: 'scatter',
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'cluster-charge': {
    id: 'cluster-charge',
    mechanic: 'cluster',
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'terrain-boring-drill': {
    id: 'terrain-boring-drill',
    mechanic: 'drill',
    displayName: 'Terrain-Boring Drill',
    description: 'Carves through destructible ground before detonating',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 48,
    blastRadius: 46,
    terrainRadius: 24,
    projectileSpeed: 860,
    gravityScale: 0.08,
    windSensitivity: 0,
    knockbackForce: 300,
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
    drillDistance: 126,
    drillRadius: 11,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'deployable-mine': {
    id: 'deployable-mine',
    mechanic: 'mine',
    displayName: 'Deployable Mine',
    description: 'Persistent proximity trap that ignores allies',
    ammunition: 3,
    powerMode: 'fixed',
    aimMode: 'self',
    baseDamage: 68,
    blastRadius: 66,
    terrainRadius: 30,
    projectileSpeed: 0,
    gravityScale: 0,
    windSensitivity: 0,
    knockbackForce: 420,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 7,
    mineTriggerRadius: 44,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'pocket-knife': {
    id: 'pocket-knife',
    mechanic: 'melee',
    displayName: 'Pocket Knife',
    description: 'Unlimited close-range strike blocked by terrain',
    ammunition: 'unlimited',
    powerMode: 'fixed',
    aimMode: 'directional',
    baseDamage: 36,
    blastRadius: 0,
    terrainRadius: 0,
    projectileSpeed: 0,
    gravityScale: 0,
    windSensitivity: 0,
    knockbackForce: 180,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
    meleeRange: 44,
  },
  'bomb-beacon': {
    id: 'bomb-beacon',
    mechanic: 'beacon',
    displayName: 'Bomb Beacon',
    description: 'Marks a delayed three-bomb obstacle-blocked barrage',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 32,
    blastRadius: 50,
    terrainRadius: 25,
    projectileSpeed: 720,
    gravityScale: 1,
    windSensitivity: 0.75,
    knockbackForce: 260,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
    beaconDelaySeconds: 1.5,
    beaconBombCount: 3,
    beaconBombSpacing: 42,
  },
  'fork-rocket': {
    id: 'fork-rocket',
    mechanic: 'remote-split',
    displayName: 'Fork Rocket',
    description: 'Press Space in flight to split it into two rockets',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 42,
    blastRadius: 48,
    terrainRadius: 25,
    projectileSpeed: 900,
    gravityScale: 0.8,
    windSensitivity: 0.65,
    knockbackForce: 290,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
    remoteSplitAngleRadians: 0.18,
  },
  'old-shoe': {
    id: 'old-shoe',
    mechanic: 'projectile',
    displayName: 'Old Shoe',
    description: 'Tiny damage with humiliating knockback',
    ammunition: 3,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 8,
    blastRadius: 20,
    terrainRadius: 0,
    projectileSpeed: 700,
    gravityScale: 1.1,
    windSensitivity: 1,
    knockbackForce: 620,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'siege-bazooka': {
    id: 'siege-bazooka',
    mechanic: 'projectile',
    displayName: 'Siege Bazooka',
    description: 'Single colossal rocket with a devastating crater',
    ammunition: 1,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 92,
    blastRadius: 118,
    terrainRadius: 72,
    projectileSpeed: 740,
    gravityScale: 1,
    windSensitivity: 0.8,
    knockbackForce: 650,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
  },
  'cryo-shot': {
    id: 'cryo-shot',
    mechanic: 'freeze',
    displayName: 'Cryo Shot',
    description: 'Freezes movement during the victim’s next turn',
    ammunition: 2,
    powerMode: 'variable',
    aimMode: 'directional',
    baseDamage: 20,
    blastRadius: 34,
    terrainRadius: 0,
    projectileSpeed: 880,
    gravityScale: 0.75,
    windSensitivity: 0.5,
    knockbackForce: 120,
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 0,
    teleportPlayerClearance: 0,
    freezeTurns: 1,
  },
  teleporter: {
    id: 'teleporter',
    mechanic: 'teleport',
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
    drillDistance: 0,
    drillRadius: 0,
    mineRadius: 0,
    mineTriggerRadius: 0,
    teleportEdgeMargin: 20,
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
      weapon.drillDistance,
      weapon.drillRadius,
      weapon.mineRadius,
      weapon.mineTriggerRadius,
      weapon.teleportEdgeMargin,
      weapon.teleportPlayerClearance,
      weapon.meleeRange ?? 0,
      weapon.beaconDelaySeconds ?? 0,
      weapon.beaconBombCount ?? 0,
      weapon.beaconBombSpacing ?? 0,
      weapon.remoteSplitAngleRadians ?? 0,
      weapon.freezeTurns ?? 0,
    ]
    return (
      finite.every((value) => Number.isFinite(value) && value >= 0) &&
      (weapon.ammunition === 'unlimited' ||
        (Number.isSafeInteger(weapon.ammunition) && weapon.ammunition > 0)) &&
      Number.isSafeInteger(weapon.pelletCount) &&
      Number.isSafeInteger(weapon.clusterChildCount) &&
      Number.isSafeInteger(weapon.beaconBombCount ?? 0) &&
      Number.isSafeInteger(weapon.freezeTurns ?? 0) &&
      weapon.windSensitivity <= 1 &&
      weapon.bounceRestitution <= 1 &&
      weapon.bounceHorizontalRetention <= 1 &&
      (weapon.aimMode !== 'directional' ||
        weapon.projectileSpeed > 0 ||
        weapon.pelletCount > 0 ||
        weapon.mechanic === 'melee') &&
      (weapon.mechanic !== 'mine' ||
        (weapon.aimMode === 'self' && weapon.mineRadius > 0 && weapon.mineTriggerRadius > 0))
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
