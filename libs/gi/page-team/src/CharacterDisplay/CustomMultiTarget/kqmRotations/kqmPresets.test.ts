import { SandboxStorage } from '@genshin-optimizer/common/database'
import { allCharacterKeys } from '@genshin-optimizer/gi/consts'
import {
  ArtCharDatabase,
  allArtifactSetExclusionKeys,
} from '@genshin-optimizer/gi/db'
import { getTeamData } from '@genshin-optimizer/gi/ui'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import { describe, expect, it } from 'vitest'
import {
  applyKqmArtifacts,
  applyKqmArtifactsForTeam,
  buildKqmArtSetExclusion,
  KQM_ARTIFACT_PRESETS,
} from '../../Tabs/TabOptimize/kqmArtifacts'
import {
  applyKqmRotation,
  applyKqmRotationsForTeam,
  KQM_ROTATIONS,
} from './index'

describe('KQM Quick Guide Rotations & Artifact Presets', () => {
  it('covers all 130 characters with valid non-empty rotation steps and artifact presets', () => {
    const validArtKeys = new Set(allArtifactSetExclusionKeys)
    for (const charKey of allCharacterKeys) {
      const rot = KQM_ROTATIONS[charKey]
      expect(rot, `Missing KQM rotation for ${charKey}`).toBeDefined()
      expect(rot.steps.length, `Empty steps for ${charKey}`).toBeGreaterThan(0)
      for (const s of rot.steps) {
        expect(s.weight, `Invalid weight for ${charKey}`).toBeGreaterThan(0)
        expect(s.path.length).toBe(2)
        expect(s.path[0]).not.toBe('custom')
      }

      const art = KQM_ARTIFACT_PRESETS[charKey]
      expect(art, `Missing KQM artifact preset for ${charKey}`).toBeDefined()
      expect(art.sets4.length > 0 || art.allow2pc).toBe(true)
      for (const setKey of art.sets4) {
        expect(
          validArtKeys.has(setKey),
          `Invalid artifact set ${setKey} for ${charKey}`
        ).toBe(true)
      }
    }
  })

  it('resolves every rotation step path to an existing positive UIData node across all 130 characters', () => {
    const db = new ArtCharDatabase(1, new SandboxStorage())
    const missing: string[] = []

    for (const charKey of allCharacterKeys) {
      db.chars.getWithInitWeapon(charKey)
      db.chars.set(charKey, {
        level: 90,
        ascension: 6,
        constellation: 0,
        talent: { auto: 9, skill: 9, burst: 9 },
      })
      const teamId = db.teams.new({
        name: `Test ${charKey}`,
      })
      const teamCharId = db.teamChars.new(charKey)
      db.teams.set(teamId, {
        loadoutData: [{ teamCharId }, undefined, undefined, undefined],
      })

      const teamData = getTeamData(db, teamId, teamCharId, 0, [])
      const charData = teamData
        ? uiDataForTeam(teamData.teamData, 'F', charKey)[charKey]?.target
        : undefined
      if (!charData) {
        missing.push(`${charKey}: no charData`)
        continue
      }

      const rot = KQM_ROTATIONS[charKey]
      for (const s of rot.steps) {
        const node = charData.getDisplay()[s.path[0]]?.[s.path[1]]
        if (!node) {
          missing.push(`${charKey}: missing path ${s.path.join('.')}`)
        } else if (node.unit === '%') {
          missing.push(`${charKey}: % unit path ${s.path.join('.')}`)
        } else if (!(node.value > 0)) {
          missing.push(
            `${charKey}: non-positive value (${node.value}) at ${s.path.join('.')}`
          )
        }
      }
    }

    expect(missing).toEqual([])
  }, 60000)

  it('applies KQM rotations (create, replace, and auto-select target) and team batch', () => {
    const db = new ArtCharDatabase(1, new SandboxStorage())
    const teamId = db.teams.new({ name: 'Test Team' })
    const tc1 = db.teamChars.new('Clorinde')
    const tc2 = db.teamChars.new('RaidenShogun')
    db.teams.set(teamId, {
      loadoutData: [{ teamCharId: tc1 }, { teamCharId: tc2 }],
    })

    const r1 = applyKqmRotation(db, tc1, 'Clorinde', 'F')
    expect(r1).toBeDefined()
    expect(r1!.index).toBe(0)
    expect(r1!.name).toContain('Rotacao ')
    const opt1 = db.optConfigs.get(db.teamChars.get(tc1)!.optConfigId)!
    expect(opt1.optimizationTarget).toEqual(['custom', '0'])

    // Re-applying replaces in-place without creating a duplicate
    const r1Again = applyKqmRotation(db, tc1, 'Clorinde', 'F')
    expect(r1Again!.index).toBe(0)
    expect(db.teamChars.get(tc1)!.customMultiTargets.length).toBe(1)

    // Team batch applies to both
    const count = applyKqmRotationsForTeam(db, teamId, 'F')
    expect(count).toBe(2)
    const opt2 = db.optConfigs.get(db.teamChars.get(tc2)!.optConfigId)!
    expect(opt2.optimizationTarget).toEqual(['custom', '0'])
    expect(db.teamChars.get(tc2)!.customMultiTargets[0].targets.length).toBe(12)
  })

  it('applies KQM artifact sets matching Raiden (4pc only), Zibai (4pc only), and Arlecchino (4pc + 2pc/2pc)', () => {
    const raidenExcl = buildKqmArtSetExclusion(
      KQM_ARTIFACT_PRESETS.RaidenShogun
    )
    expect(raidenExcl.rainbow).toEqual([2, 4])
    expect(raidenExcl.EmblemOfSeveredFate).toEqual([2])
    expect(raidenExcl.GladiatorsFinale).toEqual([2, 4])

    const zibaiExcl = buildKqmArtSetExclusion(KQM_ARTIFACT_PRESETS.Zibai)
    expect(zibaiExcl.rainbow).toEqual([2, 4])
    expect(zibaiExcl.NightOfTheSkysUnveiling).toEqual([2])
    expect(zibaiExcl.HuskOfOpulentDreams).toEqual([2, 4])

    const arleExcl = buildKqmArtSetExclusion(KQM_ARTIFACT_PRESETS.Arlecchino)
    expect(arleExcl.rainbow).toEqual([2, 4])
    expect(arleExcl.FragmentOfHarmonicWhimsy).toBeUndefined()
    expect(arleExcl.GladiatorsFinale).toBeUndefined()
    expect(arleExcl.EmblemOfSeveredFate).toEqual([4])

    // Verify DB application
    const db = new ArtCharDatabase(1, new SandboxStorage())
    const teamId = db.teams.new({ name: 'Art Team' })
    const tc1 = db.teamChars.new('RaidenShogun')
    const tc2 = db.teamChars.new('Arlecchino')
    db.teams.set(teamId, {
      loadoutData: [{ teamCharId: tc1 }, { teamCharId: tc2 }],
    })

    expect(applyKqmArtifacts(db, tc1, 'RaidenShogun')).toBe(true)
    expect(
      db.optConfigs.get(db.teamChars.get(tc1)!.optConfigId)!.artSetExclusion
        .EmblemOfSeveredFate
    ).toEqual([2])

    expect(applyKqmArtifactsForTeam(db, teamId)).toBe(2)
    expect(
      db.optConfigs.get(db.teamChars.get(tc2)!.optConfigId)!.artSetExclusion
        .FragmentOfHarmonicWhimsy
    ).toBeUndefined()
  })
})
