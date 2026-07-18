import {
  TERRAIN_MATERIAL,
  isDestructibleMaterial,
  type TerrainMaterialId,
} from './materials'

export class TerrainMask {
  readonly cells: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
    readonly scale = 2,
    sourceCells?: Uint8Array,
  ) {
    this.cells = sourceCells ? new Uint8Array(sourceCells) : new Uint8Array(width * height)
    if (this.cells.length !== width * height) throw new Error('Terrain cell count is invalid.')
  }

  fillBelow(
    surface: (x: number) => number,
    material: Exclude<TerrainMaterialId, 0> = TERRAIN_MATERIAL.soil,
  ): void {
    for (let x = 0; x < this.width; x += 1) {
      const yStart = Math.max(0, Math.floor(surface(x * this.scale) / this.scale))
      for (let y = yStart; y < this.height; y += 1) this.cells[y * this.width + x] = material
    }
  }

  materialAt(worldX: number, worldY: number): TerrainMaterialId {
    const x = Math.floor(worldX / this.scale)
    const y = Math.floor(worldY / this.scale)
    if (x < 0 || x >= this.width || y < 0 || y >= this.height)
      return TERRAIN_MATERIAL.empty
    return this.cells[y * this.width + x] as TerrainMaterialId
  }

  isSolid(worldX: number, worldY: number): boolean {
    return this.materialAt(worldX, worldY) !== TERRAIN_MATERIAL.empty
  }

  removeCircle(worldX: number, worldY: number, radius: number): void {
    const centerX = worldX / this.scale
    const centerY = worldY / this.scale
    const cellRadius = radius / this.scale
    const squaredRadius = cellRadius * cellRadius
    const minX = Math.max(0, Math.floor(centerX - cellRadius))
    const maxX = Math.min(this.width - 1, Math.ceil(centerX + cellRadius))
    const minY = Math.max(0, Math.floor(centerY - cellRadius))
    const maxY = Math.min(this.height - 1, Math.ceil(centerY + cellRadius))
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - centerX
        const dy = y + 0.5 - centerY
        const index = y * this.width + x
        const material = this.cells[index] as TerrainMaterialId
        if (dx * dx + dy * dy <= squaredRadius && isDestructibleMaterial(material))
          this.cells[index] = TERRAIN_MATERIAL.empty
      }
    }
  }

  addRing(worldX: number, worldY: number, innerRadius: number, outerRadius: number): void {
    const centerX = worldX / this.scale
    const centerY = worldY / this.scale
    const inner = innerRadius / this.scale
    const outer = outerRadius / this.scale
    const minX = Math.max(0, Math.floor(centerX - outer))
    const maxX = Math.min(this.width - 1, Math.ceil(centerX + outer))
    const minY = Math.max(0, Math.floor(centerY - outer))
    const maxY = Math.min(this.height - 1, Math.ceil(centerY + outer))
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x + 0.5 - centerX
        const dy = y + 0.5 - centerY
        const distanceSquared = dx * dx + dy * dy
        const index = y * this.width + x
        if (
          distanceSquared >= inner * inner &&
          distanceSquared <= outer * outer &&
          this.cells[index] === TERRAIN_MATERIAL.empty
        )
          this.cells[index] = TERRAIN_MATERIAL.soil
      }
    }
  }

  surfaceY(worldX: number, fromWorldY = 0): number | null {
    const x = Math.floor(worldX / this.scale)
    if (x < 0 || x >= this.width) return null
    const start = Math.max(0, Math.floor(fromWorldY / this.scale))
    for (let y = start; y < this.height; y += 1) {
      if (this.cells[y * this.width + x] !== TERRAIN_MATERIAL.empty) return y * this.scale
    }
    return null
  }
}
