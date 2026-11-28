import {
  calculateTeamKqmsEr,
  ENERGY_CONSTANTS,
  getCharacterBurstCost,
  getMultiTargetSkillInfo,
} from './kqmsErCalc'

describe('kqmsErCalc', () => {
  it('verifies strict base energy constants', () => {
    expect(ENERGY_CONSTANTS.sameEleOnField).toBe(3.0)
    expect(ENERGY_CONSTANTS.sameEleOffField).toBe(1.8)
    expect(ENERGY_CONSTANTS.whiteParticleOnField).toBe(2.0)
    expect(ENERGY_CONSTANTS.whiteParticleOffField).toBe(1.2)
    expect(ENERGY_CONSTANTS.diffEleOnField).toBe(1.0)
    expect(ENERGY_CONSTANTS.diffEleOffField).toBe(0.6)
    expect(ENERGY_CONSTANTS.whiteOrbOnField).toBe(6.0)
    expect(ENERGY_CONSTANTS.whiteOrbOffField).toBe(3.6)
  })

  it('extracts accurate burst energy costs including 0-energy bursts', () => {
    expect(getCharacterBurstCost('YaeMiko')).toBe(90)
    expect(getCharacterBurstCost('Bennett')).toBe(60)
    expect(getCharacterBurstCost('Xiangling')).toBe(80)
    expect(getCharacterBurstCost('Mavuika')).toBe(0)
    expect(getCharacterBurstCost('Skirk')).toBe(0)
    expect(getCharacterBurstCost('Cyno')).toBe(80)
  })

  it('applies Favonius procs, flat energy, +10% safety margin rounded up to 5%, and min 100%', () => {
    const result = calculateTeamKqmsEr({
      rotationDuration: 20,
      enemyScenario: 'boss',
      members: [
        {
          characterKey: 'KamisatoAyaka',
          constellation: 0,
          isOnFieldPrimary: true,
          weaponKey: 'AmenomaKageuchi',
          weaponRefinement: 5,
        },
        {
          characterKey: 'Shenhe',
          constellation: 0,
          isOnFieldPrimary: false,
          weaponKey: 'FavoniusLance',
          weaponRefinement: 5,
        },
        {
          characterKey: 'KaedeharaKazuha',
          constellation: 0,
          isOnFieldPrimary: false,
          weaponKey: 'FavoniusSword',
          weaponRefinement: 5,
        },
        {
          characterKey: 'SangonomiyaKokomi',
          constellation: 0,
          isOnFieldPrimary: false,
          weaponKey: 'PrototypeAmber',
          weaponRefinement: 5,
        },
      ],
    })

    expect(result.members).toHaveLength(4)
    for (const m of result.members) {
      expect(m.recommendedErPercent).toBeGreaterThanOrEqual(100)
      expect(m.recommendedErPercent % 5).toBe(0)
    }

    const ayaka = result.members.find(
      (m) => m.characterKey === 'KamisatoAyaka'
    )!
    // Amenoma R5 with 2 skills restores 24 flat energy
    expect(ayaka.flatEnergy).toBeGreaterThanOrEqual(24)

    const kazuha = result.members.find(
      (m) => m.characterKey === 'KaedeharaKazuha'
    )!
    // R5 Favonius in 20s rotation with 2 skill uses gets 2 Favonius procs
    expect(kazuha.favoniusProcs).toBe(2)
  })

  it('emits proactive recommendations when ER exceeds 200%', () => {
    const soloXiangling = calculateTeamKqmsEr({
      rotationDuration: 20,
      enemyScenario: 'boss',
      members: [
        {
          characterKey: 'Neuvillette',
          constellation: 0,
          isOnFieldPrimary: true,
        },
        {
          characterKey: 'Xiangling',
          constellation: 0,
          isOnFieldPrimary: false,
          weaponKey: 'TheCatch',
          weaponRefinement: 5,
        },
        {
          characterKey: 'Zhongli',
          constellation: 0,
          isOnFieldPrimary: false,
        },
        {
          characterKey: 'KaedeharaKazuha',
          constellation: 0,
          isOnFieldPrimary: false,
        },
      ],
    })

    const xl = soloXiangling.members.find(
      (m) => m.characterKey === 'Xiangling'
    )!
    expect(xl.recommendedErPercent).toBeGreaterThan(200)
    expect(soloXiangling.recommendations).toContain('favonius')
    expect(soloXiangling.recommendations).toContain('battery:pyro')
  })

  it('lowers KQMS ER% floor when a Custom Multi-Target includes the character Skill (guaranteed on-field particle catch)', () => {
    const skillInfo = getMultiTargetSkillInfo(
      ['custom', '0'],
      [
        {
          targets: [
            { path: ['skill', 'bubbleDmg'], weight: 1 },
            { path: ['burst', 'skillDmg'], weight: 1 },
          ],
        },
      ]
    )
    expect(skillInfo.guaranteedSelfCatch).toBe(true)

    const base = calculateTeamKqmsEr({
      members: [
        {
          characterKey: 'Neuvillette',
          constellation: 0,
          isOnFieldPrimary: true,
        },
        { characterKey: 'Furina', constellation: 0, isOnFieldPrimary: false },
      ],
    })
    const withMultiSkill = calculateTeamKqmsEr({
      members: [
        {
          characterKey: 'Neuvillette',
          constellation: 0,
          isOnFieldPrimary: true,
        },
        {
          characterKey: 'Furina',
          constellation: 0,
          isOnFieldPrimary: false,
          ...skillInfo,
        },
      ],
    })

    const furinaBase = base.members.find((m) => m.characterKey === 'Furina')!
    const furinaCatch = withMultiSkill.members.find(
      (m) => m.characterKey === 'Furina'
    )!
    expect(furinaCatch.baseEnergyReceived).toBeGreaterThan(
      furinaBase.baseEnergyReceived
    )
    expect(furinaCatch.recommendedErPercent).toBeLessThan(
      furinaBase.recommendedErPercent
    )
  })
})
