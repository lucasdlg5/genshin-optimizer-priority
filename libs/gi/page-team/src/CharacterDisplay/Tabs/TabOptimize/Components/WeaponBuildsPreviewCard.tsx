import { useDataManagerValues } from '@genshin-optimizer/common/database-ui'
import { CardThemed, SqBadge } from '@genshin-optimizer/common/ui'
import {
  notEmpty,
  objPathValue,
  valueString,
} from '@genshin-optimizer/common/util'
import { artifactDefIcon, weaponAsset } from '@genshin-optimizer/gi/assets'
import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import { getLevelString } from '@genshin-optimizer/gi/consts'
import type { GeneratedBuild } from '@genshin-optimizer/gi/db'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
} from '@genshin-optimizer/gi/db-ui'
import { getWeaponStat, weaponHasRefinement } from '@genshin-optimizer/gi/stats'
import {
  CharIconSide,
  DataContext,
  getTeamDataCalc,
  resolveInfo,
  WeaponName,
} from '@genshin-optimizer/gi/ui'
import type { CalcResult, UIData } from '@genshin-optimizer/gi/uidata'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import {
  Box,
  ButtonBase,
  CardContent,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { memo, type ReactNode, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type ValueUnit = Parameters<typeof valueString>[1]
type BaselineMode = 'current' | 'equippedWeaponBuild' | 'topWeapon'

export const WeaponBuildsPreviewCard = memo(function WeaponBuildsPreviewCard({
  weaponBuilds,
  optimizationTarget,
  compareData,
  mainStatAssumptionLevel,
  currentWeaponId,
  onSelectWeaponIndex,
}: {
  weaponBuilds: GeneratedBuild[]
  optimizationTarget?: string[]
  compareData?: UIData
  mainStatAssumptionLevel: number
  currentWeaponId?: string
  onSelectWeaponIndex: (index: number) => void
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const { gender } = useDBMeta()
  const {
    teamId,
    teamCharId,
    teamChar: { key: characterKey },
  } = useContext(TeamCharacterContext)
  const { data } = useContext(DataContext)

  const allWeapons = useDataManagerValues(database.weapons)
  const allArts = useDataManagerValues(database.arts)

  const [baselineMode, setBaselineMode] = useState<BaselineMode>('current')

  const previewData = useMemo(() => {
    // Reference allWeapons and allArts so edits/equips re-trigger memo
    void allWeapons
    void allArts

    if (!weaponBuilds.length || !optimizationTarget?.length) return undefined

    const baselineUIData = compareData ?? data
    const currentBaseCalc = baselineUIData
      ? (objPathValue(baselineUIData.getDisplay(), optimizationTarget) as
          | CalcResult
          | undefined)
      : undefined

    let targetName: ReactNode = optimizationTarget.join(' / ')
    let targetUnit: ValueUnit = ''
    let targetFixed: number | undefined

    if (currentBaseCalc?.info) {
      const info = resolveInfo(currentBaseCalc.info)
      if (info.name) targetName = info.name
      targetUnit = (info.unit as ValueUnit) ?? ''
      targetFixed = info.fixed
    }

    const rawRows = weaponBuilds
      .map((build, index) => {
        const weapon = build.weaponId
          ? database.weapons.get(build.weaponId)
          : undefined
        if (!weapon) return undefined

        const buildArts = Object.values(build.artifactIds)
          .map((id) => (id ? database.arts.get(id) : undefined))
          .filter(notEmpty)

        // Tally 2pc / 4pc artifact sets for compact set badges
        const setCounts = new Map<ArtifactSetKey, number>()
        for (const art of buildArts) {
          setCounts.set(art.setKey, (setCounts.get(art.setKey) ?? 0) + 1)
        }
        const activeSetBadges: { setKey: ArtifactSetKey; count: 2 | 4 }[] = []
        for (const [setKey, cnt] of setCounts.entries()) {
          if (cnt >= 4) activeSetBadges.push({ setKey, count: 4 })
          else if (cnt >= 2) activeSetBadges.push({ setKey, count: 2 })
        }

        const teamCalc = getTeamDataCalc(
          database,
          teamId,
          gender,
          teamCharId,
          mainStatAssumptionLevel,
          buildArts,
          weapon
        )
        const buildUIData = teamCalc?.[characterKey]?.target
        if (!buildUIData) return undefined

        const targetCalc = objPathValue(
          buildUIData.getDisplay(),
          optimizationTarget
        ) as CalcResult | undefined
        if (!targetCalc || typeof targetCalc.value !== 'number')
          return undefined

        if (!currentBaseCalc?.info && targetCalc.info) {
          const info = resolveInfo(targetCalc.info)
          if (info.name) targetName = info.name
          targetUnit = (info.unit as ValueUnit) ?? ''
          targetFixed = info.fixed
        }

        return {
          index,
          weapon,
          activeSetBadges,
          targetValue: targetCalc.value,
          isEquippedWeapon: weapon.id === currentWeaponId,
        }
      })
      .filter(notEmpty)

    if (!rawRows.length) return undefined

    const equippedWeaponRow = rawRows.find((r) => r.isEquippedWeapon)
    const currentBuildVal =
      typeof currentBaseCalc?.value === 'number' ? currentBaseCalc.value : 0

    let effectiveBaseValue = currentBuildVal
    if (baselineMode === 'equippedWeaponBuild' && equippedWeaponRow) {
      effectiveBaseValue = equippedWeaponRow.targetValue
    } else if (baselineMode === 'topWeapon') {
      effectiveBaseValue = rawRows[0].targetValue
    } else if (effectiveBaseValue <= 0) {
      // Automatic fallback if character currently has no gear equipped
      effectiveBaseValue =
        equippedWeaponRow?.targetValue ?? rawRows[0].targetValue
    }

    const rows = rawRows.map((row) => {
      const diff = row.targetValue - effectiveBaseValue
      const diffPct =
        effectiveBaseValue !== 0 ? (diff / effectiveBaseValue) * 100 : 0
      return {
        ...row,
        diff,
        diffPct,
      }
    })

    return {
      targetName,
      targetUnit,
      targetFixed,
      baseValue: effectiveBaseValue,
      hasEquippedWeaponRow: Boolean(equippedWeaponRow),
      rows,
    }
  }, [
    allWeapons,
    allArts,
    weaponBuilds,
    optimizationTarget,
    compareData,
    data,
    database,
    teamId,
    gender,
    teamCharId,
    mainStatAssumptionLevel,
    characterKey,
    currentWeaponId,
    baselineMode,
  ])

  if (!previewData) return null

  const {
    targetName,
    targetUnit,
    targetFixed,
    baseValue,
    hasEquippedWeaponRow,
    rows,
  } = previewData

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack spacing={1}>
          {/* Header: Title + Baseline Selector + Reference Target Value */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t(
                  'weaponFilter.previewTitle',
                  'Prévia Comparativa de Dano por Arma'
                )}
              </Typography>
              <SqBadge color="info">{rows.length}</SqBadge>
            </Box>

            <FormControl size="small" sx={{ minWidth: 230 }}>
              <Select
                value={
                  baselineMode === 'equippedWeaponBuild' &&
                  !hasEquippedWeaponRow
                    ? 'current'
                    : baselineMode
                }
                onChange={(e) =>
                  setBaselineMode(e.target.value as BaselineMode)
                }
                sx={{ fontSize: '0.78rem' }}
              >
                <MenuItem value="current">
                  {t(
                    'weaponFilter.baselineCurrent',
                    'Comparar com: Build Atual / Comparação'
                  )}
                </MenuItem>
                {hasEquippedWeaponRow && (
                  <MenuItem value="equippedWeaponBuild">
                    {t(
                      'weaponFilter.baselineEquippedWeapon',
                      'Comparar com: Melhor Build da Arma Equipada'
                    )}
                  </MenuItem>
                )}
                <MenuItem value="topWeapon">
                  {t(
                    'weaponFilter.baselineTop',
                    'Comparar com: Arma #1 (Topo)'
                  )}
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Reference Target Banner */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: 1,
              bgcolor: 'contentDark.main',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 'bold', minWidth: 0 }}
              noWrap
            >
              {t('weaponFilter.previewTargetLabel', 'Alvo Selecionado:')}{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {targetName}
              </Box>
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 'bold',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('weaponFilter.previewBaseLabel', 'Referência:')}{' '}
              {valueString(baseValue, targetUnit, targetFixed)}
            </Typography>
          </Box>

          <Divider />

          {/* Clickable Weapon Preview Rows (Anchor Links) */}
          <Stack spacing={0.5}>
            {rows.map(
              ({
                index,
                weapon,
                activeSetBadges,
                targetValue,
                diff,
                diffPct,
                isEquippedWeapon,
              }) => {
                const rarity = getWeaponStat(weapon.key).rarity
                const isGain = diffPct > 0.05
                const isLoss = diffPct < -0.05
                const pctColor = isGain
                  ? 'success.main'
                  : isLoss
                    ? 'error.main'
                    : 'text.secondary'
                const pctSign = isGain ? '+' : ''
                const diffStr = `${diff > 0 ? '+' : ''}${valueString(
                  diff,
                  targetUnit,
                  targetFixed
                )}`

                return (
                  <Tooltip
                    key={`${weapon.id}-${index}`}
                    placement="top-end"
                    arrow
                    title={
                      <Typography variant="caption">
                        {t(
                          'weaponFilter.clickToJump',
                          'Clique para ir até a Build desta arma'
                        )}{' '}
                        (Δ {diffStr})
                      </Typography>
                    }
                  >
                    <ButtonBase
                      onClick={() => onSelectWeaponIndex(index)}
                      sx={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1,
                        py: 0.6,
                        borderRadius: 1,
                        bgcolor: 'contentDark.main',
                        border: '1px solid transparent',
                        textAlign: 'left',
                        transition:
                          'background-color 0.15s ease, border-color 0.15s ease',
                        '&:hover': {
                          borderColor: 'info.main',
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      {/* Left: Rank + Weapon Icon + Name/Level/Refine + Set Icons */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          minWidth: 0,
                          flexGrow: 1,
                        }}
                      >
                        <SqBadge
                          color={index === 0 ? 'success' : 'info'}
                          sx={{ minWidth: 32, textAlign: 'center' }}
                        >
                          #{index + 1}
                        </SqBadge>

                        <Box
                          className={`grad-${rarity}star`}
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 0.75,
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            component="img"
                            src={weaponAsset(weapon.key, weapon.ascension >= 2)}
                            sx={{ width: '100%', height: '100%' }}
                          />
                        </Box>

                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                              noWrap
                            >
                              <WeaponName weaponKey={weapon.key} />
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ flexShrink: 0 }}
                            >
                              Lv.{' '}
                              {getLevelString(weapon.level, weapon.ascension)}
                              {weaponHasRefinement(weapon.key)
                                ? ` R${weapon.refinement}`
                                : ''}
                            </Typography>
                            {isEquippedWeapon && (
                              <SqBadge color="success">
                                {t('currentlyEquippedBuild', 'Equipada')}
                              </SqBadge>
                            )}
                            {!isEquippedWeapon && weapon.location && (
                              <CharIconSide
                                characterKey={database.chars.LocationToCharacterKey(
                                  weapon.location
                                )}
                              />
                            )}
                          </Box>
                        </Box>

                        {/* Compact 2pc/4pc Artifact Set Badges */}
                        {activeSetBadges.length > 0 && (
                          <Box
                            sx={{
                              display: { xs: 'none', sm: 'flex' },
                              alignItems: 'center',
                              gap: 0.5,
                              flexShrink: 0,
                            }}
                          >
                            {activeSetBadges.map(({ setKey, count }) => (
                              <Box
                                key={`${setKey}-${count}`}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.25,
                                  px: 0.5,
                                  py: 0.15,
                                  borderRadius: 0.75,
                                  bgcolor: 'contentLight.main',
                                }}
                              >
                                <Box
                                  component="img"
                                  src={artifactDefIcon(setKey)}
                                  sx={{ width: 18, height: 18 }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 'bold',
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  {count}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>

                      {/* Right: Positive/Negative Percentage + Target Number in front + Anchor Icon */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          flexShrink: 0,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 'bold',
                            color: pctColor,
                            minWidth: '4.5em',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {`${pctSign}${diffPct.toFixed(1)}%`}
                        </Typography>

                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 'bold',
                            minWidth: '5.5em',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {valueString(targetValue, targetUnit, targetFixed)}
                        </Typography>

                        <ArrowDownwardIcon
                          fontSize="small"
                          sx={{ color: 'text.secondary', opacity: 0.7 }}
                        />
                      </Box>
                    </ButtonBase>
                  </Tooltip>
                )
              }
            )}
          </Stack>
        </Stack>
      </CardContent>
    </CardThemed>
  )
})
