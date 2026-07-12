export class TerrainMask {
  readonly cells: Uint8Array

  constructor(
    readonly width: number,
    readonly height: number,
    readonly scale = 2,
  ) {
    this.cells = new Uint8Array(width * height)
  }

  fillBelow(surface: (x: number) => number): void {
    for (let x = 0; x < this.width; x += 1) {
      const yStart = Math.max(0, Math.floor(surface(x * this.scale) / this.scale))
      for (let y = yStart; y < this.height; y += 1) this.cells[y * this.width + x] = 1
    }
  }

  isSolid(worldX: number, worldY: number): boolean {
    const x = Math.floor(worldX / this.scale)
    const y = Math.floor(worldY / this.scale)
    return (
      x >= 0 && x < this.width && y >= 0 && y < this.height && this.cells[y * this.width + x] === 1
    )
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
        if (dx * dx + dy * dy <= squaredRadius) this.cells[y * this.width + x] = 0
      }
    }
  }

  surfaceY(worldX: number, fromWorldY = 0): number | null {
    const x = Math.floor(worldX / this.scale)
    if (x < 0 || x >= this.width) return null
    const start = Math.max(0, Math.floor(fromWorldY / this.scale))
    for (let y = start; y < this.height; y += 1) {
      if (this.cells[y * this.width + x] === 1) return y * this.scale
    }
    return null
  }
}
