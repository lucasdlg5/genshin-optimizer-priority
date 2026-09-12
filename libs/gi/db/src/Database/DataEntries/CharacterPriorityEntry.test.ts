import { getPriorityBlockedArtifactIds } from './CharacterPriorityEntry'

describe('getPriorityBlockedArtifactIds', () => {
  const equippedArtifactsByCharacter = {
    Amber: ['a', 'shared', ''],
    Bennett: ['b', 'shared'],
    Kaeya: ['c'],
  } as const

  it('blocks artifacts from higher-priority characters only', () => {
    expect(
      getPriorityBlockedArtifactIds({
        orderedCharacterKeys: ['Amber', 'Bennett', 'Kaeya'],
        targetCharacterKey: 'Kaeya',
        equippedArtifactsByCharacter,
        enabled: true,
      })
    ).toEqual(['a', 'shared', 'b'])
  })

  it('does not block the target or lower-priority characters', () => {
    expect(
      getPriorityBlockedArtifactIds({
        orderedCharacterKeys: ['Amber', 'Bennett', 'Kaeya'],
        targetCharacterKey: 'Bennett',
        equippedArtifactsByCharacter,
        enabled: true,
      })
    ).toEqual(['a', 'shared'])
    expect(
      getPriorityBlockedArtifactIds({
        orderedCharacterKeys: ['Amber', 'Bennett', 'Kaeya'],
        targetCharacterKey: 'Amber',
        equippedArtifactsByCharacter,
        enabled: true,
      })
    ).toEqual([])
  })

  it('is a no-op when disabled or the target is not ordered', () => {
    expect(
      getPriorityBlockedArtifactIds({
        orderedCharacterKeys: ['Amber', 'Bennett'],
        targetCharacterKey: 'Bennett',
        equippedArtifactsByCharacter,
        enabled: false,
      })
    ).toEqual([])
    expect(
      getPriorityBlockedArtifactIds({
        orderedCharacterKeys: ['Amber', 'Bennett'],
        targetCharacterKey: 'Kaeya',
        equippedArtifactsByCharacter,
        enabled: true,
      })
    ).toEqual([])
  })
})
