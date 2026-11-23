import type { ICachedWeapon, OptConfig } from '@genshin-optimizer/gi/db'
import {
  deduplicateAndSortWeapons,
  getFilteredWeapons,
} from './weaponFilterUtil'

function makeWeapon(overrides: Partial<ICachedWeapon> = {}): ICachedWeapon {
  return {
    id: 'weapon_1',
    key: 'MistsplitterReforged',
    level: 90,
    ascension: 6,
    refinement: 1,
    location: '',
    lock: false,
    ...overrides,
  }
}

function makeOptConfig(overrides: Partial<OptConfig> = {}): OptConfig {
  return {
    artSetExclusion: {},
    statFilters: {},
    mainStatKeys: { sands: [], goblet: [], circlet: [] },
    excludedLocations: [],
    artExclusion: [],
    useExcludedArts: false,
    optimizationTarget: undefined,
    mainStatAssumptionLevel: 0,
    allowPartial: false,
    maxBuildsToShow: 5,
    plotBase: undefined,
    compareBuild: true,
    levelLow: 20,
    levelHigh: 20,
    useTeammateBuild: false,
    generatedBuildListId: undefined,
    upOptLevelLow: 0,
    upOptLevelHigh: 19,
    upOptReshape: false,
    upOptReshapeRolls: 2,
    upOptDefine: false,
    upOptDefineSubstats: [],
    optWeapon: true,
    weaponLevelLow: 1,
    weaponLevelHigh: 90,
    useEquippedWeapon: false,
    useTeammateWeapon: false,
    weaponExclusion: [],
    ...overrides,
  }
}

describe('weaponFilterUtil', () => {
  const weapons: ICachedWeapon[] = [
    makeWeapon({
      id: 'w_mist_90',
      key: 'MistsplitterReforged',
      level: 90,
      location: 'KamisatoAyaka',
    }),
    makeWeapon({
      id: 'w_black_90',
      key: 'TheBlackSword',
      level: 90,
      refinement: 5,
      location: '',
    }),
    makeWeapon({
      id: 'w_dull_1',
      key: 'DullBlade',
      level: 1,
      ascension: 0,
      location: '',
    }),
    makeWeapon({
      id: 'w_equipped_other',
      key: 'SkywardBlade',
      level: 90,
      location: 'Bennett',
    }),
    makeWeapon({
      id: 'w_teammate',
      key: 'FavoniusSword',
      level: 90,
      location: 'Furina',
    }),
    makeWeapon({
      id: 'w_bow',
      key: 'AquaSimulacra',
      level: 90,
      location: '',
    }),
  ]

  it('filters by weaponType, level range, equipped, teammate, and exclusion', () => {
    const filtered = getFilteredWeapons({
      allWeapons: weapons,
      characterKey: 'KamisatoAyaka',
      optConfig: makeOptConfig({
        weaponLevelLow: 80,
        weaponLevelHigh: 90,
        useEquippedWeapon: false,
        useTeammateWeapon: false,
        weaponExclusion: [],
      }),
      teammateWeaponIds: ['w_teammate'],
      currentWeaponId: 'w_mist_90',
    })

    expect(filtered.map((w) => w.id)).toEqual(['w_mist_90', 'w_black_90'])
  })

  it('includes equipped and teammate weapons when flags are enabled', () => {
    const filtered = getFilteredWeapons({
      allWeapons: weapons,
      characterKey: 'KamisatoAyaka',
      optConfig: makeOptConfig({
        weaponLevelLow: 80,
        weaponLevelHigh: 90,
        useEquippedWeapon: true,
        useTeammateWeapon: true,
        weaponExclusion: ['w_black_90'],
      }),
      teammateWeaponIds: ['w_teammate'],
      currentWeaponId: 'w_mist_90',
    })

    expect(filtered.map((w) => w.id)).toEqual([
      'w_mist_90',
      'w_equipped_other',
      'w_teammate',
    ])
  })

  it('deduplicates identical weapons preferring current/unequipped and sorts current first then rarity', () => {
    const dupes: ICachedWeapon[] = [
      makeWeapon({
        id: 'w_four_star',
        key: 'TheBlackSword',
        level: 90,
        refinement: 5,
        location: '',
      }),
      makeWeapon({
        id: 'w_mist_equipped_other',
        key: 'MistsplitterReforged',
        level: 90,
        ascension: 6,
        refinement: 1,
        location: 'Bennett',
      }),
      makeWeapon({
        id: 'w_mist_free',
        key: 'MistsplitterReforged',
        level: 90,
        ascension: 6,
        refinement: 1,
        location: '',
      }),
      makeWeapon({
        id: 'w_skyward_current',
        key: 'SkywardBlade',
        level: 80,
        ascension: 5,
        refinement: 1,
        location: 'KamisatoAyaka',
      }),
    ]

    const result = deduplicateAndSortWeapons(
      dupes,
      'KamisatoAyaka',
      'w_skyward_current'
    )

    expect(result.map((w) => w.id)).toEqual([
      'w_skyward_current',
      'w_mist_free',
      'w_four_star',
    ])
  })
})
