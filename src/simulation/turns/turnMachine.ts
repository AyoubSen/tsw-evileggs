import type { TurnPhase } from '../../shared/types'

export function nextTurnPhase(
  phase: TurnPhase,
  worldIsSettled: boolean,
  winnerExists: boolean,
): TurnPhase {
  if (winnerExists) return 'victory'
  if (phase === 'projectile') return 'settling'
  if (phase === 'settling' && worldIsSettled) return 'input'
  return phase
}

export function canAcceptPlayerInput(phase: TurnPhase): boolean {
  return phase === 'input'
}

export function advanceTurnTimer(
  phase: TurnPhase,
  remainingSeconds: number,
  deltaSeconds: number,
): number {
  if (phase !== 'input') return remainingSeconds
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds))
}

export function hasTurnExpired(phase: TurnPhase, remainingSeconds: number): boolean {
  return phase === 'input' && remainingSeconds <= 0
}

export function nextActivePlayerIndex(activeIndex: number, playerCount: number): number {
  return playerCount > 0 ? (activeIndex + 1) % playerCount : 0
}

export function winningCharacterIndex(alive: boolean[]): number | null {
  const survivors = alive.reduce<number[]>((result, isAlive, index) => {
    if (isAlive) result.push(index)
    return result
  }, [])
  return survivors.length === 1 ? survivors[0] : null
}
