import { CardThemed, InfoTooltip, SqBadge } from '@genshin-optimizer/common/ui'
import {
  notEmpty,
  objPathValue,
  valueString,
} from '@genshin-optimizer/common/util'
import { artifactDefIcon } from '@genshin-optimizer/gi/assets'
import type {
  ArtifactSetKey,
  CharacterKey,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import { absorbableEle } from '@genshin-optimizer/gi/consts'
import {
  useDatabase,
  useDBMeta,
  useOptConfig,
  useTeam,
} from '@genshin-optimizer/gi/db-ui'
import { getCharEle } from '@genshin-optimizer/gi/stats'
import type { TeamData } from '@genshin-optimizer/gi/ui'
import {
  ArtifactSetName,
  CharacterName,
  getTeamData,
  resolveInfo,
} from '@genshin-optimizer/gi/ui'
import type { CalcResult } from '@genshin-optimizer/gi/uidata'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { Data } from '@genshin-optimizer/gi/wr'
import { constant, uiInput as input } from '@genshin-optimizer/gi/wr'
import {
  Box,
  CardContent,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type SupportArtifactSpec = {
  setKey: ArtifactSetKey
  desc: string
  getCond: (ele: ElementKey) => Record<string, string>
}

const SUPPORT_ARTIFACT_SPECS: SupportArtifactSpec[] = [
  {
    setKey: 'NoblesseOblige',
    desc: '4pc: +20% ATK',
    getCond: () => ({ set4: 'on' }),
  },
  {
    setKey: 'TenacityOfTheMillelith',
    desc: '4pc: +20% ATK, +30% Shield Strength',
    getCond: () => ({ skill: 'cast' }),
  },
  {
    setKey: 'Instructor',
    desc: '4pc: +120 Elemental Mastery',
    getCond: () => ({ set4: 'on' }),
  },
  {
    setKey: 'HeartOfTheFurnace',
    desc: '4pc: +50% Stellar Reaction DMG',
    getCond: () => ({ '4Stellar': 'on' }),
  },
  {
    setKey: 'ViridescentVenerer',
    desc: '4pc: -40% Elemental RES (Swirl)',
    getCond: (ele) =>
      absorbableEle.includes(ele as (typeof absorbableEle)[number])
        ? { [`swirl${ele}`]: ele }
        : { swirlpyro: 'pyro' },
  },
  {
    setKey: 'ScrollOfTheHeroOfCinderCity',
    desc: '4pc: +40% Elemental DMG (Nightsoul)',
    getCond: (ele) => ({
      [`react_${ele}`]: ele,
      [`nightsoul_${ele}`]: ele,
    }),
  },
  {
    setKey: 'ArchaicPetra',
    desc: '4pc: +35% Elemental DMG (Crystallize)',
    getCond: (ele) =>
      absorbableEle.includes(ele as (typeof absorbableEle)[number])
        ? { element: ele }
        : { element: 'pyro' },
  },
  {
    setKey: 'DeepwoodMemories',
    desc: '4pc: -30% Dendro RES',
    getCond: () => ({ set4: 'on' }),
  },
  {
    setKey: 'SilkenMoonsSerenade',
    desc: '4pc: +60/120 EM, +10% Lunar Reaction DMG',
    getCond: () => ({ '4GleamingMoon': 'on' }),
  },
  {
    setKey: 'NightOfTheSkysUnveiling',
    desc: '4pc: +10% Lunar Reaction DMG',
    getCond: () => ({ '4GleamingMoon': 'on' }),
  },
  {
    setKey: 'CelestialGift',
    desc: '4pc: +20%/40% Elemental DMG (Hexerei)',
    getCond: () => ({ set4: 'on' }),
  },
  {
    setKey: 'SongOfDaysPast',
    desc: '4pc: +1200 Flat DMG (15,000 Healing)',
    getCond: () => ({ healing: '15000' }),
  },
]

function stripSetData(
  dataArr: Data[],
  stripAllArtSets: boolean,
  setKeyToStrip: ArtifactSetKey
): Data[] {
  return dataArr.map((d) => {
    const needsArtStrip = stripAllArtSets && d.artSet
    const needsCondStrip =
      d.conditional &&
      typeof d.conditional === 'object' &&
      setKeyToStrip in d.conditional
    if (!needsArtStrip && !needsCondStrip) return d

    const clone: Data = { ...d }
    if (needsArtStrip) {
      delete clone.artSet
    }
    if (needsCondStrip && clone.conditional) {
      const nextCond = { ...(clone.conditional as Record<string, unknown>) }
      delete nextCond[setKeyToStrip]
      clone.conditional = nextCond as Data['conditional']
    }
    return clone
  })
}

export const SupportArtifactBuffComparison = memo(
  function SupportArtifactBuffComparison({
    teamId,
    teamCharId,
    characterKey,
    teamData,
  }: {
    teamId: string
    teamCharId: string
    characterKey: CharacterKey
    teamData?: TeamData
  }) {
    const { t } = useTranslation('page_team')
    const database = useDatabase()
    const { gender } = useDBMeta()
    const team = useTeam(teamId)
    const teamChar = database.teamChars.get(teamCharId)
    const optConfig = useOptConfig(teamChar?.optConfigId ?? '')
    const optimizationTarget = optConfig?.optimizationTarget

    // '' = add extra buff to team; otherwise CharacterKey of teammate whose 4pc set is replaced
    const [replaceCharKey, setReplaceCharKey] = useState<CharacterKey | ''>('')

    const teammateKeys = useMemo(() => {
      if (!team) return [] as CharacterKey[]
      return team.loadoutData
        .slice(1)
        .filter(notEmpty)
        .map((ld) => database.teamChars.get(ld.teamCharId)?.key)
        .filter(notEmpty)
    }, [team, database])

    const effectiveReplaceKey =
      replaceCharKey && teammateKeys.includes(replaceCharKey)
        ? replaceCharKey
        : ''

    const comparison = useMemo(() => {
      if (!optimizationTarget?.length || !teamData) return undefined
      const activeTargetUIData = teamData[characterKey]?.target
      if (!activeTargetUIData) return undefined

      const baseTargetNode = objPathValue(
        activeTargetUIData.getDisplay(),
        optimizationTarget
      ) as CalcResult | undefined
      if (!baseTargetNode || typeof baseTargetNode.value !== 'number')
        return undefined

      const baseValue = baseTargetNode.value
      const targetInfo = resolveInfo(baseTargetNode.info)
      const targetName = targetInfo.name ?? optimizationTarget.join(' / ')
      const targetUnit = targetInfo.unit ?? ''
      const targetFixed = targetInfo.fixed

      const rawTeamBundle = getTeamData(database, teamId, teamCharId, 0)
      if (!rawTeamBundle) return undefined
      const baseTeamData = rawTeamBundle.teamData

      // Detect which support sets are currently active (>= 4pc) on each team member
      const activeSetsByChar = new Map<CharacterKey, Set<ArtifactSetKey>>()
      const allActiveSupportSets = new Set<ArtifactSetKey>()
      for (const [ck, tdc] of Object.entries(teamData)) {
        if (!tdc) continue
        const setsForChar = new Set<ArtifactSetKey>()
        for (const spec of SUPPORT_ARTIFACT_SPECS) {
          const cnt = tdc.target.get(input.artSet[spec.setKey]).value ?? 0
          if (cnt >= 4) {
            setsForChar.add(spec.setKey)
            allActiveSupportSets.add(spec.setKey)
          }
        }
        activeSetsByChar.set(ck as CharacterKey, setsForChar)
      }

      const charEle = getCharEle(characterKey)
      // Choose carrier: selected teammate (if replacing), else first teammate, else on-field character
      const defaultCarrierKey =
        teammateKeys[0] ?? (characterKey as CharacterKey)
      const carrierKey = effectiveReplaceKey || defaultCarrierKey

      // Sets already equipped by OTHER members (not the replaced teammate)
      const otherMembersSets = new Set<ArtifactSetKey>()
      for (const [ck, sets] of activeSetsByChar.entries()) {
        if (effectiveReplaceKey && ck === effectiveReplaceKey) continue
        for (const s of sets) otherMembersSets.add(s)
      }

      const rows = SUPPORT_ARTIFACT_SPECS.filter((spec) => {
        if (effectiveReplaceKey) {
          // When simulating replacing a teammate's set, skip sets already worn by OTHER members
          // and skip the set already worn by the replaced teammate
          if (otherMembersSets.has(spec.setKey)) return false
          if (activeSetsByChar.get(effectiveReplaceKey)?.has(spec.setKey))
            return false
          return true
        }
        // Default mode: only show support sets NOT currently present in the team
        return !allActiveSupportSets.has(spec.setKey)
      })
        .map((spec) => {
          const condRaw = spec.getCond(charEle)
          const condNodes = Object.fromEntries(
            Object.entries(condRaw).map(([k, v]) => [k, constant(v)])
          )

          const simTeamData: Partial<Record<CharacterKey, Data[]>> = {
            ...baseTeamData,
          }
          const carrierData = baseTeamData[carrierKey]
          if (!carrierData) return undefined

          const cleanedCarrierData = stripSetData(
            carrierData,
            Boolean(effectiveReplaceKey),
            spec.setKey
          )
          const injectedData: Data = {
            artSet: { [spec.setKey]: constant(4) },
            conditional: {
              [spec.setKey]: condNodes,
            } as unknown as Data['conditional'],
          }
          simTeamData[carrierKey] = [injectedData, ...cleanedCarrierData]

          const simUI = uiDataForTeam(simTeamData, gender, characterKey)[
            characterKey
          ]?.target
          if (!simUI) return undefined

          const simNode = objPathValue(
            simUI.getDisplay(),
            optimizationTarget
          ) as CalcResult | undefined
          if (!simNode || typeof simNode.value !== 'number') return undefined

          const simValue = simNode.value
          const diff = simValue - baseValue
          const diffPct = baseValue !== 0 ? (diff / baseValue) * 100 : 0

          return {
            setKey: spec.setKey,
            desc: spec.desc,
            simValue,
            diff,
            diffPct,
          }
        })
        .filter(notEmpty)
        .sort((a, b) => b.diffPct - a.diffPct)

      return {
        targetName,
        targetUnit,
        targetFixed,
        baseValue,
        activeSupportSets: Array.from(allActiveSupportSets),
        rows,
      }
    }, [
      optimizationTarget,
      teamData,
      characterKey,
      database,
      teamId,
      teamCharId,
      teammateKeys,
      effectiveReplaceKey,
      gender,
    ])

    if (!optimizationTarget?.length) {
      return (
        <CardThemed bgt="light">
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 'bold', mb: 0.5 }}
            >
              {t(
                'teamSettings.supportArtBuffs.title',
                'Support Artifact Buffs'
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(
                'teamSettings.supportArtBuffs.noTarget',
                'Select an Optimization Target in the Optimize tab to compare support artifact buffs.'
              )}
            </Typography>
          </CardContent>
        </CardThemed>
      )
    }

    if (!comparison) return null

    const {
      targetName,
      targetUnit,
      targetFixed,
      baseValue,
      activeSupportSets,
      rows,
    } = comparison

    return (
      <CardThemed bgt="light">
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack spacing={1}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {t(
                  'teamSettings.supportArtBuffs.title',
                  'Support Artifact Buffs'
                )}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mt: 0.5,
                  p: 0.75,
                  borderRadius: 1,
                  bgcolor: 'contentDark.main',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', minWidth: 0 }}
                  noWrap
                >
                  {targetName}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 'bold', flexShrink: 0 }}
                >
                  {valueString(baseValue, targetUnit, targetFixed)}
                </Typography>
              </Box>
            </Box>

            {activeSupportSets.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {t('teamSettings.supportArtBuffs.activeInTeam', 'Active:')}
                </Typography>
                {activeSupportSets.map((setKey) => (
                  <SqBadge key={setKey} color="success">
                    <ArtifactSetName setKey={setKey} />
                  </SqBadge>
                ))}
              </Box>
            )}

            {teammateKeys.length > 0 && (
              <FormControl size="small" fullWidth>
                <Select
                  value={effectiveReplaceKey}
                  displayEmpty
                  onChange={(e) =>
                    setReplaceCharKey(e.target.value as CharacterKey | '')
                  }
                  sx={{ fontSize: '0.75rem' }}
                >
                  <MenuItem value="">
                    {t(
                      'teamSettings.supportArtBuffs.modeAdd',
                      'Simulate adding buff to team'
                    )}
                  </MenuItem>
                  {teammateKeys.map((ck) => (
                    <MenuItem key={ck} value={ck}>
                      {t(
                        'teamSettings.supportArtBuffs.modeReplace',
                        'Replace set on:'
                      )}{' '}
                      <CharacterName characterKey={ck} gender={gender} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Divider />

            <Stack spacing={0.5}>
              {rows.map(({ setKey, desc, simValue, diff, diffPct }) => {
                const isGain = diffPct > 0.05
                const isLoss = diffPct < -0.05
                const pctColor = isGain
                  ? 'success.main'
                  : isLoss
                    ? 'error.main'
                    : 'text.secondary'
                const sign = diffPct > 0.05 ? '+' : ''
                const absDiffStr = `${diff > 0 ? '+' : ''}${valueString(
                  diff,
                  targetUnit,
                  targetFixed
                )}`

                return (
                  <Box
                    key={setKey}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 0.75,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: 'contentDark.main',
                    }}
                  >
                    <Box
                      component="img"
                      src={artifactDefIcon(setKey)}
                      sx={{
                        width: 24,
                        height: 24,
                        flexShrink: 0,
                        objectFit: 'contain',
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ flexGrow: 1, minWidth: 0 }}
                      noWrap
                    >
                      <ArtifactSetName setKey={setKey} />
                    </Typography>
                    <InfoTooltip
                      title={
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{ display: 'block' }}
                          >
                            {desc}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: 'block' }}
                          >
                            Δ {absDiffStr}
                          </Typography>
                        </Box>
                      }
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 'bold',
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {valueString(simValue, targetUnit, targetFixed)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 'bold',
                        color: pctColor,
                        minWidth: '3.6em',
                        textAlign: 'right',
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {`${sign}${diffPct.toFixed(1)}%`}
                    </Typography>
                  </Box>
                )
              })}
            </Stack>
          </Stack>
        </CardContent>
      </CardThemed>
    )
  }
)
