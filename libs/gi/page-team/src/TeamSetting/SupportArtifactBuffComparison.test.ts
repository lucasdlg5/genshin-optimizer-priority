import { createTestDBStorage } from '@genshin-optimizer/common/database'
import { ArtCharDatabase } from '@genshin-optimizer/gi/db'
import { describe, expect, it } from 'vitest'
import { computeSupportArtifactBuffComparison } from './SupportArtifactBuffComparison'

describe('computeSupportArtifactBuffComparison', () => {
  it('computes numeric and percentage gains for Custom Multi-Targets (fixing Team Settings visibility) and Optimize build overrides', () => {
    const db = new ArtCharDatabase(1, createTestDBStorage('go'))

    db.chars.getWithInitWeapon('Navia')
    db.chars.set('Navia', {
      key: 'Navia',
      level: 90,
      ascension: 6,
      constellation: 0,
      talent: { auto: 9, skill: 10, burst: 9 },
    })
    db.chars.getWithInitWeapon('Zhongli')
    db.chars.set('Zhongli', {
      key: 'Zhongli',
      level: 90,
      ascension: 6,
      constellation: 0,
      talent: { auto: 1, skill: 9, burst: 8 },
    })

    const naviaTcId = db.teamChars.new('Navia', {
      customMultiTargets: [
        {
          name: 'Rotacao Navia',
          targets: [
            {
              weight: 2,
              path: ['skill', 'totalShardDmg'],
              hitMode: 'avgHit',
              bonusStats: {},
            },
            {
              weight: 4,
              path: ['normal', '0'],
              hitMode: 'avgHit',
              bonusStats: {},
            },
          ],
        },
      ],
    })
    const zhongliTcId = db.teamChars.new('Zhongli')

    const teamId = db.teams.new({
      name: 'Geo Team',
      loadoutData: [
        { teamCharId: naviaTcId } as never,
        { teamCharId: zhongliTcId } as never,
        undefined,
        undefined,
      ],
    })

    // 1. Custom Multi-Target ['custom', '0'] MUST resolve (reproduces Team Settings custom target scenario)
    const customRes = computeSupportArtifactBuffComparison({
      database: db,
      teamId,
      teamCharId: naviaTcId,
      characterKey: 'Navia',
      gender: 'F',
      optimizationTarget: ['custom', '0'],
      teammateKeys: ['Zhongli'],
    })

    expect(customRes).toBeDefined()
    expect(customRes!.targetName).toBe('Rotacao Navia')
    expect(customRes!.baseValue).toBeGreaterThan(0)

    const totmRow = customRes!.rows.find(
      (r) => r.setKey === 'TenacityOfTheMillelith'
    )
    expect(totmRow).toBeDefined()
    expect(totmRow!.diff).toBeGreaterThan(0)
    expect(totmRow!.diffPct).toBeGreaterThan(0)
    expect(totmRow!.simValue).toBeCloseTo(
      customRes!.baseValue + totmRow!.diff,
      4
    )

    // 2. Optimize tab build override: pass custom weapon + 5pc artifact build not yet equipped in DB
    const verdictId = db.weapons.new({
      key: 'Verdict',
      level: 90,
      ascension: 6,
      refinement: 1,
      location: '',
      lock: false,
    })
    const artIds = (
      ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const
    ).map((slotKey, idx) =>
      db.arts.new({
        setKey:
          idx < 4 ? 'NighttimeWhispersInTheEchoingWoods' : 'GladiatorsFinale',
        rarity: 5,
        level: 20,
        slotKey,
        mainStatKey:
          slotKey === 'flower'
            ? 'hp'
            : slotKey === 'plume'
              ? 'atk'
              : slotKey === 'sands'
                ? 'atk_'
                : slotKey === 'goblet'
                  ? 'geo_dmg_'
                  : 'critRate_',
        location: '',
        lock: false,
        substats: [{ key: 'critDMG_', value: 21 }],
      })
    )
    const overrideArt = artIds.map((id) => db.arts.get(id)!)
    const overrideWeapon = db.weapons.get(verdictId)!

    const optBuildRes = computeSupportArtifactBuffComparison({
      database: db,
      teamId,
      teamCharId: naviaTcId,
      characterKey: 'Navia',
      gender: 'F',
      optimizationTarget: ['custom', '0'],
      teammateKeys: ['Zhongli'],
      overrideArt,
      overrideWeapon,
    })

    expect(optBuildRes).toBeDefined()
    // Base value with Lv.90 Verdict + +20 5* artifacts must be substantially higher than Lv.1 Dull Blade
    expect(optBuildRes!.baseValue).toBeGreaterThan(customRes!.baseValue * 3)
    const optTotmRow = optBuildRes!.rows.find(
      (r) => r.setKey === 'TenacityOfTheMillelith'
    )
    expect(optTotmRow).toBeDefined()
    expect(optTotmRow!.diff).toBeGreaterThan(totmRow!.diff)
    expect(optTotmRow!.diffPct).toBeGreaterThan(0)
  })
})
