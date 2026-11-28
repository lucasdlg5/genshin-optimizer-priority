import { notEmpty } from '@genshin-optimizer/common/util'
import type {
  CharacterKey,
  LocationCharacterKey,
} from '@genshin-optimizer/gi/consts'
import { charKeyToLocCharKey } from '@genshin-optimizer/gi/consts'
import type { ICachedWeapon, OptConfig } from '@genshin-optimizer/gi/db'
import { TeamCharacterContext, useDatabase } from '@genshin-optimizer/gi/db-ui'
import { getCharStat, getWeaponStat } from '@genshin-optimizer/gi/stats'
import { useContext, useMemo } from 'react'

export function useTeammateWeaponIds(): string[] {
  const {
    teamCharId,
    team: { loadoutData },
  } = useContext(TeamCharacterContext)
  const database = useDatabase()
  return useMemo(
    () =>
      Array.from(
        new Set(
          loadoutData
            .filter(notEmpty)
            .filter((loadoutDatum) => loadoutDatum.teamCharId !== teamCharId)
            .map(
              (loadoutDatum) =>
                database.teams.getLoadoutWeapon(loadoutDatum)?.id
            )
            .filter(notEmpty)
        )
      ),
    [database, loadoutData, teamCharId]
  )
}

export function getFilteredWeapons({
  allWeapons,
  characterKey,
  optConfig,
  teammateWeaponIds,
  currentWeaponId,
}: {
  allWeapons: readonly ICachedWeapon[]
  characterKey: CharacterKey
  optConfig: OptConfig
  teammateWeaponIds: readonly string[]
  currentWeaponId?: string
}): ICachedWeapon[] {
  const charWeaponType = getCharStat(characterKey).weaponType
  const locKey = charKeyToLocCharKey(characterKey)
  const {
    weaponLevelLow,
    weaponLevelHigh,
    useEquippedWeapon,
    useTeammateWeapon,
    weaponExclusion,
  } = optConfig

  return allWeapons.filter((weapon) => {
    if (getWeaponStat(weapon.key).weaponType !== charWeaponType) return false
    if (weaponExclusion.includes(weapon.id)) return false
    if (weapon.level < weaponLevelLow || weapon.level > weaponLevelHigh)
      return false
    if (
      !useTeammateWeapon &&
      weapon.id !== currentWeaponId &&
      teammateWeaponIds.includes(weapon.id)
    )
      return false
    if (
      !useEquippedWeapon &&
      weapon.id !== currentWeaponId &&
      weapon.location &&
      weapon.location !== locKey
    )
      return false
    return true
  })
}

function weaponSignature(weapon: ICachedWeapon): string {
  return `${weapon.key}|${weapon.level}|${weapon.ascension}|${weapon.refinement}`
}

function weaponPreferenceScore(
  weapon: ICachedWeapon,
  currentWeaponId?: string,
  locKey?: LocationCharacterKey
): number {
  if (weapon.id === currentWeaponId) return 3
  if (locKey && weapon.location === locKey) return 2
  if (!weapon.location) return 1
  return 0
}

/**
 * Deduplicates mathematically identical weapons (same key, level, ascension,
 * refinement) so the solver evaluates each unique weapon configuration once,
 * and sorts candidates to warm up Branch-and-Bound pruning quickly.
 */
export function deduplicateAndSortWeapons(
  weapons: readonly ICachedWeapon[],
  characterKey: CharacterKey,
  currentWeaponId?: string
): ICachedWeapon[] {
  const locKey = charKeyToLocCharKey(characterKey)
  const bySignature = new Map<string, ICachedWeapon>()

  for (const weapon of weapons) {
    const sig = weaponSignature(weapon)
    const existing = bySignature.get(sig)
    if (
      !existing ||
      weaponPreferenceScore(weapon, currentWeaponId, locKey) >
        weaponPreferenceScore(existing, currentWeaponId, locKey)
    ) {
      bySignature.set(sig, weapon)
    }
  }

  return Array.from(bySignature.values()).sort((a, b) => {
    // Only evaluate currentWeaponId first if it is an invested >=4★ weapon; never put a Lv.1 1★ placeholder ahead of 5★ weapons
    const aStrongCurrent =
      a.id === currentWeaponId &&
      getWeaponStat(a.key).rarity >= 4 &&
      a.level >= 70
    const bStrongCurrent =
      b.id === currentWeaponId &&
      getWeaponStat(b.key).rarity >= 4 &&
      b.level >= 70
    if (aStrongCurrent !== bStrongCurrent) return aStrongCurrent ? -1 : 1

    const rarityDiff = getWeaponStat(b.key).rarity - getWeaponStat(a.key).rarity
    if (rarityDiff !== 0) return rarityDiff

    if (b.level !== a.level) return b.level - a.level
    if (b.ascension !== a.ascension) return b.ascension - a.ascension
    return b.refinement - a.refinement
  })
}
