export type Vector = { x: number; y: number }

export type Character = {
  id: string
  name: string
  color: number
  position: Vector
  velocity: Vector
  health: number
  radius: number
  alive: boolean
  grounded: boolean
}

export type ProjectileState = {
  position: Vector
  velocity: Vector
  radius: number
}

export type TurnPhase = 'input' | 'projectile' | 'settling' | 'expired' | 'victory'
