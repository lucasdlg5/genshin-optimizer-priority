import {
  deepClone,
  evalIfFunc,
  layeredAssignment,
  objKeyMap,
} from '@genshin-optimizer/common/util'
import type {
  ArtifactSetKey,
  CharacterKey,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import { absorbableEle, allArtifactSetKeys } from '@genshin-optimizer/gi/consts'
import type { TeamCharacter } from '@genshin-optimizer/gi/db'
import { getArtSheet } from '@genshin-optimizer/gi/sheets'
import { getCharEle } from '@genshin-optimizer/gi/stats'
import type { UIData } from '@genshin-optimizer/gi/uidata'

type ConditionalValues = TeamCharacter['conditional']

const SKIP_CONDITIONAL_SUBKEYS = new Set([
  // Gilded Dreams manual member count overrides (leave auto team tally intact)
  'overrideSameNum',
  'overrideOtherNum',
])

function pickMaxStateKey(
  stateKeys: string[],
  charEle: ElementKey,
  setKey: ArtifactSetKey
): string | undefined {
  if (!stateKeys.length) return undefined

  // For Archaic Petra / Tiny Miracle elemental selectors, prefer the character's own element if available
  if (setKey === 'ArchaicPetra' || setKey === 'TinyMiracle') {
    if (stateKeys.includes(charEle)) return charEle
    const fallback = absorbableEle.find((e) => stateKeys.includes(e))
    return fallback ?? stateKeys[stateKeys.length - 1]
  }

  // If all keys parse as finite numbers (e.g. stacks 1,2,3,4 or healing 1000..15000), pick the numeric maximum
  const numericEntries = stateKeys.map((k) => ({ k, n: Number(k) }))
  if (numericEntries.every(({ n }) => Number.isFinite(n))) {
    return numericEntries.reduce((best, cur) => (cur.n >= best.n ? cur : best))
      .k
  }

  // Otherwise pick the last state (e.g. BlizzardStrayer 'frozen' > 'cryo', single-state 'on', etc.)
  return stateKeys[stateKeys.length - 1]
}

/**
 * Builds a copy of `currentConditional` where every artifact set conditional
 * is activated at its highest available option for `characterKey`, and returns
 * a cleared `artSetExclusion` (`{}`) so all 2pc, 4pc, and rainbow sets are allowed.
 */
export function buildMaxArtifactConditionals(
  currentConditional: ConditionalValues,
  characterKey: CharacterKey,
  fakeData: UIData
): ConditionalValues {
  const nextConditional = deepClone(currentConditional)
  const charEle = getCharEle(characterKey)

  for (const setKey of allArtifactSetKeys) {
    // Special handling for ScrollOfTheHeroOfCinderCity where states depend on UIData
    if (setKey === 'ScrollOfTheHeroOfCinderCity') {
      const otherEles = absorbableEle.filter((e) => e !== charEle)
      const targetEle = otherEles[0] ?? 'pyro'
      layeredAssignment(
        nextConditional,
        [setKey, `react_${targetEle}`],
        targetEle
      )
      layeredAssignment(
        nextConditional,
        [setKey, `nightsoul_${targetEle}`],
        targetEle
      )
      continue
    }

    const sheet = getArtSheet(setKey)
    if (!sheet) continue

    for (const setNumKey of ['2', '4'] as const) {
      const effect = sheet.setEffects[setNumKey]
      if (!effect) continue

      for (const doc of effect.document) {
        if (!('states' in doc)) continue

        if ('path' in doc) {
          // Exclusive / Simple conditional
          const subKey = doc.path[doc.path.length - 1]
          if (SKIP_CONDITIONAL_SUBKEYS.has(subKey)) continue

          const statesObj = evalIfFunc(doc.states, fakeData)
          const stateKeys = Object.keys(statesObj)
          const chosen = pickMaxStateKey(stateKeys, charEle, setKey)
          if (chosen !== undefined) {
            layeredAssignment(nextConditional, doc.path, chosen)
          }
        } else {
          // Multiple conditional (e.g. Viridescent Venerer swirl elements)
          const statesObj = evalIfFunc(doc.states, fakeData)
          for (const [stateKey, st] of Object.entries(statesObj)) {
            if (st?.path) {
              layeredAssignment(nextConditional, st.path, stateKey)
            }
          }
        }
      }
    }
  }

  return nextConditional
}

export function getAllowedAllArtSetExclusion() {
  return objKeyMap([], () => [] as (2 | 4)[])
}
