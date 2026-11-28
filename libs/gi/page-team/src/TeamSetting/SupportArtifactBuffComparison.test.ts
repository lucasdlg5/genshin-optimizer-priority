import { createTestDBStorage } from '@genshin-optimizer/common/database'
import { ArtCharDatabase } from '@genshin-optimizer/gi/db'
import { getTeamData } from '@genshin-optimizer/gi/ui'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import { uiInput as input } from '@genshin-optimizer/gi/wr'
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

    // Support weapon buffs (e.g. TTDS +48% ATK) must also be computed with positive gains
    const ttdsRow = customRes!.weaponRows.find(
      (r) => r.weaponKey === 'ThrillingTalesOfDragonSlayers'
    )
    expect(ttdsRow).toBeDefined()
    expect(ttdsRow!.diff).toBeGreaterThan(0)
    expect(ttdsRow!.diffPct).toBeGreaterThan(0)
    expect(ttdsRow!.simValue).toBeCloseTo(
      customRes!.baseValue + ttdsRow!.diff,
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

  it('applies 1/3 average of all 3 buffs for TheWidsith when unselected and exact single buff when manually selected', () => {
    const db = new ArtCharDatabase(1, createTestDBStorage())
    db.chars.set('LanYan', {
      level: 90,
      ascension: 6,
      constellation: 0,
      talent: { auto: 9, skill: 9, burst: 9 },
    })
    const widsithId = db.weapons.new({
      key: 'TheWidsith',
      level: 90,
      ascension: 6,
      refinement: 5,
      location: 'LanYan',
      lock: false,
    })
    const tcId = db.teamChars.new('LanYan')
    const teamId = db.teams.new({
      name: 'Widsith Team',
      loadoutData: [
        { teamCharId: tcId, buildType: 'equipped' },
        undefined,
        undefined,
        undefined,
      ],
    })
    const widsith = db.weapons.get(widsithId)!

    const getWidsithStats = (state?: 'aria' | 'interlude' | 'recitative') => {
      db.teamChars.set(tcId, {
        conditional: state ? { TheWidsith: { Debut: state } } : {},
      })
      const td = getTeamData(db, teamId, tcId, 0, [], widsith)!
      const ui = uiDataForTeam(td.teamData, 'F', 'LanYan').LanYan!.target
      return {
        atk_: ui.get(input.total.atk_).value,
        anemo_dmg_: ui.get(input.total.anemo_dmg_).value,
        eleMas: ui.get(input.total.eleMas).value,
      }
    }

    const avgStats = getWidsithStats(undefined)
    const ariaStats = getWidsithStats('aria')
    const interludeStats = getWidsithStats('interlude')
    const recitativeStats = getWidsithStats('recitative')

    // At R5: Recitative = +120% ATK (1/3 = 40%), Aria = +96% Ele DMG (1/3 = 32%), Interlude = +480 EM (1/3 = 160)
    // Manual selection applies ONLY that buff and ignores the other two
    expect(recitativeStats.atk_ - ariaStats.atk_).toBeCloseTo(1.2, 4)
    expect(ariaStats.anemo_dmg_ - recitativeStats.anemo_dmg_).toBeCloseTo(
      0.96,
      4
    )
    expect(interludeStats.eleMas - recitativeStats.eleMas).toBeCloseTo(480, 4)

    // Unselected applies 1/3 of each buff simultaneously
    expect(avgStats.atk_ - ariaStats.atk_).toBeCloseTo(0.4, 4)
    expect(avgStats.anemo_dmg_ - recitativeStats.anemo_dmg_).toBeCloseTo(
      0.32,
      4
    )
    expect(avgStats.eleMas - recitativeStats.eleMas).toBeCloseTo(160, 4)
  })
})
