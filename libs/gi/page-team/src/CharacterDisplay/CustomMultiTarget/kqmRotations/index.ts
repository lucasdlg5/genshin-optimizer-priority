import type { CharacterKey, GenderKey } from '@genshin-optimizer/gi/consts'
import { charKeyToLocGenderedCharKey } from '@genshin-optimizer/gi/consts'
import type {
  ArtCharDatabase,
  CustomMultiTarget,
} from '@genshin-optimizer/gi/db'
import { initCustomTarget } from '@genshin-optimizer/gi/db'
import { i18n } from '@genshin-optimizer/gi/i18n'
import { KQM_ROTATIONS } from './presets'
import type { KqmRotationPreset } from './types'

export type {
  KqmRotationBatchMap,
  KqmRotationPreset,
  KqmRotationStep,
} from './types'
export { KQM_ROTATIONS }

export function getKqmRotation(
  characterKey: CharacterKey
): KqmRotationPreset | undefined {
  return KQM_ROTATIONS[characterKey]
}

export function getLocalizedCharacterName(
  characterKey: CharacterKey,
  gender: GenderKey = 'F'
): string {
  const locKey = charKeyToLocGenderedCharKey(characterKey, gender)
  if (i18n.exists(`charNames_gen:${locKey}`)) {
    return String(i18n.t(`charNames_gen:${locKey}`))
  }
  return characterKey
}

export function getKqmRotationName(
  characterKey: CharacterKey,
  gender: GenderKey = 'F'
): string {
  return `Rotacao ${getLocalizedCharacterName(characterKey, gender)}`
}

/**
 * Builds a CustomMultiTarget object from a character's KQM Quick Guide rotation preset.
 * Always uses `avgHit` with no reactions by default.
 */
export function buildKqmCustomMultiTarget(
  characterKey: CharacterKey,
  gender: GenderKey = 'F'
): CustomMultiTarget | undefined {
  const preset = getKqmRotation(characterKey)
  if (!preset) return undefined

  const name = getKqmRotationName(characterKey, gender)
  const description = `${preset.comboNotation} — ${preset.description} (${preset.sourceUrl})`

  return {
    name,
    description,
    targets: preset.steps.map((s) => ({
      ...initCustomTarget(s.path, s.weight),
      hitMode: 'avgHit',
      description: s.description ?? '',
    })),
  }
}

/**
 * Creates or replaces the `Rotacao [Nome]` CustomMultiTarget for a TeamCharacter
 * and selects it as the active Optimization Target in the character's OptConfig.
 */
export function applyKqmRotation(
  database: ArtCharDatabase,
  teamCharId: string,
  characterKey: CharacterKey,
  gender: GenderKey = 'F'
): { index: number; name: string } | undefined {
  const mtarget = buildKqmCustomMultiTarget(characterKey, gender)
  if (!mtarget) return undefined

  const teamChar = database.teamChars.get(teamCharId)
  if (!teamChar) return undefined

  const existing = [...teamChar.customMultiTargets]
  const existingIdx = existing.findIndex((t) => t.name === mtarget.name)
  let targetIndex: number
  if (existingIdx >= 0) {
    existing[existingIdx] = mtarget
    targetIndex = existingIdx
  } else {
    existing.push(mtarget)
    targetIndex = existing.length - 1
  }

  database.teamChars.set(teamCharId, { customMultiTargets: existing })
  database.optConfigs.set(teamChar.optConfigId, {
    optimizationTarget: ['custom', String(targetIndex)],
  })

  return { index: targetIndex, name: mtarget.name }
}

/**
 * Applies KQM Quick Guide rotations to every character in a team and selects
 * each character's `Rotacao [Nome]` as their active Optimization Target.
 */
export function applyKqmRotationsForTeam(
  database: ArtCharDatabase,
  teamId: string,
  gender: GenderKey = 'F'
): number {
  const team = database.teams.get(teamId)
  if (!team) return 0
  let applied = 0
  for (const loadoutDatum of team.loadoutData) {
    if (!loadoutDatum?.teamCharId) continue
    const tc = database.teamChars.get(loadoutDatum.teamCharId)
    if (!tc) continue
    if (applyKqmRotation(database, loadoutDatum.teamCharId, tc.key, gender)) {
      applied++
    }
  }
  return applied
}
