import { createTestDBStorage } from '@genshin-optimizer/common/database'
import { ArtCharDatabase } from '../ArtCharDatabase'

describe('DisplayBulkBuildsEntry', () => {
  it('removes unknown characters and falls back from unknown teams', () => {
    const database = new ArtCharDatabase(1, createTestDBStorage('go'))
    database.chars.set('Amber', { key: 'Amber' })
    const result = database.displayBulkBuilds['validate']({
      selections: [
        { characterKey: 'Amber', mode: 'team', teamId: 'missing' },
        { characterKey: 'Unknown', mode: 'solo' },
      ],
      priorityEnabled: true,
      stopOnError: false,
    })
    expect(result).toEqual({
      selections: [{ characterKey: 'Amber', mode: 'solo' }],
      priorityEnabled: true,
      stopOnError: false,
    })
  })
})
