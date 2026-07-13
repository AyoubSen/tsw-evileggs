import type { ProjectileState, Vector } from '../../shared/types'

export function integrateProjectile(
  projectile: ProjectileState,
  gravity: number,
  deltaSeconds: number,
  windAcceleration: number,
): ProjectileState {
  const velocity = {
    x: projectile.velocity.x + windAcceleration * deltaSeconds,
    y: projectile.velocity.y + gravity * deltaSeconds,
  }
  return {
    ...projectile,
    velocity,
    position: {
      x: projectile.position.x + velocity.x * deltaSeconds,
      y: projectile.position.y + velocity.y * deltaSeconds,
    },
  }
}

export function pointOnTrajectory(
  origin: Vector,
  velocity: Vector,
  gravity: number,
  windAcceleration: number,
  time: number,
): Vector {
  return {
    x: origin.x + velocity.x * time + 0.5 * windAcceleration * time * time,
    y: origin.y + velocity.y * time + 0.5 * gravity * time * time,
  }
}

/** Uses the live rocket's semi-implicit fixed step so aiming previews stay truthful. */
export function integratedTrajectory(
  projectile: ProjectileState,
  gravity: number,
  windAcceleration: number,
  stepSeconds: number,
  steps: number,
): ProjectileState[] {
  const points: ProjectileState[] = []
  let current = projectile
  for (let index = 0; index < steps; index += 1) {
    current = integrateProjectile(current, gravity, stepSeconds, windAcceleration)
    points.push(current)
  }
  return points
}
