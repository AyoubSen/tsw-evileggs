import { describe, expect, it } from 'vitest'
import { LocalMatchSource } from './LocalMatchSource'
import { DEFAULT_PLAYER_APPEARANCES } from '../players/appearanceRegistry'

describe('LocalMatchSource presentation lifecycle', () => {
  it('advances its presentation revision when a restart replaces state', () => {
    const source = new LocalMatchSource({
      mode: '1v1',
      mapId: 'rolling-hills',
      projectileBoundaryMode: 'open',
      playerNames: ['Lumen', 'Morrow'],
      playerAppearances: DEFAULT_PLAYER_APPEARANCES.slice(0, 2).map((appearance) => ({ ...appearance })),
      turnDurationSeconds: 30,
    })
    const matchId = source.state.matchId
    expect(source.presentationRevision).toBe(1)

    source.restart()

    expect(source.presentationRevision).toBe(2)
    expect(source.state.matchId).not.toBe(matchId)
  })
})
