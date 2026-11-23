import { useDataManagerValues } from '@genshin-optimizer/common/database-ui'
import { useBoolState } from '@genshin-optimizer/common/react-util'
import {
  CardThemed,
  CustomNumberInput,
  ModalWrapper,
  SqBadge,
} from '@genshin-optimizer/common/ui'
import { clamp, toggleArr } from '@genshin-optimizer/common/util'
import { weaponAsset } from '@genshin-optimizer/gi/assets'
import type { CharacterKey, WeaponKey } from '@genshin-optimizer/gi/consts'
import {
  allWeaponKeys,
  charKeyToLocCharKey,
  getLevelString,
} from '@genshin-optimizer/gi/consts'
import type { ICachedWeapon } from '@genshin-optimizer/gi/db'
import {
  TeamCharacterContext,
  useDatabase,
  useOptConfig,
} from '@genshin-optimizer/gi/db-ui'
import { getWeaponSheet } from '@genshin-optimizer/gi/sheets'
import {
  getCharStat,
  getWeaponStat,
  weaponHasRefinement,
} from '@genshin-optimizer/gi/stats'
import {
  CharIconSide,
  DataContext,
  DocumentDisplay,
  useTeamData,
  WeaponName,
} from '@genshin-optimizer/gi/ui'
import { CheckBox, CheckBoxOutlineBlank, Replay } from '@mui/icons-material'
import BlockIcon from '@mui/icons-material/Block'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import {
  Box,
  Button,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  IconButton,
  Skeleton,
  Slider,
  Stack,
  Typography,
} from '@mui/material'
import {
  memo,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { deduplicateAndSortWeapons } from '../weaponFilterUtil'

const WEAPON_MIN = 1
const WEAPON_MAX = 90

export const WeaponFilter = memo(function WeaponFilter({
  filteredWeapons,
  teammateWeaponIds,
  currentWeaponId,
  disabled = false,
}: {
  filteredWeapons: ICachedWeapon[]
  teammateWeaponIds: string[]
  currentWeaponId?: string
  disabled?: boolean
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const {
    teamChar: { key: characterKey, conditional, optConfigId },
  } = useContext(TeamCharacterContext)
  const optConfig = useOptConfig(optConfigId)!
  const { optWeapon } = optConfig
  const [show, onOpen, onClose] = useBoolState(false)

  const charWeaponType = getCharStat(characterKey).weaponType
  const weaponKeysOfType = useMemo(
    () =>
      new Set<string>(
        allWeaponKeys.filter(
          (key) => getWeaponStat(key).weaponType === charWeaponType
        )
      ),
    [charWeaponType]
  )

  const weaponCondCount = useMemo(
    () =>
      Object.keys(conditional).filter(
        (k) =>
          weaponKeysOfType.has(k) && !!Object.keys(conditional[k] ?? {}).length
      ).length,
    [conditional, weaponKeysOfType]
  )

  return (
    <>
      <CardThemed bgt="light" sx={{ display: 'flex', width: '100%' }}>
        <CardContent sx={{ flexGrow: 1 }}>
          <Stack spacing={1}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Typography sx={{ fontWeight: 'bold' }}>
                {t('weaponFilter.title', 'Weapon Optimization')}
              </Typography>
              {optWeapon && (
                <SqBadge color={filteredWeapons.length ? 'info' : 'error'}>
                  {filteredWeapons.length}
                </SqBadge>
              )}
            </Box>
            <Button
              fullWidth
              disabled={disabled}
              startIcon={optWeapon ? <CheckBox /> : <CheckBoxOutlineBlank />}
              color={optWeapon ? 'success' : 'secondary'}
              onClick={() =>
                database.optConfigs.set(optConfigId, {
                  optWeapon: !optWeapon,
                })
              }
            >
              {t('weaponFilter.optimizeWeapon', 'Optimize Weapon')}
            </Button>
            {optWeapon && (
              <Typography variant="body2">
                {t('weaponFilter.condLabel', 'Weapon Conditionals')}{' '}
                <SqBadge color={weaponCondCount ? 'success' : 'warning'}>
                  {weaponCondCount} {t('artSetConfig.enabled', 'Enabled')}
                </SqBadge>
              </Typography>
            )}
          </Stack>
        </CardContent>
        <Button
          onClick={onOpen}
          disabled={disabled || !optWeapon}
          color="info"
          sx={{ borderRadius: 0, flexShrink: 1, minWidth: 40 }}
        >
          <SettingsIcon />
        </Button>
      </CardThemed>

      <ModalWrapper open={show} onClose={onClose}>
        <>
          {show && (
            <WeaponFilterModalContent
              onClose={onClose}
              disabled={disabled}
              filteredWeapons={filteredWeapons}
              teammateWeaponIds={teammateWeaponIds}
              currentWeaponId={currentWeaponId}
              weaponKeysOfType={weaponKeysOfType}
              weaponCondCount={weaponCondCount}
            />
          )}
        </>
      </ModalWrapper>
    </>
  )
})

function WeaponFilterModalContent({
  onClose,
  disabled,
  filteredWeapons,
  teammateWeaponIds,
  currentWeaponId,
  weaponKeysOfType,
  weaponCondCount,
}: {
  onClose: () => void
  disabled: boolean
  filteredWeapons: ICachedWeapon[]
  teammateWeaponIds: string[]
  currentWeaponId?: string
  weaponKeysOfType: Set<string>
  weaponCondCount: number
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const {
    teamCharId,
    teamChar: { key: characterKey, conditional, optConfigId },
  } = useContext(TeamCharacterContext)
  const optConfig = useOptConfig(optConfigId)!
  const {
    weaponLevelLow,
    weaponLevelHigh,
    useEquippedWeapon,
    useTeammateWeapon,
    weaponExclusion,
  } = optConfig

  const allWeapons = useDataManagerValues(database.weapons)
  const charWeaponType = getCharStat(characterKey).weaponType
  const locKey = charKeyToLocCharKey(characterKey)

  // All weapons matching type/level/equipped/teammate filters (ignoring manual exclusion so user can toggle them)
  const candidatePoolWeapons = useMemo(() => {
    return allWeapons
      .filter((weapon) => {
        if (getWeaponStat(weapon.key).weaponType !== charWeaponType)
          return false
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
      .sort((a, b) => {
        if (a.id === currentWeaponId) return -1
        if (b.id === currentWeaponId) return 1
        const rarityDiff =
          getWeaponStat(b.key).rarity - getWeaponStat(a.key).rarity
        if (rarityDiff !== 0) return rarityDiff
        if (b.level !== a.level) return b.level - a.level
        return b.refinement - a.refinement
      })
  }, [
    allWeapons,
    charWeaponType,
    weaponLevelLow,
    weaponLevelHigh,
    useTeammateWeapon,
    useEquippedWeapon,
    currentWeaponId,
    teammateWeaponIds,
    locKey,
  ])

  // Representative weapons (1 per unique weaponKey) that have conditional documents
  const weaponsWithConditionals = useMemo(() => {
    const sorted = deduplicateAndSortWeapons(
      filteredWeapons,
      characterKey,
      currentWeaponId
    )
    const byKey = new Map<WeaponKey, { weapon: ICachedWeapon; count: number }>()
    for (const weapon of filteredWeapons) {
      const existing = byKey.get(weapon.key)
      if (existing) {
        existing.count++
      } else {
        const rep = sorted.find((w) => w.key === weapon.key) ?? weapon
        byKey.set(weapon.key, { weapon: rep, count: 1 })
      }
    }
    return Array.from(byKey.values()).filter(
      ({ weapon }) => (getWeaponSheet(weapon.key)?.document.length ?? 0) > 0
    )
  }, [filteredWeapons, characterKey, currentWeaponId])

  const resetWeaponConds = useCallback(() => {
    const nextConditional = Object.fromEntries(
      Object.entries(conditional).filter(([k]) => !weaponKeysOfType.has(k))
    )
    database.teamChars.set(teamCharId, (teamChar) => {
      teamChar.conditional = nextConditional
    })
  }, [conditional, weaponKeysOfType, database, teamCharId])

  const toggleWeaponExclusion = useCallback(
    (weaponId: string) => {
      database.optConfigs.set(optConfigId, {
        weaponExclusion: toggleArr(weaponExclusion, weaponId),
      })
    },
    [database, optConfigId, weaponExclusion]
  )

  const includeAllWeapons = useCallback(() => {
    const poolIds = new Set(candidatePoolWeapons.map((w) => w.id))
    database.optConfigs.set(optConfigId, {
      weaponExclusion: weaponExclusion.filter((id) => !poolIds.has(id)),
    })
  }, [candidatePoolWeapons, database, optConfigId, weaponExclusion])

  const excludeAllWeapons = useCallback(() => {
    const merged = Array.from(
      new Set([...weaponExclusion, ...candidatePoolWeapons.map((w) => w.id)])
    )
    database.optConfigs.set(optConfigId, {
      weaponExclusion: merged,
    })
  }, [candidatePoolWeapons, database, optConfigId, weaponExclusion])

  return (
    <CardThemed>
      <CardHeader
        title={t('weaponFilter.modalTitle', 'Weapon Filter & Conditionals')}
        action={
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        }
      />
      <Divider />
      <CardContent>
        <Suspense fallback={<Skeleton width="100%" height={400} />}>
          <Stack spacing={2}>
            {/* Weapon Level Slider */}
            <WeaponLevelSlider
              levelLow={weaponLevelLow}
              levelHigh={weaponLevelHigh}
              disabled={disabled}
              optConfigId={optConfigId}
            />

            {/* Equipment Toggles */}
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Button
                  fullWidth
                  disabled={disabled}
                  startIcon={
                    useEquippedWeapon ? <CheckBox /> : <CheckBoxOutlineBlank />
                  }
                  color={useEquippedWeapon ? 'success' : 'secondary'}
                  onClick={() =>
                    database.optConfigs.set(optConfigId, {
                      useEquippedWeapon: !useEquippedWeapon,
                    })
                  }
                >
                  {t('weaponFilter.useEquipped', 'Use Equipped Weapons')}
                </Button>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Button
                  fullWidth
                  disabled={disabled}
                  startIcon={
                    useTeammateWeapon ? <CheckBox /> : <CheckBoxOutlineBlank />
                  }
                  color={useTeammateWeapon ? 'success' : 'secondary'}
                  onClick={() =>
                    database.optConfigs.set(optConfigId, {
                      useTeammateWeapon: !useTeammateWeapon,
                    })
                  }
                >
                  {t('weaponFilter.useTeammate', "Use Teammates' Weapons")}
                </Button>
              </Grid>
            </Grid>

            {/* Eligible Weapons Selection */}
            <CardThemed bgt="light">
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                    mb: 1,
                  }}
                >
                  <Typography sx={{ fontWeight: 'bold' }}>
                    {t('weaponFilter.eligibleWeapons', 'Eligible Weapons')}
                  </Typography>
                  <SqBadge color={filteredWeapons.length ? 'info' : 'error'}>
                    {filteredWeapons.length} / {candidatePoolWeapons.length}
                  </SqBadge>
                  <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      color="success"
                      disabled={disabled || !candidatePoolWeapons.length}
                      onClick={includeAllWeapons}
                    >
                      {t('weaponFilter.includeAll', 'Include All')}
                    </Button>
                    <Button
                      size="small"
                      color="secondary"
                      disabled={disabled || !candidatePoolWeapons.length}
                      onClick={excludeAllWeapons}
                    >
                      {t('weaponFilter.excludeAll', 'Exclude All')}
                    </Button>
                  </Box>
                </Box>
                {candidatePoolWeapons.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t(
                      'weaponFilter.noWeapons',
                      'No weapons match the current filters.'
                    )}
                  </Typography>
                ) : (
                  <Grid container spacing={1} columns={{ xs: 1, sm: 2, md: 3 }}>
                    {candidatePoolWeapons.map((weapon) => {
                      const excluded = weaponExclusion.includes(weapon.id)
                      const rarity = getWeaponStat(weapon.key).rarity
                      return (
                        <Grid key={weapon.id} size={1}>
                          <Button
                            fullWidth
                            disabled={disabled}
                            onClick={() => toggleWeaponExclusion(weapon.id)}
                            color={excluded ? 'secondary' : 'success'}
                            variant="outlined"
                            sx={{
                              p: 0.75,
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              textTransform: 'none',
                              opacity: excluded ? 0.55 : 1,
                              gap: 1,
                            }}
                          >
                            <Box
                              className={`grad-${rarity}star`}
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 1,
                                flexShrink: 0,
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                component="img"
                                src={weaponAsset(
                                  weapon.key,
                                  weapon.ascension >= 2
                                )}
                                sx={{ width: '100%', height: '100%' }}
                              />
                            </Box>
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{ fontWeight: 'bold' }}
                              >
                                <WeaponName weaponKey={weapon.key} />
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Lv.{' '}
                                  {getLevelString(
                                    weapon.level,
                                    weapon.ascension
                                  )}
                                  {weaponHasRefinement(weapon.key)
                                    ? ` R${weapon.refinement}`
                                    : ''}
                                </Typography>
                                {weapon.location && (
                                  <CharIconSide
                                    characterKey={database.chars.LocationToCharacterKey(
                                      weapon.location
                                    )}
                                  />
                                )}
                              </Box>
                            </Box>
                            {excluded ? (
                              <BlockIcon fontSize="small" />
                            ) : (
                              <ShowChartIcon fontSize="small" />
                            )}
                          </Button>
                        </Grid>
                      )
                    })}
                  </Grid>
                )}
              </CardContent>
            </CardThemed>

            {/* Weapon Conditionals Section */}
            <CardThemed bgt="light">
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                    mb: 1,
                  }}
                >
                  <Typography sx={{ fontWeight: 'bold' }}>
                    {t('weaponFilter.condTitle', 'Weapon Passive Conditionals')}
                  </Typography>
                  <SqBadge color={weaponCondCount ? 'success' : 'warning'}>
                    {weaponCondCount} {t('artSetConfig.selected', 'Selected')}
                  </SqBadge>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<Replay />}
                    disabled={disabled || !weaponCondCount}
                    onClick={resetWeaponConds}
                    sx={{ ml: 'auto' }}
                  >
                    {t(
                      'artSetConfig.modal.setCond.reset',
                      'Reset Conditionals'
                    )}
                  </Button>
                </Box>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {t(
                    'weaponFilter.condDesc',
                    'Configure conditional passives for eligible weapons below so their effects are included when calculating the best weapon.'
                  )}
                </Typography>

                {weaponsWithConditionals.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t(
                      'weaponFilter.noWeaponConds',
                      'None of the currently eligible weapons have configurable conditionals.'
                    )}
                  </Typography>
                ) : (
                  <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
                    {weaponsWithConditionals.map(({ weapon, count }) => (
                      <Grid key={weapon.key} size={1}>
                        <WeaponCondCard
                          characterKey={characterKey}
                          weapon={weapon}
                          count={count}
                          disabled={disabled}
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </CardThemed>
          </Stack>
        </Suspense>
      </CardContent>
    </CardThemed>
  )
}

const WeaponLevelSlider = memo(function WeaponLevelSlider({
  levelLow,
  levelHigh,
  disabled,
  optConfigId,
}: {
  levelLow: number
  levelHigh: number
  disabled: boolean
  optConfigId: string
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const [sliderLow, setSliderLow] = useState(levelLow)
  const [sliderHigh, setSliderHigh] = useState(levelHigh)

  useEffect(() => setSliderLow(levelLow), [levelLow])
  useEffect(() => setSliderHigh(levelHigh), [levelHigh])

  const setSlider = useCallback((_e: unknown, value: number | number[]) => {
    if (typeof value === 'number') return
    const [l, h] = value
    setSliderLow(l)
    setSliderHigh(h)
  }, [])

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', gap: 1, py: 1 }}>
        <Typography sx={{ fontWeight: 'bold' }}>
          {t('weaponFilter.levelFilter', 'Weapon Level Filter')}
        </Typography>
      </CardContent>
      <Divider />
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'contentLight.main',
        }}
      >
        <CustomNumberInput
          value={sliderLow}
          onChange={(val) =>
            database.optConfigs.set(optConfigId, {
              weaponLevelLow: clamp(val ?? WEAPON_MIN, WEAPON_MIN, levelHigh),
            })
          }
          sx={{ px: 1, width: '3.5em' }}
          inputProps={{ sx: { textAlign: 'center' } }}
          disabled={disabled}
        />
        <Slider
          sx={{ flex: '0 1 100%', mx: 2 }}
          getAriaLabel={() => 'Weapon Level Range'}
          value={[sliderLow, sliderHigh]}
          onChange={setSlider}
          onChangeCommitted={(_e, value) =>
            Array.isArray(value) &&
            database.optConfigs.set(optConfigId, {
              weaponLevelLow: value[0],
              weaponLevelHigh: value[1],
            })
          }
          valueLabelDisplay="auto"
          min={WEAPON_MIN}
          max={WEAPON_MAX}
          step={1}
          disabled={disabled}
        />
        <CustomNumberInput
          value={sliderHigh}
          onChange={(val) =>
            database.optConfigs.set(optConfigId, {
              weaponLevelHigh: clamp(val ?? WEAPON_MAX, levelLow, WEAPON_MAX),
            })
          }
          sx={{ px: 1, width: '3.5em' }}
          inputProps={{ sx: { textAlign: 'center' } }}
          disabled={disabled}
        />
      </Box>
    </CardThemed>
  )
})

const WeaponCondCard = memo(function WeaponCondCard({
  characterKey,
  weapon,
  count,
  disabled,
}: {
  characterKey: CharacterKey
  weapon: ICachedWeapon
  count: number
  disabled: boolean
}) {
  const weaponSheet = getWeaponSheet(weapon.key)
  const teamData = useTeamData(0, undefined, weapon)
  const providerValue = useMemo(() => {
    const tdc = teamData?.[characterKey]
    if (!tdc) return undefined
    return { data: tdc.target, teamData }
  }, [teamData, characterKey])

  if (!weaponSheet?.document.length || !providerValue) return null

  const rarity = getWeaponStat(weapon.key).rarity

  return (
    <CardThemed sx={{ height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
        }}
      >
        <Box
          className={`grad-${rarity}star`}
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1,
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
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 'bold' }}>
            <WeaponName weaponKey={weapon.key} />
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Lv. {getLevelString(weapon.level, weapon.ascension)}
            {weaponHasRefinement(weapon.key) ? ` R${weapon.refinement}` : ''}
          </Typography>
        </Box>
        {count > 1 && <SqBadge color="info">×{count}</SqBadge>}
      </Box>
      <Divider />
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
        <DataContext.Provider value={providerValue}>
          <DocumentDisplay
            sections={weaponSheet.document}
            disabled={disabled}
            bgt="light"
          />
        </DataContext.Provider>
      </CardContent>
    </CardThemed>
  )
})
