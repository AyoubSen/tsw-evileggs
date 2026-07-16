export const TERRAIN_MATERIAL = {
  empty: 0,
  soil: 1,
  brick: 2,
  stone: 3,
  steel: 4,
} as const

export type TerrainMaterialId = (typeof TERRAIN_MATERIAL)[keyof typeof TERRAIN_MATERIAL]

export const TERRAIN_MATERIAL_IDS = Object.values(TERRAIN_MATERIAL) as TerrainMaterialId[]

export function isTerrainMaterialId(value: number): value is TerrainMaterialId {
  return TERRAIN_MATERIAL_IDS.includes(value as TerrainMaterialId)
}

export function isDestructibleMaterial(material: TerrainMaterialId): boolean {
  return material === TERRAIN_MATERIAL.soil || material === TERRAIN_MATERIAL.brick
}
