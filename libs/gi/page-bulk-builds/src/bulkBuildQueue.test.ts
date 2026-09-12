import { describe, expect, it } from 'vitest'
import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'
import {
  BulkBuildQueue,
  orderBulkBuildSelections,
  resolveBulkBuildSelection,
} from './bulkBuildQueue'

const selection = (characterKey: string): BulkBuildSelection => ({
  characterKey,
  mode: 'solo',
})

describe('orderBulkBuildSelections', () => {
  it('runs selected characters in persisted priority order', () => {
    expect(
      orderBulkBuildSelections(
        [selection('amber'), selection('raiden'), selection('nahida')],
        ['nahida', 'raiden', 'amber']
      ).map(({ characterKey }) => characterKey)
    ).toEqual(['nahida', 'raiden', 'amber'])
  })

  it('uses a deterministic key order for characters without priority', () => {
    expect(
      orderBulkBuildSelections([selection('zeta'), selection('alpha')], []).map(
        ({ characterKey }) => characterKey
      )
    ).toEqual(['alpha', 'zeta'])
  })
})

describe('BulkBuildQueue', () => {
  it('does not start the next item before the previous runner resolves', async () => {
    const queue = new BulkBuildQueue()
    const events: string[] = []
    await queue.run(
      [selection('a'), selection('b')],
      async ({ characterKey }) => {
        events.push(`start:${characterKey}`)
        await Promise.resolve()
        events.push(`end:${characterKey}`)
      }
    )
    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
  })
})

describe('resolveBulkBuildSelection', () => {
  it('rejects a saved team that does not contain the selected character', () => {
    expect(() =>
      resolveBulkBuildSelection(
        { characterKey: 'amber', mode: 'team', teamId: 'team-1' },
        { 'team-1': ['raiden'] }
      )
    ).toThrow('does not contain amber')
  })
})
