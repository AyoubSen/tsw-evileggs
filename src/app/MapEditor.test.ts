import { describe, expect, it } from 'vitest'
import { migrateStoredDraft } from './MapEditor'

describe('editor draft migration', () => {
  it('preserves a v1 draft and adds current object and boundary defaults', () => {
    const migrated = migrateStoredDraft({
      version: 1,
      id: 'saved-map',
      revision: 3,
      mode: '1v1',
      displayName: 'Saved Map',
      description: 'Persisted before map objects shipped.',
      label: 'Saved',
      width: 320,
      height: 180,
      cellSize: 2,
      theme: {
        sky: 1,
        sun: 2,
        backHill: 3,
        terrain: 4,
        surface: 5,
        dust: 6,
        brick: 7,
        stone: 8,
        steel: 9,
      },
      cells: new Uint8Array(160 * 90),
      spawns: [],
    })
    expect(migrated).toMatchObject({
      version: 3,
      id: 'saved-map',
      revision: 3,
      objects: [],
      projectileBoundary: {
        defaultMode: 'open',
        supportedModes: ['open', 'reflect', 'wrap'],
      },
    })
  })
})
