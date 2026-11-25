import type { ICachedWeapon } from '@genshin-optimizer/gi/db'
import { UIData } from '@genshin-optimizer/gi/uidata'
import { constant } from '@genshin-optimizer/gi/wr'
import { describe, expect, it } from 'vitest'
import {
  buildMaxWeaponConditionals,
  getUniqueBestWeaponsAndExclusion,
} from './maxWeaponCondsUtil'

describe('maxWeaponCondsUtil', () => {
  it('keeps only 1 best copy per unique WeaponKey without repeating weapons', () => {
    const mockWeapons: ICachedWeapon[] = [
      {
        id: 'fav_1',
        key: 'FavoniusSword',
        level: 80,
        ascension: 5,
        refinement: 5,
        location: '',
        lock: false,
      },
      {
        id: 'fav_2',
        key: 'FavoniusSword',
        level: 90,
        ascension: 6,
        refinement: 5,
        location: 'Xingqiu',
        lock: true,
      },
      {
        id: 'fav_3',
        key: 'FavoniusSword',
        level: 90,
        ascension: 6,
        refinement: 2,
        location: '',
        lock: false,
      },
      {
        id: 'mist_1',
        key: 'MistsplitterReforged',
        level: 90,
        ascension: 6,
        refinement: 1,
        location: 'Ayaka',
        lock: true,
      },
      {
        id: 'homa_1',
        key: 'StaffOfHoma',
        level: 90,
        ascension: 6,
        refinement: 1,
        location: 'HuTao',
        lock: true,
      },
    ]

    const { weaponExclusion, keptWeapons, keptWeaponKeys } =
      getUniqueBestWeaponsAndExclusion({
        allWeapons: mockWeapons,
        characterKey: 'Furina',
        existingWeaponExclusion: ['other_polearm_id'],
      })

    expect(keptWeaponKeys).toEqual(['FavoniusSword', 'MistsplitterReforged'])
    expect(keptWeapons.map((w) => w.id)).toEqual(['fav_2', 'mist_1'])
    expect(weaponExclusion).toEqual(['other_polearm_id', 'fav_1', 'fav_3'])
  })

  it('activates max weapon conditional states accurately across special and stack weapons', () => {
    const swordData = new UIData({ charKey: constant('Furina') }, undefined)
    const swordConds = buildMaxWeaponConditionals({}, 'Furina', swordData)
    expect(swordConds.MistsplitterReforged?.MistsplittersEmblem).toBe('3')
    expect(swordConds.SplendorOfTranquilWaters?.selfHpChange).toBe('3')
    expect(swordConds.SplendorOfTranquilWaters?.teamHpChange).toBe('2')
    expect(swordConds.MoonweaversDawn?.energy).toBe('40')

    const bowData = new UIData({ charKey: constant('Yoimiya') }, undefined)
    const bowConds = buildMaxWeaponConditionals({}, 'Yoimiya', bowData)
    expect(bowConds.Slingshot?.Slingshot).toBe('less')
    expect(bowConds.PolarStar?.GoldenMajesty).toBe('4')
    expect(bowConds.FadingTwilight?.state).toBe('dawnblaze')

    const polearmData = new UIData(
      { charKey: constant('Arlecchino') },
      undefined
    )
    const polearmConds = buildMaxWeaponConditionals(
      {},
      'Arlecchino',
      polearmData
    )
    expect(polearmConds.Deathmatch?.stack).toBe('oneOrNone')
    expect(polearmConds.CrimsonMoonsSemblance?.bond).toBe('2')
    expect(polearmConds.WavebreakersFin?.WatatsumiWavewalker).toBe('360')

    const catalystData = new UIData(
      { charKey: constant('Neuvillette') },
      undefined
    )
    const catalystConds = buildMaxWeaponConditionals(
      {},
      'Neuvillette',
      catalystData
    )
    expect(catalystConds.TheWidsith?.Debut).toBe('aria')
    expect(catalystConds.HakushinRing?.SakuraSaiguu).toBe('hydro')

    const claymoreData = new UIData({ charKey: constant('Mavuika') }, undefined)
    const claymoreConds = buildMaxWeaponConditionals(
      {},
      'Mavuika',
      claymoreData
    )
    expect(Object.keys(claymoreConds).length).toBeGreaterThan(10)
  })
})
