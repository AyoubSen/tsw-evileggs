export type WeaponDefinition = {
  id: string
  displayName: string
  baseDamage: number
  blastRadius: number
  terrainRadius: number
  projectileSpeed: number
  gravityScale: number
  knockbackForce: number
}

export const BASIC_ROCKET: WeaponDefinition = {
  id: 'basic-rocket',
  displayName: 'Basic Rocket',
  baseDamage: 58,
  blastRadius: 74,
  terrainRadius: 42,
  projectileSpeed: 950,
  gravityScale: 1,
  knockbackForce: 480,
}

export function validateWeapon(weapon: WeaponDefinition): boolean {
  return (
    weapon.id.length > 0 &&
    weapon.displayName.length > 0 &&
    weapon.baseDamage > 0 &&
    weapon.blastRadius > 0 &&
    weapon.terrainRadius > 0 &&
    weapon.projectileSpeed > 0 &&
    weapon.gravityScale >= 0 &&
    weapon.knockbackForce >= 0
  )
}
