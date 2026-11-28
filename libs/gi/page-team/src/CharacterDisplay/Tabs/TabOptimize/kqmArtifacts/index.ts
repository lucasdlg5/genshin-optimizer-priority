import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import type {
  ArtCharDatabase,
  ArtSetExclusion,
  ArtSetExclusionKey,
} from '@genshin-optimizer/gi/db'
import { allArtifactSetExclusionKeys } from '@genshin-optimizer/gi/db'
import { KQM_ARTIFACT_PRESETS } from './presets'
import type { KqmArtifactPreset } from './types'

export type { KqmArtifactPreset, KqmArtifactSetKey } from './types'
export { KQM_ARTIFACT_PRESETS }

export function getKqmArtifactPreset(
  characterKey: CharacterKey
): KqmArtifactPreset | undefined {
  return KQM_ARTIFACT_PRESETS[characterKey]
}

/**
 * Builds an OptConfig `artSetExclusion` that keeps ONLY the KQM recommended
 * 4pc set(s) active (and optionally 2pc+2pc mixed sets when `allow2pc` is true).
 * Always excludes 3pc off-set and 5pc off-set (`rainbow: [2, 4]`).
 */
export function buildKqmArtSetExclusion(
  preset: KqmArtifactPreset
): ArtSetExclusion {
  const allowed4 = new Set<ArtSetExclusionKey>(preset.sets4)
  const exclusion: ArtSetExclusion = {}

  for (const key of allArtifactSetExclusionKeys) {
    if (key === 'rainbow') {
      exclusion.rainbow = [2, 4]
      continue
    }
    const excluded: (2 | 4)[] = []
    if (!preset.allow2pc) excluded.push(2)
    if (!allowed4.has(key)) excluded.push(4)
    if (excluded.length) exclusion[key] = excluded
  }

  return exclusion
}

/**
 * Applies the KQM recommended artifact set filter to a single TeamCharacter's OptConfig.
 */
export function applyKqmArtifacts(
  database: ArtCharDatabase,
  teamCharId: string,
  characterKey: CharacterKey
): boolean {
  const preset = getKqmArtifactPreset(characterKey)
  if (!preset) return false
  const teamChar = database.teamChars.get(teamCharId)
  if (!teamChar) return false

  const artSetExclusion = buildKqmArtSetExclusion(preset)
  database.optConfigs.set(teamChar.optConfigId, { artSetExclusion })
  return true
}

/**
 * Applies KQM recommended artifact set filters to every character in a team.
 */
export function applyKqmArtifactsForTeam(
  database: ArtCharDatabase,
  teamId: string
): number {
  const team = database.teams.get(teamId)
  if (!team) return 0
  let applied = 0
  for (const loadoutDatum of team.loadoutData) {
    if (!loadoutDatum?.teamCharId) continue
    const tc = database.teamChars.get(loadoutDatum.teamCharId)
    if (!tc) continue
    if (applyKqmArtifacts(database, loadoutDatum.teamCharId, tc.key)) {
      applied++
    }
  }
  return applied
}
