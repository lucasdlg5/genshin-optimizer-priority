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
  GenderKey,
} from '@genshin-optimizer/gi/consts'
import { absorbableEle } from '@genshin-optimizer/gi/consts'
import type {
  ArtCharDatabase,
  ICachedArtifact,
  ICachedWeapon,
} from '@genshin-optimizer/gi/db'
import {
  useDatabase,
  useDBMeta,
  useOptConfig,
  useTeam,
  useTeamChar,
} from '@genshin-optimizer/gi/db-ui'
import { getCharEle } from '@genshin-optimizer/gi/stats'
import type { TeamData } from '@genshin-optimizer/gi/ui'
import {
  ArtifactSetName,
  CharacterName,
  getTeamData,
  resolveInfo,
} from '@genshin-optimizer/gi/ui'
import type { CalcResult, UIData } from '@genshin-optimizer/gi/uidata'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { Data, NumNode } from '@genshin-optimizer/gi/wr'
import { constant, uiInput as input, mergeData } from '@genshin-optimizer/gi/wr'
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

export const SUPPORT_ARTIFACT_SPECS: SupportArtifactSpec[] = [
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

function getTargetCalcResult(
  ui: UIData,
  optimizationTarget: string[]
): CalcResult<number> | undefined {
  const fullPath = ['display', ...optimizationTarget]
  let targetNode: NumNode | undefined
  for (const data of ui.data) {
    const raw = objPathValue(data, fullPath) as NumNode | undefined
    if (raw?.operation) targetNode = raw
  }
  return targetNode ? ui.get(targetNode) : undefined
}

export type SupportArtifactComparisonRow = {
  setKey: ArtifactSetKey
  desc: string
  simValue: number
  diff: number
  diffPct: number
}

export type SupportArtifactComparisonResult = {
  targetName: string
  targetUnit: string
  targetFixed?: number
  baseValue: number
  activeSupportSets: ArtifactSetKey[]
  rows: SupportArtifactComparisonRow[]
}

export function computeSupportArtifactBuffComparison({
  database,
  teamId,
  teamCharId,
  characterKey,
  gender,
  optimizationTarget,
  teammateKeys,
  effectiveReplaceKey = '',
  mainStatAssumptionLevel = 0,
  overrideArt,
  overrideWeapon,
}: {
  database: ArtCharDatabase
  teamId: string
  teamCharId: string
  characterKey: CharacterKey
  gender: GenderKey
  optimizationTarget: string[]
  teammateKeys: CharacterKey[]
  effectiveReplaceKey?: CharacterKey | ''
  mainStatAssumptionLevel?: number
  overrideArt?: ICachedArtifact[] | Data
  overrideWeapon?: ICachedWeapon
}): SupportArtifactComparisonResult | undefined {
  if (!optimizationTarget?.length) return undefined

  const rawTeamBundle = getTeamData(
    database,
    teamId,
    teamCharId,
    mainStatAssumptionLevel,
    overrideArt,
    overrideWeapon
  )
  if (!rawTeamBundle) return undefined
  const baseTeamData = rawTeamBundle.teamData
  const onFieldCharKey =
    database.teams.getActiveTeamChar(teamId)?.key ?? characterKey

  // Pre-merge each member's Data[] once so simulated passes don't re-merge 8+ sheets per member
  const preMergedTeamData: Partial<Record<CharacterKey, Data[]>> = {}
  for (const [ck, dataArr] of Object.entries(baseTeamData)) {
    if (dataArr) preMergedTeamData[ck as CharacterKey] = [mergeData(dataArr)]
  }

  const baseCalcData = uiDataForTeam(preMergedTeamData, gender, onFieldCharKey)
  const activeTargetUIData = baseCalcData[characterKey]?.target
  if (!activeTargetUIData) return undefined

  const baseTargetNode = getTargetCalcResult(
    activeTargetUIData,
    optimizationTarget
  )
  if (!baseTargetNode || typeof baseTargetNode.value !== 'number')
    return undefined

  const baseValue = baseTargetNode.value
  const targetInfo = resolveInfo(baseTargetNode.info)
  const targetName = targetInfo.name ?? optimizationTarget.join(' / ')
  const targetUnit = targetInfo.unit ?? ''
  const targetFixed = targetInfo.fixed

  // Detect which support sets are currently active (>= 4pc) on each team member
  const activeSetsByChar = new Map<CharacterKey, Set<ArtifactSetKey>>()
  const allActiveSupportSets = new Set<ArtifactSetKey>()
  for (const [ck, tdc] of Object.entries(baseCalcData)) {
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
  const defaultCarrierKey = teammateKeys[0] ?? characterKey
  const hexereiTeammateKey = teammateKeys.find(
    (tk) => baseCalcData[tk]?.target.get(input.flags.isHexerei).value === 1
  )

  // Sets already equipped by OTHER members (not the replaced teammate)
  const otherMembersSets = new Set<ArtifactSetKey>()
  for (const [ck, sets] of activeSetsByChar.entries()) {
    if (effectiveReplaceKey && ck === effectiveReplaceKey) continue
    for (const s of sets) otherMembersSets.add(s)
  }

  const rows = SUPPORT_ARTIFACT_SPECS.filter((spec) => {
    if (effectiveReplaceKey) {
      if (otherMembersSets.has(spec.setKey)) return false
      if (activeSetsByChar.get(effectiveReplaceKey)?.has(spec.setKey))
        return false
      return true
    }
    return !allActiveSupportSets.has(spec.setKey)
  })
    .map((spec) => {
      const carrierKey =
        effectiveReplaceKey ||
        (spec.setKey === 'CelestialGift' && hexereiTeammateKey
          ? hexereiTeammateKey
          : defaultCarrierKey)
      const condRaw = spec.getCond(charEle)
      const condNodes = Object.fromEntries(
        Object.entries(condRaw).map(([k, v]) => [k, constant(v)])
      )

      const simTeamData: Partial<Record<CharacterKey, Data[]>> = {
        ...preMergedTeamData,
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

      const simUI = uiDataForTeam(simTeamData, gender, onFieldCharKey)[
        characterKey
      ]?.target
      if (!simUI) return undefined

      const simNode = getTargetCalcResult(simUI, optimizationTarget)
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
}

export const SupportArtifactBuffComparison = memo(
  function SupportArtifactBuffComparison({
    teamId,
    teamCharId,
    characterKey,
    teamData,
    mainStatAssumptionLevel = 0,
    overrideArt,
    overrideWeapon,
    bgt = 'light',
  }: {
    teamId: string
    teamCharId: string
    characterKey: CharacterKey
    teamData?: TeamData
    mainStatAssumptionLevel?: number
    overrideArt?: ICachedArtifact[] | Data
    overrideWeapon?: ICachedWeapon
    bgt?: 'light' | 'normal' | 'dark'
  }) {
    const { t } = useTranslation('page_team')
    const database = useDatabase()
    const { gender } = useDBMeta()
    const team = useTeam(teamId)
    const teamChar = useTeamChar(teamCharId)
    const optConfig = useOptConfig(teamChar?.optConfigId ?? '')
    const optimizationTarget = optConfig?.optimizationTarget

    // '' = add extra buff to team; otherwise CharacterKey of teammate whose 4pc set is replaced
    const [replaceCharKey, setReplaceCharKey] = useState<CharacterKey | ''>('')

    const teammateKeys = useMemo(() => {
      if (!team) return [] as CharacterKey[]
      return team.loadoutData
        .filter(notEmpty)
        .map((ld) => database.teamChars.get(ld.teamCharId)?.key)
        .filter((k): k is CharacterKey => Boolean(k && k !== characterKey))
    }, [team, database, characterKey])

    const effectiveReplaceKey =
      replaceCharKey && teammateKeys.includes(replaceCharKey)
        ? replaceCharKey
        : ''

    // Include teamData & teamChar in deps so edits to team members, conditionals, or custom multi-targets re-evaluate immediately
    const comparison = useMemo(() => {
      void teamData
      void teamChar
      if (!optimizationTarget?.length) return undefined
      return computeSupportArtifactBuffComparison({
        database,
        teamId,
        teamCharId,
        characterKey,
        gender,
        optimizationTarget,
        teammateKeys,
        effectiveReplaceKey,
        mainStatAssumptionLevel,
        overrideArt,
        overrideWeapon,
      })
    }, [
      optimizationTarget,
      teamData,
      teamChar,
      characterKey,
      database,
      teamId,
      teamCharId,
      teammateKeys,
      effectiveReplaceKey,
      gender,
      mainStatAssumptionLevel,
      overrideArt,
      overrideWeapon,
    ])

    if (!optimizationTarget?.length) {
      return (
        <CardThemed bgt={bgt}>
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
      <CardThemed bgt={bgt}>
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
                  sx={{
                    fontWeight: 'bold',
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
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
                const absDiffStr = `${diff > 0.005 ? '+' : ''}${valueString(
                  diff,
                  targetUnit,
                  targetFixed
                )}`
                const simTotalStr = valueString(
                  simValue,
                  targetUnit,
                  targetFixed
                )

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
                            sx={{ display: 'block', fontWeight: 'bold' }}
                          >
                            {desc}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: 'block' }}
                          >
                            {valueString(baseValue, targetUnit, targetFixed)} →{' '}
                            {simTotalStr} ({absDiffStr})
                          </Typography>
                        </Box>
                      }
                    />
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.75,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 'bold',
                            color: pctColor,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {absDiffStr}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 'bold',
                            color: pctColor,
                            minWidth: '3.6em',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {`${sign}${diffPct.toFixed(1)}%`}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: '0.68rem',
                          lineHeight: 1.15,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {t('teamSettings.supportArtBuffs.total', 'Total:')}{' '}
                        {simTotalStr}
                      </Typography>
                    </Box>
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
