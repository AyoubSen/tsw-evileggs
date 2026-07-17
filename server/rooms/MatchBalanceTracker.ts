import type { MatchEvent } from '../../src/simulation/match/MatchEvent'
import type { WeaponId } from '../../src/weapons/registry'

type WeaponBalanceStats = {
  activations: number
  damage: number
  selfDamage: number
  eliminations: number
  boundaryMisses: number
  totalResolutionTicks: number
  resolvedActions: number
}

export class MatchBalanceTracker {
  private readonly actions = new Map<string, { weaponId: WeaponId; firedAtTick: number }>()
  private readonly projectileActions = new Map<string, string>()
  private readonly lastDamageActionByPlayer = new Map<string, string>()
  private readonly weapons = new Map<WeaponId, WeaponBalanceStats>()
  private activeActionId: string | null = null
  private expiredTurns = 0

  record(events: readonly MatchEvent[]): void {
    for (const event of events) {
      if (event.type === 'weapon-fired') {
        this.actions.set(event.actionId, { weaponId: event.weaponId, firedAtTick: event.tick })
        this.activeActionId = event.actionId
        this.stats(event.weaponId).activations += 1
      } else if (event.type === 'projectile-spawned')
        this.projectileActions.set(event.projectileId, event.actionId)
      else if (event.type === 'player-damaged') {
        const action = this.actions.get(event.sourceActionId)
        if (!action) continue
        const stats = this.stats(action.weaponId)
        stats.damage += event.amount
        if (event.selfDamage) stats.selfDamage += event.amount
        this.lastDamageActionByPlayer.set(event.playerId, event.sourceActionId)
      } else if (event.type === 'player-died') {
        const actionId = this.lastDamageActionByPlayer.get(event.playerId)
        const action = actionId ? this.actions.get(actionId) : undefined
        if (action) this.stats(action.weaponId).eliminations += 1
      } else if (event.type === 'projectile-boundary-removed') {
        const actionId = this.projectileActions.get(event.projectileId)
        const action = actionId ? this.actions.get(actionId) : undefined
        if (action) this.stats(action.weaponId).boundaryMisses += 1
      } else if (event.type === 'turn-expired') this.expiredTurns += 1
      else if (event.type === 'turn-started' && this.activeActionId) {
        const action = this.actions.get(this.activeActionId)
        if (action) {
          const stats = this.stats(action.weaponId)
          stats.totalResolutionTicks += Math.max(0, event.tick - action.firedAtTick)
          stats.resolvedActions += 1
        }
        this.activeActionId = null
      }
    }
  }

  summary(): { expiredTurns: number; weapons: Partial<Record<WeaponId, WeaponBalanceStats>> } {
    return { expiredTurns: this.expiredTurns, weapons: Object.fromEntries(this.weapons) }
  }

  private stats(weaponId: WeaponId): WeaponBalanceStats {
    const current = this.weapons.get(weaponId)
    if (current) return current
    const created: WeaponBalanceStats = {
      activations: 0,
      damage: 0,
      selfDamage: 0,
      eliminations: 0,
      boundaryMisses: 0,
      totalResolutionTicks: 0,
      resolvedActions: 0,
    }
    this.weapons.set(weaponId, created)
    return created
  }
}
