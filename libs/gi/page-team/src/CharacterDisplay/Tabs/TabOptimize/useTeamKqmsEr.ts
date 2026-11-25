import { notEmpty } from '@genshin-optimizer/common/util'
import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
  useOptConfig,
  useTeam,
} from '@genshin-optimizer/gi/db-ui'
import { useContext, useMemo } from 'react'
import type { TeamKqmsErResult, TeamMemberErInput } from './kqmsErCalc'
import { calculateTeamKqmsEr } from './kqmsErCalc'

export function useTeamKqmsEr(): {
  teamKqms: TeamKqmsErResult
  currentCharErFloor: number
} {
  const database = useDatabase()
  const { gender } = useDBMeta()
  const {
    teamId,
    teamChar: { key: characterKey, optConfigId },
  } = useContext(TeamCharacterContext)
  const team = useTeam(teamId)
  const optConfig = useOptConfig(optConfigId)

  const rotationDuration = optConfig?.kqmsRotationDuration ?? 20
  const enemyScenario = optConfig?.kqmsEnemyScenario ?? 'boss'

  return useMemo(() => {
    const loadoutData = team?.loadoutData ?? []
    const members: TeamMemberErInput[] = loadoutData
      .map((ld, index) => {
        if (!ld) return undefined
        const tc = database.teamChars.get(ld.teamCharId)
        if (!tc) return undefined
        const dbChar = database.chars.get(tc.key)
        const weapon = database.teams.getLoadoutWeapon(ld)
        const arts = database.teams.getLoadoutArtifacts(ld)
        const artifactSetCounts: Partial<Record<ArtifactSetKey, number>> = {}
        for (const art of Object.values(arts)) {
          if (art?.setKey) {
            artifactSetCounts[art.setKey] =
              (artifactSetCounts[art.setKey] ?? 0) + 1
          }
        }
        return {
          characterKey: tc.key,
          constellation: dbChar?.constellation ?? 0,
          isOnFieldPrimary: index === 0,
          weaponKey: weapon?.key,
          weaponRefinement: weapon?.refinement ?? 1,
          artifactSetCounts,
        } satisfies TeamMemberErInput
      })
      .filter(notEmpty)

    const teamKqms = calculateTeamKqmsEr({
      members,
      gender,
      rotationDuration,
      enemyScenario,
    })

    const currentMember = teamKqms.members.find(
      (m) => m.characterKey === characterKey
    )

    return {
      teamKqms,
      currentCharErFloor: currentMember?.recommendedErPercent ?? 100,
    }
  }, [team, database, gender, rotationDuration, enemyScenario, characterKey])
}
