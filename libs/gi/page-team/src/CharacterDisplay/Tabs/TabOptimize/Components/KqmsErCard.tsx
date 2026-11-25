import { useBoolState } from '@genshin-optimizer/common/react-util'
import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import {
  CardThemed,
  CustomNumberInput,
  InfoTooltip,
  ModalWrapper,
  SqBadge,
} from '@genshin-optimizer/common/ui'
import { clamp } from '@genshin-optimizer/common/util'
import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
  useOptConfig,
} from '@genshin-optimizer/gi/db-ui'
import { StatIcon } from '@genshin-optimizer/gi/svgicons'
import { CharacterName, CharIconSide } from '@genshin-optimizer/gi/ui'
import { CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Button,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { memo, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { EnemyParticleScenario, TeamKqmsErResult } from '../kqmsErCalc'

export const KqmsErCard = memo(function KqmsErCard({
  teamKqms,
  currentCharErFloor,
  disabled = false,
}: {
  teamKqms: TeamKqmsErResult
  currentCharErFloor: number
  disabled?: boolean
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const {
    teamChar: { optConfigId },
  } = useContext(TeamCharacterContext)
  const optConfig = useOptConfig(optConfigId)!
  const { kqmsErEnabled, kqmsRotationDuration, kqmsEnemyScenario } = optConfig
  const [showModal, onOpenModal, onCloseModal] = useBoolState(false)

  return (
    <>
      <CardThemed bgt="light" sx={{ display: 'flex', width: '100%' }}>
        <CardContent sx={{ flexGrow: 1 }}>
          <Stack spacing={1}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 'bold' }}>
                  {t('kqmsEr.title', 'Recarga Mínima KQMS')}
                </Typography>
                <SqBadge
                  color={
                    currentCharErFloor > 200
                      ? 'warning'
                      : kqmsErEnabled
                        ? 'success'
                        : 'info'
                  }
                >
                  <StatIcon statKey="enerRech_" iconProps={iconInlineProps} />{' '}
                  {currentCharErFloor}%
                </SqBadge>
              </Box>
              <InfoTooltip
                title={
                  <Typography variant="body2">
                    {t(
                      'kqmsEr.tooltip',
                      'Calcula automaticamente a Recarga de Energia mínima (ER Floor) necessária para usar o Supremo a cada rotação seguindo as constantes de Theorycraft (KQMS), aplicando esse piso como restrição obrigatória na otimização.'
                    )}
                  </Typography>
                }
              />
            </Box>

            <Button
              fullWidth
              disabled={disabled}
              startIcon={
                kqmsErEnabled ? <CheckBox /> : <CheckBoxOutlineBlank />
              }
              color={kqmsErEnabled ? 'success' : 'secondary'}
              onClick={() =>
                database.optConfigs.set(optConfigId, {
                  kqmsErEnabled: !kqmsErEnabled,
                })
              }
            >
              {t('kqmsEr.enableBtn', 'Ativar Recarga Mínima KQMS')} (
              {currentCharErFloor}%)
            </Button>
          </Stack>
        </CardContent>
        <Button
          onClick={onOpenModal}
          disabled={disabled}
          color="info"
          sx={{ borderRadius: 0, flexShrink: 1, minWidth: 40 }}
        >
          <SettingsIcon />
        </Button>
      </CardThemed>

      <ModalWrapper open={showModal} onClose={onCloseModal}>
        <CardThemed>
          <CardHeader
            title={t(
              'kqmsEr.modalTitle',
              'Configuração & Análise de Recarga Mínima KQMS'
            )}
            action={
              <IconButton onClick={onCloseModal}>
                <CloseIcon />
              </IconButton>
            }
          />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.rotationDuration', 'Duração da Rotação (s):')}
                  </Typography>
                  <CustomNumberInput
                    value={kqmsRotationDuration}
                    onChange={(val) =>
                      database.optConfigs.set(optConfigId, {
                        kqmsRotationDuration: clamp(val ?? 20, 12, 35),
                      })
                    }
                    sx={{
                      px: 1,
                      py: 0.5,
                      width: '4em',
                      borderRadius: 1,
                      bgcolor: 'contentLight.main',
                    }}
                    inputProps={{ sx: { textAlign: 'center' } }}
                    disabled={disabled}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.enemyScenario', 'Partículas de Inimigos:')}
                  </Typography>
                  <FormControl size="small">
                    <Select
                      value={kqmsEnemyScenario}
                      disabled={disabled}
                      onChange={(e) =>
                        database.optConfigs.set(optConfigId, {
                          kqmsEnemyScenario: e.target
                            .value as EnemyParticleScenario,
                        })
                      }
                    >
                      <MenuItem value="boss">
                        {t(
                          'kqmsEr.scenarioBoss',
                          'Chefe / Alvo Único (Conservador: 1 Orbe Branco)'
                        )}
                      </MenuItem>
                      <MenuItem value="aoe">
                        {t(
                          'kqmsEr.scenarioAoe',
                          'Multi-Target / AoE (2 Orbes + 3 Partículas)'
                        )}
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <KqmsErResultsSummary
                teamKqms={teamKqms}
                highlightCharKey={useContext(TeamCharacterContext).teamChar.key}
              />
            </Stack>
          </CardContent>
        </CardThemed>
      </ModalWrapper>
    </>
  )
})

export const KqmsErResultsSummary = memo(function KqmsErResultsSummary({
  teamKqms,
  highlightCharKey,
}: {
  teamKqms: TeamKqmsErResult
  highlightCharKey: CharacterKey
}) {
  const { t } = useTranslation('page_character_optimize')
  const { gender } = useDBMeta()

  if (!teamKqms.members.length) return null

  return (
    <CardThemed bgt="light">
      <CardContent>
        <Stack spacing={1.5}>
          {/* 1. Rotation & Generation Summary */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {t(
                'kqmsEr.resultsTitle',
                'Análise de Recarga Mínima KQMS da Equipe'
              )}
            </Typography>
            <SqBadge color="info">
              {t('kqmsEr.rotBadge', {
                seconds: teamKqms.rotationDuration,
                defaultValue: `Rotação: ${teamKqms.rotationDuration}s`,
              })}
            </SqBadge>
            <SqBadge color="primary">
              {t('kqmsEr.skillsBadge', {
                count: teamKqms.totalSkillUses,
                defaultValue: `${teamKqms.totalSkillUses} Skills`,
              })}
            </SqBadge>
            <SqBadge
              color={teamKqms.totalFavoniusProcs > 0 ? 'success' : 'secondary'}
            >
              {t('kqmsEr.favBadge', {
                count: teamKqms.totalFavoniusProcs,
                defaultValue: `${teamKqms.totalFavoniusProcs} Procs Favonius`,
              })}
            </SqBadge>
            <SqBadge color="secondary">
              {teamKqms.enemyScenario === 'boss'
                ? t('kqmsEr.bossShort', 'Alvo Único (1 Orbe Branco)')
                : t('kqmsEr.aoeShort', 'AoE (Multi-Target)')}
            </SqBadge>
          </Box>

          {/* 2. Minimum ER Requirements Table */}
          <TableContainer
            sx={{
              borderRadius: 1,
              bgcolor: 'contentDark.main',
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.colChar', 'Personagem')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.colBurstCost', 'Custo do Supremo')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.colFlatEnergy', 'Energia Fixa')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.colBaseEnergy', 'Energia Base / Rotação')}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {t('kqmsEr.colMinEr', 'ER Mínima (+10% margem)')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teamKqms.members.map((m) => {
                  const isHighlighted = m.characterKey === highlightCharKey
                  const isHighEr = m.recommendedErPercent > 200
                  return (
                    <TableRow
                      key={m.characterKey}
                      sx={{
                        bgcolor: isHighlighted
                          ? 'rgba(102, 187, 106, 0.12)'
                          : undefined,
                      }}
                    >
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <CharIconSide characterKey={m.characterKey} />
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: isHighlighted ? 'bold' : 'normal',
                            }}
                          >
                            <CharacterName
                              characterKey={m.characterKey}
                              gender={gender}
                            />
                          </Typography>
                          {m.isOnFieldPrimary && (
                            <SqBadge color="info">On-Field</SqBadge>
                          )}
                          {isHighlighted && (
                            <SqBadge color="success">
                              {t('kqmsEr.activeTargetBadge', 'Alvo')}
                            </SqBadge>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {m.burstCost > 0 ? m.burstCost : '0 (Especial)'}
                      </TableCell>
                      <TableCell align="right">{m.flatEnergy}</TableCell>
                      <TableCell align="right">
                        {m.baseEnergyReceived.toFixed(1)}{' '}
                        <Typography variant="caption" color="text.secondary">
                          ({m.particlesGenerated}p / {m.skillUses}E
                          {m.favoniusProcs > 0
                            ? ` + ${m.favoniusProcs} Fav`
                            : ''}
                          )
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <SqBadge color={isHighEr ? 'warning' : 'success'}>
                          <StatIcon
                            statKey="enerRech_"
                            iconProps={iconInlineProps}
                          />{' '}
                          {m.recommendedErPercent}%
                        </SqBadge>
                        {m.burstCost > 0 && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 0.75 }}
                          >
                            ({m.exactErPercent}% exato)
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* 3. Proactive Optimization Recommendations */}
          {teamKqms.recommendations.length > 0 && (
            <Alert
              severity="warning"
              icon={<WarningAmberIcon />}
              sx={{ py: 0.5 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                {t(
                  'kqmsEr.recTitle',
                  'Recomendações de Otimização (ER > 200% detectado):'
                )}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {teamKqms.recommendations.map((rec) => {
                  if (rec === 'favonius') {
                    return (
                      <li key={rec}>
                        <Typography variant="body2">
                          {t(
                            'kqmsEr.recFavonius',
                            'Considere equipar uma Arma de Favonius em um suporte da equipe (+6.0 / +3.6 de Energia Base neutra por proc) para reduzir drasticamente o piso de ER.'
                          )}
                        </Typography>
                      </li>
                    )
                  }
                  if (rec.startsWith('battery:')) {
                    const ele = rec.split(':')[1]
                    return (
                      <li key={rec}>
                        <Typography variant="body2">
                          {t('kqmsEr.recBattery', {
                            ele: ele.toUpperCase(),
                            defaultValue: `Nenhum aliado do mesmo elemento (${ele.toUpperCase()}) na equipe: incluir uma bateria do mesmo elemento triplica a energia por partícula (3.0/1.8 vs 1.0/0.6).`,
                          })}
                        </Typography>
                      </li>
                    )
                  }
                  if (rec.startsWith('funnel:')) {
                    const ck = rec.split(':')[1] as CharacterKey
                    return (
                      <li key={rec}>
                        <Typography variant="body2">
                          {t(
                            'kqmsEr.recFunnel',
                            'Ajuste a rotação para funilar partículas (usar a Habilidade Elemental do aliado e trocar imediatamente) para '
                          )}
                          <strong>
                            <CharacterName characterKey={ck} gender={gender} />
                          </strong>
                          .
                        </Typography>
                      </li>
                    )
                  }
                  return null
                })}
              </Box>
            </Alert>
          )}
        </Stack>
      </CardContent>
    </CardThemed>
  )
})
