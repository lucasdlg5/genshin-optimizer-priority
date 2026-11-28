import type {
  ArtifactSetKey,
  CharacterKey,
  CharacterSheetKey,
  ElementKey,
  GenderKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import { allStats, getCharEle, getCharParam } from '@genshin-optimizer/gi/stats'

// ============================================================================
// Strict KQMS / Theorycraft Energy Base Constants (4-Character Party)
// ============================================================================
export const ENERGY_CONSTANTS = {
  sameEleOnField: 3.0,
  sameEleOffField: 1.8,
  whiteParticleOnField: 2.0,
  whiteParticleOffField: 1.2,
  diffEleOnField: 1.0,
  diffEleOffField: 0.6,
  whiteOrbOnField: 6.0,
  whiteOrbOffField: 3.6,
  favoniusParticles: 3, // 3 white particles => 6.0 on-field | 3.6 off-field
} as const

export const FAVONIUS_WEAPON_KEYS = new Set<WeaponKey>([
  'FavoniusSword',
  'FavoniusGreatsword',
  'FavoniusLance',
  'FavoniusWarbow',
  'FavoniusCodex',
])

export type EnemyParticleScenario = 'boss' | 'aoe'

export type ParticleProfile = {
  /** Particles generated per Skill use (or per continuous summon window) */
  particlesPerUse: number
  /** Effective cooldown / interval to estimate uses per rotation */
  skillCd: number
  /** Max realistic uses per standard ~20s rotation */
  maxUsesIn20s: number
  /** Whether particles are generated continuously off-field over time */
  continuous?: boolean
  /** Brief theorycraft note */
  note?: string
}

/**
 * Character elemental particle generation table based on KQMS / Genshin Theorycraft data.
 */
export const CHARACTER_PARTICLE_PROFILES: Partial<
  Record<CharacterKey, ParticleProfile>
> = {
  // Pyro
  Amber: {
    particlesPerUse: 4,
    skillCd: 15,
    maxUsesIn20s: 1,
    note: 'Baron Bunny explosion',
  },
  Arlecchino: { particlesPerUse: 5, skillCd: 15, maxUsesIn20s: 1 },
  Bennett: {
    particlesPerUse: 2.25,
    skillCd: 5,
    maxUsesIn20s: 2,
    note: 'Tap avg 2.25',
  },
  Chevreuse: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Dehya: {
    particlesPerUse: 4.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Diluc: {
    particlesPerUse: 4,
    skillCd: 12,
    maxUsesIn20s: 1,
    note: '3 casts (~4 total)',
  },
  Durin: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Gaming: {
    particlesPerUse: 2,
    skillCd: 4,
    maxUsesIn20s: 4,
    note: '2 per plunge',
  },
  HuTao: { particlesPerUse: 4.5, skillCd: 16, maxUsesIn20s: 1 },
  Klee: { particlesPerUse: 4, skillCd: 20, maxUsesIn20s: 1 },
  Lyney: { particlesPerUse: 5, skillCd: 15, maxUsesIn20s: 1 },
  Mavuika: {
    particlesPerUse: 5,
    skillCd: 15,
    maxUsesIn20s: 1,
    note: 'Uses Fighting Spirit (0 Energy Burst)',
  },
  Thoma: { particlesPerUse: 3.5, skillCd: 15, maxUsesIn20s: 1 },
  Xiangling: {
    particlesPerUse: 4,
    skillCd: 12,
    maxUsesIn20s: 1,
    continuous: true,
    note: 'Guoba 4 hits',
  },
  Xinyan: { particlesPerUse: 4, skillCd: 18, maxUsesIn20s: 1 },
  Yanfei: { particlesPerUse: 3, skillCd: 9, maxUsesIn20s: 2 },
  Yoimiya: { particlesPerUse: 4, skillCd: 18, maxUsesIn20s: 1 },

  // Hydro
  Aino: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Barbara: {
    particlesPerUse: 0,
    skillCd: 32,
    maxUsesIn20s: 1,
    note: '0 particles',
  },
  Candace: { particlesPerUse: 2.5, skillCd: 9, maxUsesIn20s: 2 },
  Columbina: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Dahlia: { particlesPerUse: 3.5, skillCd: 12, maxUsesIn20s: 1 },
  Furina: {
    particlesPerUse: 7.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
    note: '~7-8 in 20s',
  },
  KamisatoAyato: { particlesPerUse: 4.5, skillCd: 12, maxUsesIn20s: 1 },
  Mona: {
    particlesPerUse: 3.5,
    skillCd: 12,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Mualani: { particlesPerUse: 4.5, skillCd: 15, maxUsesIn20s: 1 },
  Neuvillette: { particlesPerUse: 4, skillCd: 12, maxUsesIn20s: 1 },
  Nilou: { particlesPerUse: 4.5, skillCd: 18, maxUsesIn20s: 1 },
  SangonomiyaKokomi: {
    particlesPerUse: 4.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Sigewinne: { particlesPerUse: 4, skillCd: 18, maxUsesIn20s: 1 },
  Tartaglia: { particlesPerUse: 3.5, skillCd: 18, maxUsesIn20s: 1 },
  Xingqiu: { particlesPerUse: 5, skillCd: 21, maxUsesIn20s: 1 },
  Yelan: { particlesPerUse: 4, skillCd: 10, maxUsesIn20s: 2 },

  // Electro
  Beidou: {
    particlesPerUse: 3,
    skillCd: 7.5,
    maxUsesIn20s: 2,
    note: '2 tap / 4 full counter',
  },
  Clorinde: { particlesPerUse: 3.5, skillCd: 16, maxUsesIn20s: 1 },
  Cyno: {
    particlesPerUse: 5.66,
    skillCd: 18,
    maxUsesIn20s: 1,
    note: 'Skill + Burst casts',
  },
  Dori: { particlesPerUse: 2, skillCd: 9, maxUsesIn20s: 2 },
  Fischl: {
    particlesPerUse: 6.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
    note: 'Oz ~6-7 particles',
  },
  Flins: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Iansan: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Ineffa: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Keqing: { particlesPerUse: 2.5, skillCd: 7.5, maxUsesIn20s: 2 },
  KujouSara: { particlesPerUse: 3, skillCd: 10, maxUsesIn20s: 1 },
  KukiShinobu: {
    particlesPerUse: 3.5,
    skillCd: 15,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Lisa: {
    particlesPerUse: 5,
    skillCd: 16,
    maxUsesIn20s: 1,
    note: 'Hold Skill',
  },
  Ororon: { particlesPerUse: 3, skillCd: 15, maxUsesIn20s: 1 },
  RaidenShogun: {
    particlesPerUse: 5.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Razor: { particlesPerUse: 3.5, skillCd: 10, maxUsesIn20s: 2 },
  Sethos: { particlesPerUse: 2, skillCd: 8, maxUsesIn20s: 2 },
  Varesa: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  YaeMiko: {
    particlesPerUse: 5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
    note: '~5 in 14s',
  },

  // Cryo
  Aloy: { particlesPerUse: 5, skillCd: 20, maxUsesIn20s: 1 },
  Charlotte: { particlesPerUse: 3, skillCd: 12, maxUsesIn20s: 1 },
  Chongyun: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Citlali: { particlesPerUse: 5, skillCd: 16, maxUsesIn20s: 1 },
  Diona: {
    particlesPerUse: 4,
    skillCd: 15,
    maxUsesIn20s: 1,
    note: 'Hold (5 paws ~4)',
  },
  Escoffier: {
    particlesPerUse: 4,
    skillCd: 15,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Eula: {
    particlesPerUse: 3.5,
    skillCd: 15,
    maxUsesIn20s: 1,
    note: 'Tap + Hold in rotation',
  },
  Freminet: { particlesPerUse: 2, skillCd: 10, maxUsesIn20s: 2 },
  Ganyu: {
    particlesPerUse: 4,
    skillCd: 10,
    maxUsesIn20s: 1,
    note: '2 cast + 2 bloom',
  },
  Kaeya: { particlesPerUse: 2.67, skillCd: 6, maxUsesIn20s: 2 },
  KamisatoAyaka: { particlesPerUse: 4.5, skillCd: 10, maxUsesIn20s: 2 },
  Layla: {
    particlesPerUse: 3.5,
    skillCd: 12,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Mika: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Mitya: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Odette: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Qiqi: {
    particlesPerUse: 0,
    skillCd: 30,
    maxUsesIn20s: 1,
    note: '0 particles',
  },
  Rosaria: { particlesPerUse: 3, skillCd: 6, maxUsesIn20s: 2 },
  Sandrone: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Shenhe: { particlesPerUse: 3.5, skillCd: 12, maxUsesIn20s: 1 },
  Skirk: {
    particlesPerUse: 4,
    skillCd: 15,
    maxUsesIn20s: 1,
    note: '0 Energy Burst',
  },
  Wriothesley: { particlesPerUse: 4.5, skillCd: 16, maxUsesIn20s: 1 },

  // Anemo
  Chasca: { particlesPerUse: 5, skillCd: 15, maxUsesIn20s: 1 },
  Faruzan: { particlesPerUse: 2, skillCd: 6, maxUsesIn20s: 2 },
  Ifa: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Jean: { particlesPerUse: 2.67, skillCd: 6, maxUsesIn20s: 2 },
  KaedeharaKazuha: { particlesPerUse: 3.5, skillCd: 8, maxUsesIn20s: 2 },
  LanYan: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Lynette: { particlesPerUse: 4, skillCd: 12, maxUsesIn20s: 1 },
  Sayu: { particlesPerUse: 2, skillCd: 11, maxUsesIn20s: 1 },
  ShikanoinHeizou: { particlesPerUse: 2.5, skillCd: 10, maxUsesIn20s: 2 },
  Sucrose: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Varka: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Venti: { particlesPerUse: 3, skillCd: 6, maxUsesIn20s: 2 },
  Wanderer: { particlesPerUse: 4.5, skillCd: 16, maxUsesIn20s: 1 },
  Xianyun: { particlesPerUse: 5, skillCd: 12, maxUsesIn20s: 1 },
  Xiao: {
    particlesPerUse: 3,
    skillCd: 10,
    maxUsesIn20s: 2,
    note: '2 charges before Burst',
  },
  YumemizukiMizuki: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },

  // Geo
  Albedo: {
    particlesPerUse: 5.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  AratakiItto: { particlesPerUse: 3.5, skillCd: 10, maxUsesIn20s: 2 },
  Chiori: {
    particlesPerUse: 4.5,
    skillCd: 16,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Gorou: { particlesPerUse: 2, skillCd: 10, maxUsesIn20s: 2 },
  Kachina: {
    particlesPerUse: 4,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Navia: { particlesPerUse: 3.5, skillCd: 9, maxUsesIn20s: 2 },
  Ningguang: { particlesPerUse: 3.5, skillCd: 12, maxUsesIn20s: 1 },
  Noelle: {
    particlesPerUse: 0,
    skillCd: 24,
    maxUsesIn20s: 1,
    note: '0 particles',
  },
  Xilonen: { particlesPerUse: 4, skillCd: 7, maxUsesIn20s: 1 },
  YunJin: { particlesPerUse: 2.5, skillCd: 9, maxUsesIn20s: 2 },
  Zhongli: {
    particlesPerUse: 3.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },

  // Dendro
  Alhaitham: { particlesPerUse: 4.5, skillCd: 18, maxUsesIn20s: 1 },
  Baizhu: { particlesPerUse: 3.5, skillCd: 10, maxUsesIn20s: 2 },
  Collei: { particlesPerUse: 3, skillCd: 12, maxUsesIn20s: 1 },
  Emilie: {
    particlesPerUse: 6.5,
    skillCd: 20,
    maxUsesIn20s: 1,
    continuous: true,
  },
  Kaveh: { particlesPerUse: 2, skillCd: 6, maxUsesIn20s: 2 },
  Kinich: { particlesPerUse: 5, skillCd: 18, maxUsesIn20s: 1 },
  Kirara: { particlesPerUse: 3, skillCd: 8, maxUsesIn20s: 1 },
  Lauma: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Nahida: { particlesPerUse: 3, skillCd: 7, maxUsesIn20s: 2, continuous: true },
  Nefer: { particlesPerUse: 4, skillCd: 15, maxUsesIn20s: 1 },
  Tighnari: { particlesPerUse: 3.5, skillCd: 12, maxUsesIn20s: 1 },
  Yaoyao: {
    particlesPerUse: 4.5,
    skillCd: 15,
    maxUsesIn20s: 1,
    continuous: true,
  },

  // Traveler
  TravelerAnemo: { particlesPerUse: 3, skillCd: 8, maxUsesIn20s: 2 },
  TravelerGeo: { particlesPerUse: 3.33, skillCd: 6, maxUsesIn20s: 2 },
  TravelerElectro: {
    particlesPerUse: 1,
    skillCd: 13.5,
    maxUsesIn20s: 1,
    note: '+ Flat Energy Amulets',
  },
  TravelerDendro: { particlesPerUse: 2.5, skillCd: 8, maxUsesIn20s: 2 },
  TravelerHydro: { particlesPerUse: 3.33, skillCd: 10, maxUsesIn20s: 2 },
  TravelerPyro: { particlesPerUse: 4.5, skillCd: 15, maxUsesIn20s: 1 },
  TravelerCryo: { particlesPerUse: 3.5, skillCd: 12, maxUsesIn20s: 1 },
}

const BURST_COST_OVERRIDES: Partial<Record<CharacterKey, number>> = {
  // Characters that do not use Elemental Energy for Burst
  Mavuika: 0,
  Skirk: 0,
  // Cyno burst array has [100, 80], actual Burst Energy cost is 80
  Cyno: 80,
}

export function getCharacterBurstCost(
  characterKey: CharacterKey,
  gender: GenderKey = 'F'
): number {
  if (characterKey in BURST_COST_OVERRIDES) {
    return BURST_COST_OVERRIDES[characterKey]!
  }
  const sheetKey = (
    characterKey.startsWith('Traveler')
      ? `${characterKey}${gender}`
      : characterKey
  ) as CharacterSheetKey

  const param = getCharParam(sheetKey) ?? allStats.char.skillParam[sheetKey]
  if (!param?.burst) return 60

  const validCosts = new Set([40, 50, 60, 70, 80, 90])
  for (let i = param.burst.length - 1; i >= 0; i--) {
    const arr = param.burst[i]
    if (
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every((v) => v === arr[0]) &&
      validCosts.has(arr[0])
    ) {
      return arr[0]
    }
  }
  return 60
}

export function getFavoniusCooldown(refinement: number): number {
  // R1=12s, R2=10.5s, R3=9s, R4=7.5s, R5=6s
  return 12 - (Math.min(Math.max(refinement, 1), 5) - 1) * 1.5
}

export type TeamMemberErInput = {
  characterKey: CharacterKey
  constellation: number
  isOnFieldPrimary: boolean
  weaponKey?: WeaponKey
  weaponRefinement?: number
  artifactSetCounts?: Partial<Record<ArtifactSetKey, number>>
  /** Optional explicit funnel target characterKey for this member's skill particles */
  funnelTo?: CharacterKey
  /**
   * When true (e.g. a Custom Multi-Target includes this character's Elemental Skill),
   * it is guaranteed that this character casts their Skill and catches their own
   * generated particles on-field.
   */
  guaranteedSelfCatch?: boolean
  /** Optional explicit Skill cast count inferred from a Custom Multi-Target */
  multiTargetSkillUses?: number
}

/**
 * Inspects the active optimizationTarget and customMultiTargets to detect whether
 * a Custom Multi-Target includes the character's Elemental Skill (`path[0] === 'skill'`).
 * When present, guarantees that the character catches their own generated Skill particles
 * on-field and reflects explicit Skill casts in KQMS ER% calculations.
 */
export function getMultiTargetSkillInfo(
  optimizationTarget: string[] | undefined,
  customMultiTargets:
    | ReadonlyArray<{
        targets: ReadonlyArray<{ path: string[]; weight: number }>
      }>
    | undefined
): { guaranteedSelfCatch: boolean; multiTargetSkillUses?: number } {
  if (optimizationTarget?.[0] !== 'custom' || !customMultiTargets?.length) {
    return { guaranteedSelfCatch: false }
  }
  const idx = Number(optimizationTarget[1])
  const mt = Number.isInteger(idx) ? customMultiTargets[idx] : undefined
  if (!mt) return { guaranteedSelfCatch: false }

  const skillTargets = mt.targets.filter(
    (t) => t.path[0] === 'skill' && t.weight > 0
  )
  if (!skillTargets.length) return { guaranteedSelfCatch: false }

  // Estimate cast count conservatively using the minimum weight among skill targets
  // (e.g. 2x E -> 2, while 1x initial + 10x ticks -> 1).
  const minWeight = Math.min(...skillTargets.map((t) => Math.round(t.weight)))
  return {
    guaranteedSelfCatch: true,
    multiTargetSkillUses: Math.max(1, minWeight),
  }
}

/**
 * Estimates direct Flat Energy restored per rotation from weapon passives,
 * character passives/constellations, and team effects (such as The Exile 4pc / Raiden Burst / Electro Resonance).
 */
function calculateFlatEnergyForMember(
  member: TeamMemberErInput,
  allMembers: TeamMemberErInput[],
  skillUses: number
): number {
  let flat = 0
  const {
    characterKey,
    constellation,
    weaponKey,
    weaponRefinement = 1,
  } = member
  const r = Math.min(Math.max(weaponRefinement, 1), 5)

  // Weapon flat energy passives (never multiplied by ER%)
  switch (weaponKey) {
    case 'PrototypeAmber':
      // Restores 4/4.5/5/5.5/6 energy every 2s for 6s (3 ticks = 12/13.5/15/16.5/18)
      flat += (3.5 + 0.5 * r) * 3
      break
    case 'AmenomaKageuchi':
      // 1-2 Succession Seeds typically => assume 1.5 seeds * (6 + 1.5*(r-1)) or 2 seeds if 2 skill uses
      flat += Math.min(skillUses, 3) * (6 + 1.5 * (r - 1))
      break
    case 'KitainCrossSpear':
    case 'KatsuragikiriNagamasa':
      // Loses 3 energy, restores (3 + 0.5*(r-1)) * 3 ticks => net (6 + 1.5*(r-1)) per proc
      flat += 6 + 1.5 * (r - 1)
      break
    case 'RightfulReward':
    case 'DialoguesOfTheDesertSages':
      // Restores 8/10/12/14/16 energy on heal
      flat += 6 + 2 * r
      break
  }

  // Character innate passives & constellations restoring flat energy to self
  switch (characterKey) {
    case 'Venti':
      flat += 15 // A4 restores 15 energy to Venti
      break
    case 'Jean':
      flat += 16 // A4 refunds 20% of 80 energy = 16
      break
    case 'Diona':
      if (constellation >= 1) flat += 15
      break
    case 'Thoma':
      if (constellation >= 4) flat += 15
      break
    case 'Xingqiu':
      if (constellation >= 6) flat += 15 // ~5 sword waves * 3 energy
      break
    case 'Beidou':
      if (constellation >= 4) flat += 0
      break
    case 'Yanfei':
      if (constellation >= 1) flat += 0
      break
    case 'Barbara':
      if (constellation >= 1) flat += 2 // 1 energy per 10s
      break
    case 'KamisatoAyato':
      flat += 12 // Off-field passive restores ~12 energy when <40
      break
    case 'SangonomiyaKokomi':
      if (constellation >= 4) flat += 8 // ~10 normal attacks * 0.8
      break
    case 'YaeMiko':
      if (constellation >= 1) flat += 24 // 8 energy per Sesshou Sakura (3 totems = 24)
      break
    case 'Kaveh':
      if (constellation >= 4) flat += 0
      break
    case 'Baizhu':
      if (member.weaponKey === 'JadefallsSplendor') {
        flat += (4 + 0.5 * (r - 1)) * 2.5
      }
      break
    case 'Furina':
      if (constellation >= 4) flat += 16 // ~4 triggers * 4 energy in 20s
      break
    case 'Xianyun':
      if (constellation >= 4) flat += 0
      break
    case 'Citlali':
      flat += 16 // Nightsoul / passive flat energy restoration
      break
    case 'Xilonen':
      flat += 0
      break
  }

  // Team-wide flat energy effects
  for (const ally of allMembers) {
    // 4pc The Exile: restores 2 energy every 2s for 6s (6 total) to all OTHER party members
    if (
      ally.characterKey !== characterKey &&
      (ally.artifactSetCounts?.TheExile ?? 0) >= 4
    ) {
      flat += 6
    }
    // 4pc Scholar: +3 flat energy to bow/catalyst allies per particle proc (~6 in rotation)
    if (
      ally.characterKey !== characterKey &&
      (ally.artifactSetCounts?.Scholar ?? 0) >= 4
    ) {
      flat += 6
    }
    // Venti A4: +15 flat energy to characters matching swirled element (if ally is Venti and same element as Venti's swirl)
    // Raiden Shogun Burst: restores ~20-25 flat energy to the entire team
    if (ally.characterKey === 'RaidenShogun') {
      flat += 22
    }
    // Dori Burst tether: restores ~12.5 flat energy to the on-field character
    if (ally.characterKey === 'Dori' && member.isOnFieldPrimary) {
      flat += 12.5
    }
    // Electro Traveler Abundance Amulets: ~12 flat energy to on-field character
    if (ally.characterKey === 'TravelerElectro' && member.isOnFieldPrimary) {
      flat += 12
    }
  }

  return Math.round(flat * 10) / 10
}

export type MemberErBreakdown = {
  characterKey: CharacterKey
  element: ElementKey
  isOnFieldPrimary: boolean
  burstCost: number
  skillUses: number
  particlesGenerated: number
  favoniusProcs: number
  flatEnergy: number
  baseEnergyReceived: number
  exactErPercent: number
  /** Final KQMS ER% Floor: max(100, ceil((exactEr + 10) / 5) * 5) */
  recommendedErPercent: number
}

export type TeamKqmsErResult = {
  rotationDuration: number
  enemyScenario: EnemyParticleScenario
  totalSkillUses: number
  totalFavoniusProcs: number
  enemyParticlesDesc: string
  members: MemberErBreakdown[]
  recommendations: string[]
}

/**
 * Calculates the KQMS / Theorycraft Minimum ER% (ER Floor) for all 4 members of a team.
 */
export function calculateTeamKqmsEr({
  members,
  gender = 'F',
  rotationDuration = 20,
  enemyScenario = 'boss',
}: {
  members: TeamMemberErInput[]
  gender?: GenderKey
  rotationDuration?: number
  enemyScenario?: EnemyParticleScenario
}): TeamKqmsErResult {
  if (!members.length) {
    return {
      rotationDuration,
      enemyScenario,
      totalSkillUses: 0,
      totalFavoniusProcs: 0,
      enemyParticlesDesc: '',
      members: [],
      recommendations: [],
    }
  }

  const durationScale = rotationDuration / 20

  // Step 1: Determine skill uses, particles generated, and Favonius procs per member
  const genStats = members.map((m) => {
    const profile = CHARACTER_PARTICLE_PROFILES[m.characterKey] ?? {
      particlesPerUse: 3.5,
      skillCd: 12,
      maxUsesIn20s: 1,
    }

    let skillUses: number
    if (profile.continuous) {
      skillUses = 1
    } else {
      const theoreticalUses = Math.max(
        1,
        Math.floor(rotationDuration / Math.max(profile.skillCd, 4))
      )
      skillUses = Math.min(
        theoreticalUses,
        Math.max(1, Math.round(profile.maxUsesIn20s * durationScale))
      )
      if (m.multiTargetSkillUses && m.multiTargetSkillUses > skillUses) {
        const maxCapped = Math.max(
          profile.maxUsesIn20s,
          Math.min(2, theoreticalUses)
        )
        skillUses = Math.min(m.multiTargetSkillUses, maxCapped)
      }
    }

    const particlesGenerated = profile.continuous
      ? Math.round(profile.particlesPerUse * durationScale * 100) / 100
      : Math.round(profile.particlesPerUse * skillUses * 100) / 100

    let favoniusProcs = 0
    if (m.weaponKey && FAVONIUS_WEAPON_KEYS.has(m.weaponKey)) {
      const ref = m.weaponRefinement ?? 1
      // Rule 3: R3-R5 in rotations >= 18s on characters entering field 2x can proc 2x; otherwise 1x
      if (rotationDuration >= 18 && ref >= 3 && skillUses >= 2) {
        favoniusProcs = 2
      } else {
        favoniusProcs = 1
      }
    }

    return {
      member: m,
      element: getCharEle(m.characterKey),
      profile,
      skillUses,
      particlesGenerated,
      favoniusProcs,
    }
  })

  // Electro Resonance check (>= 2 Electro characters generates ~3-4 extra Electro particles per rotation)
  const electroCount = genStats.filter((g) => g.element === 'electro').length
  const hasElectroResonance = electroCount >= 2

  // On-field primary character (defaults to first member)
  const onFieldCharKey =
    members.find((m) => m.isOnFieldPrimary)?.characterKey ??
    members[0].characterKey

  // Step 2: Accumulate base energy received for each member
  const baseEnergyMap = new Map<CharacterKey, number>()
  for (const m of members) baseEnergyMap.set(m.characterKey, 0)

  for (const gen of genStats) {
    const {
      member,
      element: srcEle,
      profile,
      particlesGenerated,
      favoniusProcs,
    } = gen
    if (particlesGenerated > 0) {
      // Continuous off-field summons (e.g. Oz, Salon Solitaire, Sesshou Sakura, Guoba):
      // ~70% of particles are caught by the primary on-field character, ~30% by the caster/swap.
      // However, if guaranteedSelfCatch is set (e.g. Custom Multi-Target includes this
      // character's Skill), the caster is guaranteed to absorb their own particles on-field.
      if (
        profile.continuous &&
        member.characterKey !== onFieldCharKey &&
        !member.guaranteedSelfCatch
      ) {
        for (const receiver of genStats) {
          const sameEle = receiver.element === srcEle
          const onFieldVal = sameEle
            ? ENERGY_CONSTANTS.sameEleOnField
            : ENERGY_CONSTANTS.diffEleOnField
          const offFieldVal = sameEle
            ? ENERGY_CONSTANTS.sameEleOffField
            : ENERGY_CONSTANTS.diffEleOffField

          let onFieldShare = 0
          if (receiver.member.characterKey === onFieldCharKey)
            onFieldShare = 0.7
          else if (receiver.member.characterKey === member.characterKey)
            onFieldShare = 0.3

          const energy =
            particlesGenerated *
            (onFieldShare * onFieldVal + (1 - onFieldShare) * offFieldVal)
          baseEnergyMap.set(
            receiver.member.characterKey,
            (baseEnergyMap.get(receiver.member.characterKey) ?? 0) + energy
          )
        }
      } else {
        // Rule 2: Funneling target catches on-field; otherwise the skill caster catches on-field
        const catcherKey = member.funnelTo ?? member.characterKey
        for (const receiver of genStats) {
          const isCatcher = receiver.member.characterKey === catcherKey
          const sameEle = receiver.element === srcEle
          const perParticle = sameEle
            ? isCatcher
              ? ENERGY_CONSTANTS.sameEleOnField
              : ENERGY_CONSTANTS.sameEleOffField
            : isCatcher
              ? ENERGY_CONSTANTS.diffEleOnField
              : ENERGY_CONSTANTS.diffEleOffField
          baseEnergyMap.set(
            receiver.member.characterKey,
            (baseEnergyMap.get(receiver.member.characterKey) ?? 0) +
              particlesGenerated * perParticle
          )
        }
      }
    }

    // Rule 3: Favonius activation => 3 White Particles (6.0 on-field for holder, 3.6 off-field for others)
    if (favoniusProcs > 0) {
      const favCatcher = member.funnelTo ?? member.characterKey
      for (const receiver of genStats) {
        const isCatcher = receiver.member.characterKey === favCatcher
        const perProc =
          ENERGY_CONSTANTS.favoniusParticles *
          (isCatcher
            ? ENERGY_CONSTANTS.whiteParticleOnField
            : ENERGY_CONSTANTS.whiteParticleOffField)
        baseEnergyMap.set(
          receiver.member.characterKey,
          (baseEnergyMap.get(receiver.member.characterKey) ?? 0) +
            favoniusProcs * perProc
        )
      }
    }
  }

  // Electro Resonance bonus (~3 Electro particles caught primarily by on-field character)
  if (hasElectroResonance) {
    const electroResParticles = 3
    for (const receiver of genStats) {
      const isCatcher = receiver.member.characterKey === onFieldCharKey
      const sameEle = receiver.element === 'electro'
      const perParticle = sameEle
        ? isCatcher
          ? ENERGY_CONSTANTS.sameEleOnField
          : ENERGY_CONSTANTS.sameEleOffField
        : isCatcher
          ? ENERGY_CONSTANTS.diffEleOnField
          : ENERGY_CONSTANTS.diffEleOffField
      baseEnergyMap.set(
        receiver.member.characterKey,
        (baseEnergyMap.get(receiver.member.characterKey) ?? 0) +
          electroResParticles * perParticle
      )
    }
  }

  // Rule 4: Enemy Particles
  // Boss (Conservative Default): 1 White Orb (6.0 on-field | 3.6 off-field)
  // AoE / Multi-Target: 2 White Orbs + 3 White Particles (caught primarily by on-field character)
  const enemyOnFieldEnergy =
    enemyScenario === 'boss'
      ? ENERGY_CONSTANTS.whiteOrbOnField // 6.0
      : 2 * ENERGY_CONSTANTS.whiteOrbOnField +
        3 * ENERGY_CONSTANTS.whiteParticleOnField // 18.0
  const enemyOffFieldEnergy =
    enemyScenario === 'boss'
      ? ENERGY_CONSTANTS.whiteOrbOffField // 3.6
      : 2 * ENERGY_CONSTANTS.whiteOrbOffField +
        3 * ENERGY_CONSTANTS.whiteParticleOffField // 10.8

  for (const receiver of genStats) {
    const isCatcher = receiver.member.characterKey === onFieldCharKey
    baseEnergyMap.set(
      receiver.member.characterKey,
      (baseEnergyMap.get(receiver.member.characterKey) ?? 0) +
        (isCatcher ? enemyOnFieldEnergy : enemyOffFieldEnergy)
    )
  }

  // Step 3: Compute ER% Formula + Safety Margin (+10%, rounded up to nearest 5%, min 100%)
  const memberBreakdowns: MemberErBreakdown[] = genStats.map((gen) => {
    const { member, element, skillUses, particlesGenerated, favoniusProcs } =
      gen
    const burstCost = getCharacterBurstCost(member.characterKey, gender)
    const flatEnergy = calculateFlatEnergyForMember(member, members, skillUses)
    const baseEnergyReceived =
      Math.round((baseEnergyMap.get(member.characterKey) ?? 0) * 100) / 100

    let exactErPercent = 100
    let recommendedErPercent = 100

    if (burstCost > 0) {
      const netEnergyNeeded = Math.max(0, burstCost - flatEnergy)
      if (netEnergyNeeded <= 0) {
        exactErPercent = 100
        recommendedErPercent = 100
      } else if (baseEnergyReceived > 0) {
        exactErPercent =
          Math.round((netEnergyNeeded / baseEnergyReceived) * 100 * 10) / 10
        // Rule 5: Add +10% safety margin and round UP to multiples of 5%, never below 100%
        recommendedErPercent = Math.max(
          100,
          Math.ceil((exactErPercent + 10) / 5) * 5
        )
      } else {
        exactErPercent = 300
        recommendedErPercent = 300
      }
    }

    return {
      characterKey: member.characterKey,
      element,
      isOnFieldPrimary: member.characterKey === onFieldCharKey,
      burstCost,
      skillUses,
      particlesGenerated,
      favoniusProcs,
      flatEnergy,
      baseEnergyReceived,
      exactErPercent,
      recommendedErPercent,
    }
  })

  // Step 4: Proactive Optimization Recommendations when any member exceeds 200% ER
  const recommendations: string[] = []
  const totalFavoniusProcs = genStats.reduce((s, g) => s + g.favoniusProcs, 0)
  const totalSkillUses = genStats.reduce((s, g) => s + g.skillUses, 0)

  for (const mb of memberBreakdowns) {
    if (mb.recommendedErPercent > 200) {
      const sameEleAllies = memberBreakdowns.filter(
        (other) =>
          other.characterKey !== mb.characterKey && other.element === mb.element
      )
      if (totalFavoniusProcs === 0) {
        recommendations.push('favonius')
      }
      if (sameEleAllies.length === 0) {
        recommendations.push(`battery:${mb.element}`)
      } else {
        recommendations.push(`funnel:${mb.characterKey}`)
      }
    }
  }

  return {
    rotationDuration,
    enemyScenario,
    totalSkillUses,
    totalFavoniusProcs,
    enemyParticlesDesc:
      enemyScenario === 'boss'
        ? '1 White Orb (6.0 on-field / 3.6 off-field)'
        : '2 White Orbs + 3 White Particles (AoE)',
    members: memberBreakdowns,
    recommendations: Array.from(new Set(recommendations)),
  }
}
