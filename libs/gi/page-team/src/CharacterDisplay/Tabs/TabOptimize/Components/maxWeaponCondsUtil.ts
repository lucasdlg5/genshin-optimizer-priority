import {
  deepClone,
  evalIfFunc,
  layeredAssignment,
} from '@genshin-optimizer/common/util'
import type {
  CharacterKey,
  ElementKey,
  LocationCharacterKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  allWeaponKeys,
  charKeyToLocCharKey,
} from '@genshin-optimizer/gi/consts'
import type { ICachedWeapon, TeamCharacter } from '@genshin-optimizer/gi/db'
import { getWeaponSheet } from '@genshin-optimizer/gi/sheets'
import {
  getCharEle,
  getCharStat,
  getWeaponStat,
} from '@genshin-optimizer/gi/stats'
import type { UIData } from '@genshin-optimizer/gi/uidata'

type ConditionalValues = TeamCharacter['conditional']

function weaponCopyPreference(
  weapon: ICachedWeapon,
  currentWeaponId?: string,
  locKey?: LocationCharacterKey
): number {
  if (weapon.id === currentWeaponId) return 3
  if (locKey && weapon.location === locKey) return 2
  if (!weapon.location) return 1
  return 0
}

function compareWeaponCopies(
  a: ICachedWeapon,
  b: ICachedWeapon,
  currentWeaponId?: string,
  locKey?: LocationCharacterKey
): number {
  if (b.level !== a.level) return b.level - a.level
  if (b.ascension !== a.ascension) return b.ascension - a.ascension
  if (b.refinement !== a.refinement) return b.refinement - a.refinement
  return (
    weaponCopyPreference(b, currentWeaponId, locKey) -
    weaponCopyPreference(a, currentWeaponId, locKey)
  )
}

/**
 * Selects only the single strongest weapon instance per unique `WeaponKey`
 * matching `characterKey`'s weapon type, returning the `weaponExclusion` ID list
 * that excludes all duplicate copies of the same weapon.
 */
export function getUniqueBestWeaponsAndExclusion({
  allWeapons,
  characterKey,
  currentWeaponId,
  existingWeaponExclusion = [],
}: {
  allWeapons: readonly ICachedWeapon[]
  characterKey: CharacterKey
  currentWeaponId?: string
  existingWeaponExclusion?: readonly string[]
}): {
  weaponExclusion: string[]
  keptWeapons: ICachedWeapon[]
  keptWeaponKeys: WeaponKey[]
} {
  const charWeaponType = getCharStat(characterKey).weaponType
  const locKey = charKeyToLocCharKey(characterKey)

  const weaponsOfType = allWeapons.filter(
    (w) => getWeaponStat(w.key).weaponType === charWeaponType
  )
  const weaponsOfTypeIds = new Set(weaponsOfType.map((w) => w.id))

  const bestByKey = new Map<WeaponKey, ICachedWeapon>()
  for (const weapon of weaponsOfType) {
    const existing = bestByKey.get(weapon.key)
    if (
      !existing ||
      compareWeaponCopies(weapon, existing, currentWeaponId, locKey) < 0
    ) {
      bestByKey.set(weapon.key, weapon)
    }
  }

  const keptWeapons = Array.from(bestByKey.values())
  const keptIds = new Set(keptWeapons.map((w) => w.id))
  const keptWeaponKeys = Array.from(bestByKey.keys())

  const excludedDuplicateIds = weaponsOfType
    .filter((w) => !keptIds.has(w.id))
    .map((w) => w.id)

  const preservedOtherTypeExclusions = existingWeaponExclusion.filter(
    (id) => !weaponsOfTypeIds.has(id)
  )

  return {
    weaponExclusion: [...preservedOtherTypeExclusions, ...excludedDuplicateIds],
    keptWeapons,
    keptWeaponKeys,
  }
}

function pickMaxWeaponStateKey(
  stateKeys: string[],
  charEle: ElementKey,
  weaponKey: WeaponKey
): string | undefined {
  if (!stateKeys.length) return undefined

  // Slingshot: 'less' (< 0.3s) grants up to +60% DMG, while 'more' inflicts -10% DMG
  if (weaponKey === 'Slingshot' && stateKeys.includes('less')) {
    return 'less'
  }

  // Deathmatch: 'oneOrNone' (<= 1 enemy) grants higher ATK% (+24%..+48%) than 'moreThanOne'
  if (weaponKey === 'Deathmatch' && stateKeys.includes('oneOrNone')) {
    return 'oneOrNone'
  }

  // Moonweaver's Dawn: '40' grants up to +56% Burst DMG vs '60' granting up to +32%
  if (weaponKey === 'MoonweaversDawn' && stateKeys.includes('40')) {
    return '40'
  }

  // The Widsith: 'aria' grants up to +96% Elemental DMG Bonus
  if (weaponKey === 'TheWidsith' && stateKeys.includes('aria')) {
    return 'aria'
  }

  // Hakushin Ring: prefer bearer's element if available, else first reaction element
  if (weaponKey === 'HakushinRing') {
    if (stateKeys.includes(charEle)) return charEle
    return stateKeys[0]
  }

  // Numeric stacks / energy / bond tiers: pick the numeric maximum
  const numericEntries = stateKeys.map((k) => ({ k, n: Number(k) }))
  if (numericEntries.every(({ n }) => Number.isFinite(n))) {
    return numericEntries.reduce((best, cur) => (cur.n >= best.n ? cur : best))
      .k
  }

  // Otherwise pick the last state (e.g. 'on', 'protected', 'dawnblaze')
  return stateKeys[stateKeys.length - 1]
}

/**
 * Builds a copy of `currentConditional` where every passive conditional of
 * `targetWeaponKeys` (defaults to all weapons of `characterKey`'s weapon type)
 * is activated at its highest available option.
 */
export function buildMaxWeaponConditionals(
  currentConditional: ConditionalValues,
  characterKey: CharacterKey,
  fakeData: UIData,
  targetWeaponKeys?: readonly WeaponKey[]
): ConditionalValues {
  const nextConditional = deepClone(currentConditional)
  const charWeaponType = getCharStat(characterKey).weaponType
  const charEle = getCharEle(characterKey)

  const allKeysOfType = allWeaponKeys.filter(
    (k) => getWeaponStat(k).weaponType === charWeaponType
  )
  const keysToEnable = targetWeaponKeys ?? allKeysOfType
  const keysToEnableSet = new Set<string>(keysToEnable)

  // Clear stale conditionals on weapons of this type that are not in targetWeaponKeys
  for (const k of allKeysOfType) {
    if (!keysToEnableSet.has(k) && k in nextConditional) {
      delete nextConditional[k]
    }
  }

  for (const weaponKey of keysToEnable) {
    const sheet = getWeaponSheet(weaponKey)
    if (!sheet) continue

    for (const doc of sheet.document) {
      if (!('states' in doc)) continue

      if ('path' in doc) {
        const statesObj = evalIfFunc(doc.states, fakeData)
        const stateKeys = Object.keys(statesObj)
        const chosen = pickMaxWeaponStateKey(stateKeys, charEle, weaponKey)
        if (chosen !== undefined) {
          layeredAssignment(nextConditional, doc.path, chosen)
        }
      } else {
        const statesObj = evalIfFunc(doc.states, fakeData)
        for (const [stateKey, st] of Object.entries(statesObj)) {
          if (st?.path) {
            layeredAssignment(nextConditional, st.path, stateKey)
          }
        }
      }
    }
  }

  return nextConditional
}
