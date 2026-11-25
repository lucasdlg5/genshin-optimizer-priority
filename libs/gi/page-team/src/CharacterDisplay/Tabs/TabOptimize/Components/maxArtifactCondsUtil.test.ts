import { objKeyMap } from '@genshin-optimizer/common/util'
import { allArtifactSetKeys } from '@genshin-optimizer/gi/consts'
import { UIData } from '@genshin-optimizer/gi/uidata'
import { constant } from '@genshin-optimizer/gi/wr'
import { allNonstackBuffs } from '@genshin-optimizer/gi/wr-types'
import { buildMaxArtifactConditionals } from './maxArtifactCondsUtil'

describe('buildMaxArtifactConditionals', () => {
  it('activates single-state, numeric max-stack, elemental, and multi-state artifact conditionals without setting Gilded Dreams manual overrides', () => {
    const fakeData = new UIData(
      {
        charKey: constant('KamisatoAyaka'),
        artSet: objKeyMap(allArtifactSetKeys, () => constant(4)),
        nonStacking: objKeyMap(allNonstackBuffs, () =>
          constant('KamisatoAyaka')
        ),
      },
      undefined
    )

    const result = buildMaxArtifactConditionals({}, 'KamisatoAyaka', fakeData)

    // Crimson Witch of Flames max stack = '3'
    expect(result.CrimsonWitchOfFlames?.stack).toBe('3')
    // Marechaussee Hunter max stack = '3'
    expect(result.MarechausseeHunter).toBeDefined()
    expect(Object.values(result.MarechausseeHunter ?? {})).toContain('3')
    // Song of Days Past max healing = '15000'
    expect(result.SongOfDaysPast?.healing).toBe('15000')
    // Blizzard Strayer highest option = 'frozen'
    expect(Object.values(result.BlizzardStrayer ?? {})).toContain('frozen')
    // Archaic Petra matches Cryo character element
    expect(result.ArchaicPetra?.element).toBe('cryo')
    // Gilded Dreams activates passive='on' without setting overrideSameNum / overrideOtherNum
    expect(result.GildedDreams?.passive).toBe('on')
    expect(result.GildedDreams?.overrideSameNum).toBeUndefined()
    expect(result.GildedDreams?.overrideOtherNum).toBeUndefined()
    // Viridescent Venerer multiple states all enabled
    expect(result.ViridescentVenerer?.swirlcryo).toBe('cryo')
    expect(result.ViridescentVenerer?.swirlpyro).toBe('pyro')
  })
})
