import {
  deepClone,
  evalIfFunc,
  layeredAssignment,
  objPathValue,
} from '@genshin-optimizer/common/util'
import type {
  CharacterKey,
  ElementKey,
  GenderKey,
} from '@genshin-optimizer/gi/consts'
import type { ArtCharDatabase, TeamCharacter } from '@genshin-optimizer/gi/db'
import {
  getCharSheet,
  type TalentSheetElementKey,
} from '@genshin-optimizer/gi/sheets'
import { getCharEle } from '@genshin-optimizer/gi/stats'
import { getTeamDataCalc } from '@genshin-optimizer/gi/ui'
import type { UIData } from '@genshin-optimizer/gi/uidata'
import { uiInput as input } from '@genshin-optimizer/gi/wr'

type ConditionalValues = TeamCharacter['conditional']

const ALL_TALENT_SHEET_KEYS: readonly TalentSheetElementKey[] = [
  'auto',
  'skill',
  'burst',
  'sprint',
  'passive',
  'passive1',
  'passive2',
  'passive3',
  'lockedPassive',
  'constellation1',
  'constellation2',
  'constellation3',
  'constellation4',
  'constellation5',
  'constellation6',
]

function isTalentKeyUnlocked(
  talentKey: TalentSheetElementKey,
  ascension: number,
  constellation: number
): boolean {
  if (talentKey === 'passive1') return ascension >= 1
  if (talentKey === 'passive2') return ascension >= 4
  if (talentKey.startsWith('constellation')) {
    const reqConstellation = Number(talentKey.slice('constellation'.length))
    return constellation >= reqConstellation
  }
  return true
}

function pickMaxTalentStateKey(
  stateKeys: string[],
  charEle: ElementKey
): string | undefined {
  if (!stateKeys.length) return undefined
  if (stateKeys.length === 1) return stateKeys[0]

  // Stellar Radiance conditionals (['sc', 'ss'] or ['on', 'ss']):
  // Anemo characters use Stellar-Swirl ('ss'), while Cryo/Electro/Geo characters use Stellar-Conduct ('sc'/'on')
  if (
    stateKeys.length === 2 &&
    stateKeys[1] === 'ss' &&
    (stateKeys[0] === 'sc' || stateKeys[0] === 'on')
  ) {
    return charEle === 'anemo' ? 'ss' : stateKeys[0]
  }

  // Numeric stacks / points / percentages: select the highest numeric option
  const numericEntries = stateKeys.map((k) => ({ k, n: Number(k) }))
  if (numericEntries.every(({ n }) => Number.isFinite(n))) {
    return numericEntries.reduce((best, cur) => (cur.n >= best.n ? cur : best))
      .k
  }

  // Otherwise pick the last state (e.g. 'above' > 'below', 'higher' > 'lower', 'overloaded' > 'steady', 'stack2' > 'stack1')
  return stateKeys[stateKeys.length - 1]
}

/**
 * Computes updated `conditional` values for a single character's Talent tab,
 * strictly respecting their current Ascension, Constellation, and `canShow` conditions
 * without modifying Constellation or Talent Levels.
 */
export function buildMaxTalentConditionalsForChar({
  currentConditional,
  characterKey,
  gender,
  charUIData,
}: {
  currentConditional: ConditionalValues
  characterKey: CharacterKey
  gender: GenderKey
  charUIData: UIData
}): { nextConditional: ConditionalValues; changed: boolean } {
  const nextConditional = deepClone(currentConditional)
  let changed = false

  const characterSheet = getCharSheet(characterKey, gender)
  if (!characterSheet) return { nextConditional, changed }

  const ascension = charUIData.get(input.asc).value
  const constellation = charUIData.get(input.constellation).value
  const charEle = getCharEle(characterKey)

  for (const talentKey of ALL_TALENT_SHEET_KEYS) {
    if (!isTalentKeyUnlocked(talentKey, ascension, constellation)) continue
    const talentElem = characterSheet.getTalentOfKey(talentKey)
    if (!talentElem?.sections?.length) continue

    for (const section of talentElem.sections) {
      if (!('states' in section)) continue
      if (section.canShow && !charUIData.get(section.canShow).value) continue

      const statesObj = evalIfFunc(section.states, charUIData)
      if ('path' in section) {
        const stateKeys = Object.keys(statesObj)
        const chosen = pickMaxTalentStateKey(stateKeys, charEle)
        if (chosen !== undefined) {
          const prev = objPathValue(nextConditional, section.path)
          if (prev !== chosen) {
            layeredAssignment(nextConditional, section.path, chosen)
            changed = true
          }
        }
      } else {
        for (const [stateKey, st] of Object.entries(statesObj)) {
          if (st?.path) {
            const prev = objPathValue(nextConditional, st.path)
            if (prev !== stateKey) {
              layeredAssignment(nextConditional, st.path, stateKey)
              changed = true
            }
          }
        }
      }
    }
  }

  return { nextConditional, changed }
}

/**
 * Enables all currently unlockable Talent/Passive conditionals at their maximum
 * available option across all members of `teamId` (running up to 3 passes so
 * chained conditionals whose `canShow` depends on an earlier passive/synergy unlock properly).
 * Does NOT modify character Constellation or Talent Levels.
 */
export function enableAllTeamTalentPassivesMax(
  database: ArtCharDatabase,
  teamId: string,
  gender: GenderKey
): void {
  const team = database.teams.get(teamId)
  if (!team) return
  const firstTeamCharId = team.loadoutData.find(Boolean)?.teamCharId
  if (!firstTeamCharId) return

  for (let pass = 0; pass < 3; pass++) {
    const calcTeamData = getTeamDataCalc(
      database,
      teamId,
      gender,
      firstTeamCharId,
      0
    )
    if (!calcTeamData) break

    let anyChanged = false
    for (const ld of team.loadoutData) {
      if (!ld) continue
      const tc = database.teamChars.get(ld.teamCharId)
      if (!tc) continue
      const charUIData = calcTeamData[tc.key]?.target
      if (!charUIData) continue

      const { nextConditional, changed } = buildMaxTalentConditionalsForChar({
        currentConditional: tc.conditional,
        characterKey: tc.key,
        gender,
        charUIData,
      })
      if (changed) {
        database.teamChars.set(ld.teamCharId, (teamChar) => {
          teamChar.conditional = nextConditional
        })
        anyChanged = true
      }
    }

    if (!anyChanged) break
  }
}

/**
 * Enables all currently unlockable Talent/Passive conditionals at their maximum
 * available option for a single `teamCharId` within `teamId`.
 */
export function enableSingleCharTalentPassivesMax(
  database: ArtCharDatabase,
  teamId: string,
  teamCharId: string,
  gender: GenderKey
): void {
  for (let pass = 0; pass < 3; pass++) {
    const calcTeamData = getTeamDataCalc(
      database,
      teamId,
      gender,
      teamCharId,
      0
    )
    if (!calcTeamData) break

    const tc = database.teamChars.get(teamCharId)
    if (!tc) break
    const charUIData = calcTeamData[tc.key]?.target
    if (!charUIData) break

    const { nextConditional, changed } = buildMaxTalentConditionalsForChar({
      currentConditional: tc.conditional,
      characterKey: tc.key,
      gender,
      charUIData,
    })
    if (!changed) break
    database.teamChars.set(teamCharId, (teamChar) => {
      teamChar.conditional = nextConditional
    })
  }
}
