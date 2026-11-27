import { createTestDBStorage } from '@genshin-optimizer/common/database'
import { ArtCharDatabase } from '@genshin-optimizer/gi/db'
import { describe, expect, it } from 'vitest'
import { enableAllTeamTalentPassivesMax } from './maxTalentCondsUtil'

describe('maxTalentCondsUtil', () => {
  it('activates only unlockable talent conditionals at max option without changing constellation or talent levels', () => {
    const db = new ArtCharDatabase(1, createTestDBStorage('go'))

    // C0 Lv. 80/90 Furina (ascension 6, constellation 0) -> passive1/passive2/burst unlocked, C1..C6 locked
    db.chars.getWithInitWeapon('Furina')
    db.chars.set('Furina', {
      key: 'Furina',
      level: 80,
      ascension: 6,
      constellation: 0,
      talent: { auto: 1, skill: 8, burst: 8 },
    })
    // C6 Lv. 20/20 TravelerCryo (ascension 0, constellation 6) -> passive1/passive2 locked by asc 0, burst + Quest Bonuses + C2 unlocked!
    db.chars.getWithInitWeapon('TravelerCryo')
    db.chars.set('TravelerCryo', {
      key: 'TravelerCryo',
      level: 20,
      ascension: 0,
      constellation: 6,
      talent: { auto: 1, skill: 1, burst: 1 },
    })

    const furinaTcId = db.teamChars.new('Furina')
    const travelerTcId = db.teamChars.new('TravelerCryo')
    const teamId = db.teams.new({
      name: 'Test Team',
      loadoutData: [
        { teamCharId: furinaTcId } as never,
        { teamCharId: travelerTcId } as never,
        undefined,
        undefined,
      ],
    })

    enableAllTeamTalentPassivesMax(db, teamId, 'F')

    // Constellations and talent levels MUST remain untouched
    const furinaChar = db.chars.get('Furina')!
    expect(furinaChar.constellation).toBe(0)
    expect(furinaChar.talent).toEqual({ auto: 1, skill: 8, burst: 8 })

    const travelerChar = db.chars.get('TravelerCryo')!
    expect(travelerChar.constellation).toBe(6)
    expect(travelerChar.ascension).toBe(0)
    expect(travelerChar.talent).toEqual({ auto: 1, skill: 1, burst: 1 })

    // Furina C0: burst fanfare max = '300' (not C1's 400!), and C2 conditional NOT enabled
    const furinaCond = db.teamChars.get(furinaTcId)!.conditional
    expect(furinaCond.Furina?.burstFanfare).toBe('300')
    expect(furinaCond.Furina?.c2Overstack).toBeUndefined()

    // TravelerCryo C6 Asc 0:
    // - Burst Frostglow max = '8'
    // - Quest Bonuses ('Traveler') enabled = 'on'
    // - Chained C2 ('c2Crystal' -> 'c2ActiveStellar') both enabled across passes
    // - A1 ('a1ScStar') NOT enabled because ascension is 0 (< 1)
    const travelerCond = db.teamChars.get(travelerTcId)!.conditional
    expect(travelerCond.TravelerCryo?.burstFrostglow).toBe('8')
    expect(travelerCond.Traveler?.bonusCanned).toBe('on')
    expect(travelerCond.Traveler?.bonusSkirk1).toBe('on')
    expect(travelerCond.TravelerCryo?.c2Crystal).toBe('on')
    expect(travelerCond.TravelerCryo?.c2ActiveStellar).toBe('on')
    expect(travelerCond.TravelerCryo?.a1ScStar).toBeUndefined()

    // Once ascended to Ascension 6, re-running unlocks A1 ('a1ScStar' = 'on') via Stellar Radiance ('sc')
    db.chars.set('TravelerCryo', { level: 90, ascension: 6 })
    enableAllTeamTalentPassivesMax(db, teamId, 'F')
    const travelerAsc6Cond = db.teamChars.get(travelerTcId)!.conditional
    expect(travelerAsc6Cond.TravelerCryo?.a0StellarRadiance).toBe('sc')
    expect(travelerAsc6Cond.TravelerCryo?.a1ScStar).toBe('on')
  })
})
