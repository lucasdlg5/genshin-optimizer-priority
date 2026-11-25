import {
  useDataEntryBase,
  useDataManagerValues,
} from '@genshin-optimizer/common/database-ui'
import { useBoolState } from '@genshin-optimizer/common/react-util'
import {
  CardThemed,
  DropdownButton,
  InfoTooltip,
  SqBadge,
  useTitle,
} from '@genshin-optimizer/common/ui'
import {
  notEmpty,
  objKeyMap,
  objPathValue,
  range,
  valueString,
} from '@genshin-optimizer/common/util'
import type {
  ArtifactSlotKey,
  CharacterKey,
} from '@genshin-optimizer/gi/consts'
import {
  allArtifactSetKeys,
  allArtifactSlotKeys,
  charKeyToLocCharKey,
} from '@genshin-optimizer/gi/consts'
import type {
  BulkQueueItem,
  ICachedWeapon,
  LoadoutDatum,
} from '@genshin-optimizer/gi/db'
import {
  CharacterContext,
  TeamCharacterContext,
  type TeamCharacterContextObj,
  useCharacter,
  useDatabase,
  useDBMeta,
  useOptConfig,
  useTeam,
  useTeamChar,
} from '@genshin-optimizer/gi/db-ui'
import type { OptProblemInput, SolverBuild } from '@genshin-optimizer/gi/solver'
import { GOSolver, mergeBuilds } from '@genshin-optimizer/gi/solver'
import { compactArtifacts } from '@genshin-optimizer/gi/solver-tc'
import {
  ArtifactCardNano,
  CharacterName,
  CharacterSingleSelectionModal,
  CharIconSide,
  DataContext,
  type dataContextObj,
  FormulaDataWrapper,
  getTeamData,
  OptTargetWrapper,
  resolveInfo,
  statFilterToNumNode,
  useGlobalError,
  useNumWorkers,
  useTeamDataNoContext,
  WeaponCardNano,
} from '@genshin-optimizer/gi/ui'
import { UIData, uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { NumNode } from '@genshin-optimizer/gi/wr'
import {
  constant,
  dynamicData,
  mergeData,
  optimize,
} from '@genshin-optimizer/gi/wr'
import { allNonstackBuffs } from '@genshin-optimizer/gi/wr-types'
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  AutoAwesome,
  CheckBox,
  CheckBoxOutlineBlank,
  Close,
  DeleteForever,
  GroupAdd,
  PlayArrow,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CardContent,
  Divider,
  FormControl,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { memo, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArtifactSetConfig from './CharacterDisplay/Tabs/TabOptimize/Components/ArtifactSetConfig'
import { KqmsErCard } from './CharacterDisplay/Tabs/TabOptimize/Components/KqmsErCard'
import { buildMaxArtifactConditionals } from './CharacterDisplay/Tabs/TabOptimize/Components/maxArtifactCondsUtil'
import OptimizationTargetSelector from './CharacterDisplay/Tabs/TabOptimize/Components/OptimizationTargetSelector'
import StatFilterCard from './CharacterDisplay/Tabs/TabOptimize/Components/StatFilterCard'
import { WeaponFilter } from './CharacterDisplay/Tabs/TabOptimize/Components/WeaponFilter'
import { calculateTeamKqmsEr } from './CharacterDisplay/Tabs/TabOptimize/kqmsErCalc'
import { useTeamKqmsEr } from './CharacterDisplay/Tabs/TabOptimize/useTeamKqmsEr'
import {
  deduplicateAndSortWeapons,
  getFilteredWeapons,
  useTeammateWeaponIds,
} from './CharacterDisplay/Tabs/TabOptimize/weaponFilterUtil'

type ValueUnit = Parameters<typeof valueString>[1]

export type BulkBuildResultItem = {
  queueId: string
  rank: number
  characterKey: CharacterKey
  teamName: string
  weaponId?: string
  artifactIds: Record<ArtifactSlotKey, string | undefined>
  targetValue: number
  targetUnit: ValueUnit
  targetFixed?: number
  status: 'success' | 'no_build' | 'skipped'
  reason?: string
}

type BulkProgressState = {
  running: boolean
  currentIndex: number
  totalCount: number
  currentCharKey?: CharacterKey
  tested: number
  skipped: number
  total: number
}

function makeQueueId() {
  return `bq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function PageBulkBuild() {
  useTitle('Bulk Build')
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const { gender } = useDBMeta()
  const throwGlobalError = useGlobalError()

  const displayTeam = useDataEntryBase(database.displayTeam)
  const rawQueue = displayTeam.bulkQueue

  // Clean out stale queue entries whose team or teamChar was deleted
  const queue = useMemo(
    () =>
      rawQueue.filter(
        (item) =>
          Boolean(database.teams.get(item.teamId)) &&
          Boolean(database.teamChars.get(item.teamCharId))
      ),
    [rawQueue, database]
  )

  const setQueue = useCallback(
    (nextQueue: BulkQueueItem[]) => {
      database.displayTeam.set({ bulkQueue: nextQueue })
    },
    [database]
  )

  const [showAddCharModal, onOpenAddChar, onCloseAddChar] = useBoolState(false)
  const [maxWorkers, nativeThreads, setMaxWorkers] = useNumWorkers()

  const [progress, setProgress] = useState<BulkProgressState>({
    running: false,
    currentIndex: 0,
    totalCount: 0,
    tested: 0,
    skipped: 0,
    total: 0,
  })
  const [results, setResults] = useState<BulkBuildResultItem[]>([])
  const cancelRef = useRef<() => void>(() => {})

  // Ensure or create a team + teamChar for a standalone character picked from modal
  const handleAddCharacter = useCallback(
    (charKey: CharacterKey) => {
      onCloseAddChar()
      database.chars.getWithInitWeapon(charKey)

      // Try to find an existing team that already contains this character
      let foundTeamId: string | undefined
      let foundTeamCharId: string | undefined
      for (const [tId, team] of database.teams.entries) {
        const ld = team.loadoutData.find(
          (l) => l && database.teamChars.get(l.teamCharId)?.key === charKey
        )
        if (ld) {
          foundTeamId = tId
          foundTeamCharId = ld.teamCharId
          break
        }
      }

      if (!foundTeamId || !foundTeamCharId) {
        // Reuse existing teamChar or create one, and create a solo team container
        foundTeamCharId =
          database.teamChars.keys.find(
            (k) => database.teamChars.get(k)?.key === charKey
          ) ?? database.teamChars.new(charKey)
        foundTeamId = database.teams.new({
          name: `${charKey} Bulk Team`,
          loadoutData: [
            { teamCharId: foundTeamCharId } as LoadoutDatum,
            undefined,
            undefined,
            undefined,
          ],
        })
      }

      if (
        queue.some(
          (q) => q.teamId === foundTeamId && q.teamCharId === foundTeamCharId
        )
      )
        return

      setQueue([
        ...queue,
        {
          id: makeQueueId(),
          teamId: foundTeamId,
          teamCharId: foundTeamCharId,
          enabled: true,
          optWeapon: false,
          autoEquip: true,
        },
      ])
    },
    [database, onCloseAddChar, queue, setQueue]
  )

  const handleImportAllTeams = useCallback(() => {
    const existingKeys = new Set(queue.map((q) => q.teamCharId))
    const seenChars = new Set(
      queue
        .map((q) => database.teamChars.get(q.teamCharId)?.key)
        .filter(notEmpty)
    )
    const additions: BulkQueueItem[] = []

    for (const [teamId, team] of database.teams.entries) {
      for (const ld of team.loadoutData) {
        if (!ld) continue
        const tc = database.teamChars.get(ld.teamCharId)
        if (!tc) continue
        if (existingKeys.has(ld.teamCharId) || seenChars.has(tc.key)) continue
        existingKeys.add(ld.teamCharId)
        seenChars.add(tc.key)
        additions.push({
          id: makeQueueId(),
          teamId,
          teamCharId: ld.teamCharId,
          enabled: true,
          optWeapon: Boolean(
            database.optConfigs.get(tc.optConfigId)?.optWeapon
          ),
          autoEquip: true,
        })
      }
    }

    if (additions.length) {
      setQueue([...queue, ...additions])
    }
  }, [database, queue, setQueue])

  const handleEnableMaxAllQueue = useCallback(() => {
    for (const item of queue) {
      const tc = database.teamChars.get(item.teamCharId)
      if (!tc) continue
      const fakeData = new UIData(
        {
          charKey: constant(tc.key),
          artSet: objKeyMap(allArtifactSetKeys, () => constant(4)),
          nonStacking: objKeyMap(allNonstackBuffs, () => constant(tc.key)),
        },
        undefined
      )
      const nextConditional = buildMaxArtifactConditionals(
        tc.conditional,
        tc.key,
        fakeData
      )
      database.teamChars.set(item.teamCharId, (teamChar) => {
        teamChar.conditional = nextConditional
      })
      database.optConfigs.set(tc.optConfigId, {
        artSetExclusion: {},
      })
    }
  }, [database, queue])

  const moveItem = useCallback(
    (index: number, delta: -1 | 1) => {
      const targetIndex = index + delta
      if (targetIndex < 0 || targetIndex >= queue.length) return
      const copy = [...queue]
      const [moved] = copy.splice(index, 1)
      copy.splice(targetIndex, 0, moved)
      setQueue(copy)
    },
    [queue, setQueue]
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<BulkQueueItem>) => {
      setQueue(
        queue.map((item) => (item.id === id ? { ...item, ...patch } : item))
      )
    },
    [queue, setQueue]
  )

  const removeItem = useCallback(
    (id: string) => {
      setQueue(queue.filter((item) => item.id !== id))
    },
    [queue, setQueue]
  )

  const allArts = useDataManagerValues(database.arts)
  const allWeapons = useDataManagerValues(database.weapons)

  const runBulkBuild = useCallback(async () => {
    const activeQueue = queue.filter((q) => q.enabled)
    if (!activeQueue.length) return

    let isCancelled = false
    const cancellationError = new Error('BulkCancelled')
    let activeSolver: GOSolver | undefined
    cancelRef.current = () => {
      isCancelled = true
      activeSolver?.cancel(cancellationError)
    }

    setResults([])
    setProgress({
      running: true,
      currentIndex: 0,
      totalCount: activeQueue.length,
      tested: 0,
      skipped: 0,
      total: 0,
    })

    // Priority Lock Sets: artifacts and weapons claimed by higher-priority (#1 .. #k-1) characters
    const claimedArtifactIds = new Set<string>()
    const claimedWeaponIds = new Set<string>()
    const runResults: BulkBuildResultItem[] = []

    try {
      for (let i = 0; i < queue.length; i++) {
        if (isCancelled) throw cancellationError
        const item = queue[i]
        const rank = i + 1
        const team = database.teams.get(item.teamId)
        const teamChar = database.teamChars.get(item.teamCharId)
        if (!team || !teamChar) continue
        const characterKey = teamChar.key
        const optConfig = database.optConfigs.get(teamChar.optConfigId)

        if (!item.enabled) {
          // Even if disabled from optimization, lock its currently equipped gear if it has higher priority!
          const ld =
            team.loadoutData.find((l) => l?.teamCharId === item.teamCharId) ??
            ({
              teamCharId: item.teamCharId,
              buildType: 'equipped',
            } as LoadoutDatum)
          const curWep = database.teams.getLoadoutWeapon(ld)
          if (curWep?.id) claimedWeaponIds.add(curWep.id)
          const curArts = database.teams.getLoadoutArtifacts(ld)
          for (const art of Object.values(curArts)) {
            if (art?.id) claimedArtifactIds.add(art.id)
          }
          continue
        }

        const enabledIdx = activeQueue.findIndex((q) => q.id === item.id)
        setProgress((prev) => ({
          ...prev,
          currentIndex: enabledIdx + 1,
          currentCharKey: characterKey,
          tested: 0,
          skipped: 0,
          total: 0,
        }))

        if (!optConfig?.optimizationTarget?.length) {
          runResults.push({
            queueId: item.id,
            rank,
            characterKey,
            teamName: team.name,
            artifactIds: objKeyMap(allArtifactSlotKeys, () => undefined),
            targetValue: 0,
            targetUnit: '',
            status: 'skipped',
            reason: t(
              'bulkBuild.reasonNoTarget',
              'Nenhum Objetivo de Otimização selecionado.'
            ),
          })
          setResults([...runResults])
          continue
        }

        const loadoutDatum =
          team.loadoutData.find((l) => l?.teamCharId === item.teamCharId) ??
          ({
            teamCharId: item.teamCharId,
            buildType: 'equipped',
            buildId: '',
            buildTcId: '',
            compare: false,
            compareType: 'equipped',
            compareBuildId: '',
            compareBuildTcId: '',
          } as LoadoutDatum)

        const currentWeapon = database.teams.getLoadoutWeapon(loadoutDatum)
        const optWeaponFlag = item.optWeapon || optConfig.optWeapon

        // Filter candidate weapons: NEVER allow weapons claimed by higher-priority (#1..#i) characters!
        let candidateWeapons: ICachedWeapon[]
        if (optWeaponFlag) {
          const pool = getFilteredWeapons({
            allWeapons,
            characterKey,
            optConfig: {
              ...optConfig,
              // In Bulk Priority mode, lower-priority characters' equipped weapons ARE available to steal!
              useEquippedWeapon: true,
              useTeammateWeapon: true,
            },
            teammateWeaponIds: [],
            currentWeaponId: currentWeapon?.id,
          }).filter((w) => !claimedWeaponIds.has(w.id))

          candidateWeapons = deduplicateAndSortWeapons(
            pool,
            characterKey,
            currentWeapon?.id
          )
        } else {
          if (currentWeapon && !claimedWeaponIds.has(currentWeapon.id)) {
            candidateWeapons = [currentWeapon]
          } else {
            // Current weapon was claimed by a higher-priority character! Pick best available fallback weapon
            const fallbackPool = getFilteredWeapons({
              allWeapons,
              characterKey,
              optConfig: {
                ...optConfig,
                useEquippedWeapon: true,
                useTeammateWeapon: true,
              },
              teammateWeaponIds: [],
            }).filter((w) => !claimedWeaponIds.has(w.id))
            candidateWeapons = deduplicateAndSortWeapons(
              fallbackPool,
              characterKey
            ).slice(0, 1)
          }
        }

        if (!candidateWeapons.length) {
          runResults.push({
            queueId: item.id,
            rank,
            characterKey,
            teamName: team.name,
            artifactIds: objKeyMap(allArtifactSlotKeys, () => undefined),
            targetValue: 0,
            targetUnit: '',
            status: 'no_build',
            reason: t(
              'bulkBuild.reasonNoWeapon',
              'Nenhuma arma disponível (todas bloqueadas por prioridades superiores).'
            ),
          })
          setResults([...runResults])
          continue
        }

        // Filter candidate artifacts: NEVER allow artifacts claimed by higher-priority (#1..#i) characters!
        // Artifacts equipped on lower-priority characters ARE available to use!
        const {
          mainStatKeys,
          artExclusion,
          levelLow,
          levelHigh,
          useExcludedArts,
          mainStatAssumptionLevel,
          allowPartial,
          artSetExclusion,
          statFilters,
          optimizationTarget,
          kqmsErEnabled,
          kqmsRotationDuration,
          kqmsEnemyScenario,
        } = optConfig

        const candidateArts = allArts.filter((art) => {
          if (claimedArtifactIds.has(art.id)) return false
          if (!useExcludedArts && artExclusion.includes(art.id)) return false
          if (art.level < levelLow || art.level > levelHigh) return false
          if (
            art.slotKey === 'sands' ||
            art.slotKey === 'goblet' ||
            art.slotKey === 'circlet'
          ) {
            const mainStats = mainStatKeys[art.slotKey]
            if (mainStats?.length && !mainStats.includes(art.mainStatKey))
              return false
          }
          return true
        })

        const split = compactArtifacts(
          candidateArts,
          mainStatAssumptionLevel,
          allowPartial
        )

        const activeCharKey =
          database.teams.getActiveTeamChar(item.teamId)?.key ?? characterKey

        let bestOverall: (SolverBuild & { weaponId: string }) | undefined
        let targetInfoUnit: ValueUnit = ''
        let targetInfoFixed: number | undefined

        for (const weapon of candidateWeapons) {
          if (isCancelled) throw cancellationError

          const teamData = getTeamData(
            database,
            item.teamId,
            item.teamCharId,
            mainStatAssumptionLevel,
            [],
            weapon
          )
          if (!teamData) continue
          const workerData = uiDataForTeam(
            teamData.teamData,
            gender,
            activeCharKey
          )[characterKey]?.target.data[0]
          if (!workerData) continue
          Object.assign(workerData, mergeData([workerData, dynamicData]))

          const unoptimizedTargetNode = objPathValue(
            workerData.display ?? {},
            optimizationTarget
          ) as NumNode | undefined
          if (!unoptimizedTargetNode) continue

          const resolved =
            unoptimizedTargetNode.info &&
            resolveInfo(unoptimizedTargetNode.info)
          if (resolved) {
            targetInfoUnit = (resolved.unit as ValueUnit) ?? ''
            targetInfoFixed = resolved.fixed
          }

          let effectiveStatFilters = statFilters
          if (kqmsErEnabled) {
            const kqmsMembers = team.loadoutData
              .map((ld, idx) => {
                if (!ld) return undefined
                const tc = database.teamChars.get(ld.teamCharId)
                if (!tc) return undefined
                const dbChar = database.chars.get(tc.key)
                const mWeapon =
                  ld.teamCharId === item.teamCharId
                    ? weapon
                    : database.teams.getLoadoutWeapon(ld)
                const arts = database.teams.getLoadoutArtifacts(ld)
                const artifactSetCounts: Record<string, number> = {}
                for (const a of Object.values(arts)) {
                  if (a?.setKey) {
                    artifactSetCounts[a.setKey] =
                      (artifactSetCounts[a.setKey] ?? 0) + 1
                  }
                }
                return {
                  characterKey: tc.key,
                  constellation: dbChar?.constellation ?? 0,
                  isOnFieldPrimary: idx === 0,
                  weaponKey: mWeapon?.key,
                  weaponRefinement: mWeapon?.refinement ?? 1,
                  artifactSetCounts,
                }
              })
              .filter(notEmpty)

            const weaponKqms = calculateTeamKqmsEr({
              members: kqmsMembers,
              gender,
              rotationDuration: kqmsRotationDuration,
              enemyScenario: kqmsEnemyScenario,
            })
            const erFloor =
              weaponKqms.members.find((m) => m.characterKey === characterKey)
                ?.recommendedErPercent ?? 100
            const erPathStr = JSON.stringify(['basic', 'enerRech_'])
            effectiveStatFilters = {
              ...statFilters,
              [erPathStr]: [
                ...(statFilters[erPathStr] ?? []),
                { value: erFloor, disabled: false },
              ],
            }
          }

          const valueFilter = statFilterToNumNode(
            workerData,
            effectiveStatFilters
          )
          const unoptimizedNodes = [
            ...valueFilter.map((x) => x.value),
            unoptimizedTargetNode,
          ]
          const minimum = [
            ...valueFilter.map((x) => x.minimum),
            Number.NEGATIVE_INFINITY,
          ]

          const nodes = optimize(
            unoptimizedNodes,
            workerData,
            ({ path: [p] }) => p !== 'dyn'
          )
          const optimizationTargetNode = nodes.pop()!

          const problem: OptProblemInput = {
            arts: split,
            optimizationTarget: optimizationTargetNode,
            exclusion: artSetExclusion,
            constraints: nodes.map((value, idx) => ({
              value,
              min: minimum[idx],
            })),
            topN: 1,
            initialThreshold: bestOverall?.value ?? Number.NEGATIVE_INFINITY,
          }

          const solverStatus = {
            tested: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            testedPerSecond: 0,
            skippedPerSecond: 0,
          }
          const timer = setInterval(() => {
            setProgress((prev) => ({
              ...prev,
              tested: solverStatus.tested,
              skipped: solverStatus.skipped,
              total: solverStatus.total,
            }))
          }, 120)

          try {
            const solver = new GOSolver(problem, solverStatus, maxWorkers)
            activeSolver = solver
            if (isCancelled) {
              solver.cancel(cancellationError)
              throw cancellationError
            }
            const solverRes = await solver.solve()
            solver.cancel()
            activeSolver = undefined

            const topWeaponBuilds = mergeBuilds(
              solverRes.map((r) => r.builds),
              1
            )
            if (
              topWeaponBuilds.length > 0 &&
              (!bestOverall || topWeaponBuilds[0].value > bestOverall.value)
            ) {
              bestOverall = {
                ...topWeaponBuilds[0],
                weaponId: weapon.id,
              }
            }
          } finally {
            clearInterval(timer)
          }
        }

        if (!bestOverall) {
          runResults.push({
            queueId: item.id,
            rank,
            characterKey,
            teamName: team.name,
            artifactIds: objKeyMap(allArtifactSlotKeys, () => undefined),
            targetValue: 0,
            targetUnit: '',
            status: 'no_build',
            reason: t(
              'bulkBuild.reasonNoValidBuild',
              'Nenhuma combinação atendeu às restrições com os artefatos restantes.'
            ),
          })
          setResults([...runResults])
          continue
        }

        const mappedArtifactIds = objKeyMap(allArtifactSlotKeys, (slotKey) =>
          bestOverall!.artifactIds.find(
            (aId) => database.arts.get(aId)?.slotKey === slotKey
          )
        )

        // Lock winning weapon & artifacts so #rank+1 and below CANNOT use them!
        if (bestOverall.weaponId) claimedWeaponIds.add(bestOverall.weaponId)
        for (const aId of Object.values(mappedArtifactIds)) {
          if (aId) claimedArtifactIds.add(aId)
        }

        // Save into character's GeneratedBuildList and optionally equip immediately
        database.optConfigs.newOrSetGeneratedBuildList(teamChar.optConfigId, {
          builds: [
            {
              artifactIds: mappedArtifactIds,
              weaponId: bestOverall.weaponId,
            },
          ],
          buildDate: Date.now(),
        })

        if (item.autoEquip) {
          if (loadoutDatum.buildType === 'real' && loadoutDatum.buildId) {
            database.builds.set(loadoutDatum.buildId, {
              weaponId: bestOverall.weaponId,
              artifactIds: mappedArtifactIds,
            })
          } else {
            const locKey = charKeyToLocCharKey(characterKey)
            const charObj = database.chars.get(characterKey)
            allArtifactSlotKeys.forEach((s) => {
              const aid = mappedArtifactIds[s]
              if (aid) {
                database.arts.set(aid, { location: locKey })
              } else if (charObj?.equippedArtifacts[s]) {
                database.arts.set(charObj.equippedArtifacts[s], {
                  location: '',
                })
              }
            })
            if (bestOverall.weaponId) {
              database.weapons.set(bestOverall.weaponId, { location: locKey })
            }
          }
        }

        const displayScale = targetInfoUnit === '%' ? 100 : 1
        runResults.push({
          queueId: item.id,
          rank,
          characterKey,
          teamName: team.name,
          weaponId: bestOverall.weaponId,
          artifactIds: mappedArtifactIds,
          targetValue: bestOverall.value * displayScale,
          targetUnit: targetInfoUnit,
          targetFixed: targetInfoFixed,
          status: 'success',
        })
        setResults([...runResults])
      }
    } catch (e) {
      if (e !== cancellationError) {
        console.error(e)
        if (e instanceof Error) throwGlobalError(e)
      }
    } finally {
      cancelRef.current = () => {}
      setProgress((prev) => ({
        ...prev,
        running: false,
      }))
    }
  }, [
    queue,
    database,
    allWeapons,
    allArts,
    gender,
    maxWorkers,
    t,
    throwGlobalError,
  ])

  const readyCount = useMemo(
    () =>
      queue.filter((item) => {
        if (!item.enabled) return false
        const tc = database.teamChars.get(item.teamCharId)
        if (!tc) return false
        const opt = database.optConfigs.get(tc.optConfigId)
        return Boolean(opt?.optimizationTarget?.length)
      }).length,
    [queue, database]
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, my: 1 }}>
      <Suspense fallback={false}>
        <CharacterSingleSelectionModal
          show={showAddCharModal}
          onHide={onCloseAddChar}
          onSelect={handleAddCharacter}
        />
      </Suspense>

      {/* Top Header & Global Controls */}
      <CardThemed>
        <CardContent>
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
                {t('bulkBuild.title', 'Bulk Build por Ordem de Prioridade')}
              </Typography>
              <InfoTooltip
                title={
                  <Typography variant="body2">
                    {t(
                      'bulkBuild.desc',
                      'Otimiza seus personagens em sequência (#1, #2, #3...). Os artefatos e a arma escolhidos para #1 ficam bloqueados para #2 em diante — assim o personagem #5 nunca usa equipamentos dos personagens #1 a #4.'
                    )}
                  </Typography>
                }
              />
            </Box>

            <Alert severity="info" sx={{ py: 0.5 }}>
              {t(
                'bulkBuild.priorityRuleAlert',
                'Regra de Prioridade Estrita: a fila é calculada do #1 em diante. Cada personagem bloqueia sua arma e seus 5 artefatos vencedores para todos os personagens abaixo dele. Selecione o Objetivo e os Conjuntos/Efeitos de cada personagem antes de iniciar.'
              )}
            </Alert>

            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                alignItems: 'center',
              }}
            >
              <Button
                color="primary"
                startIcon={<Add />}
                disabled={progress.running}
                onClick={onOpenAddChar}
              >
                {t('bulkBuild.addCharBtn', 'Adicionar Personagem')}
              </Button>
              <Button
                color="info"
                startIcon={<GroupAdd />}
                disabled={progress.running}
                onClick={handleImportAllTeams}
              >
                {t('bulkBuild.importTeamsBtn', 'Importar das Equipes')}
              </Button>
              <Button
                color="success"
                startIcon={<AutoAwesome />}
                disabled={progress.running || !queue.length}
                onClick={handleEnableMaxAllQueue}
              >
                {t(
                  'bulkBuild.maxAllSetsBtn',
                  'Ativar Todos os Artefatos e Efeitos no Máximo (Fila Toda)'
                )}
              </Button>
              <Button
                color="error"
                startIcon={<DeleteForever />}
                disabled={progress.running || !queue.length}
                onClick={() => {
                  setQueue([])
                  setResults([])
                }}
              >
                {t('bulkBuild.clearQueueBtn', 'Limpar Fila')}
              </Button>

              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <DropdownButton
                  disabled={progress.running}
                  title={`${maxWorkers} Threads`}
                >
                  {range(1, nativeThreads)
                    .reverse()
                    .map((v) => (
                      <MenuItem key={v} onClick={() => setMaxWorkers(v)}>
                        {v} Threads
                      </MenuItem>
                    ))}
                </DropdownButton>

                <Button
                  color={progress.running ? 'error' : 'success'}
                  variant="contained"
                  disabled={!progress.running && readyCount === 0}
                  startIcon={progress.running ? <Close /> : <PlayArrow />}
                  onClick={
                    progress.running ? () => cancelRef.current() : runBulkBuild
                  }
                >
                  {progress.running
                    ? t('generateButton.cancel', 'Cancelar')
                    : `${t('bulkBuild.runBtn', 'Gerar Bulk Builds')} (${readyCount})`}
                </Button>
              </Box>
            </Box>

            {progress.running && (
              <CardThemed bgt="light">
                <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('bulkBuild.runningStatus', {
                        current: progress.currentIndex,
                        total: progress.totalCount,
                        defaultValue: `Otimizando Prioridade #${progress.currentIndex} de ${progress.totalCount}`,
                      })}
                      {progress.currentCharKey && (
                        <>
                          :{' '}
                          <CharacterName
                            characterKey={progress.currentCharKey}
                            gender={gender}
                          />
                        </>
                      )}
                    </Typography>
                    {Number.isFinite(progress.total) && progress.total > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {(
                          ((progress.tested + progress.skipped) /
                            progress.total) *
                          100
                        ).toFixed(1)}
                        %
                      </Typography>
                    )}
                  </Box>
                  <LinearProgress
                    variant={
                      Number.isFinite(progress.total) && progress.total > 0
                        ? 'determinate'
                        : 'indeterminate'
                    }
                    value={
                      Number.isFinite(progress.total) && progress.total > 0
                        ? Math.min(
                            100,
                            ((progress.tested + progress.skipped) /
                              progress.total) *
                              100
                          )
                        : 0
                    }
                  />
                </CardContent>
              </CardThemed>
            )}
          </Stack>
        </CardContent>
      </CardThemed>

      {/* Priority Queue List (#1, #2, #3...) */}
      {queue.length === 0 ? (
        <CardThemed>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t(
                'bulkBuild.emptyTitle',
                'Nenhum personagem na fila de prioridade.'
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(
                'bulkBuild.emptySubtitle',
                'Clique em "Adicionar Personagem" ou "Importar das Equipes" acima para montar sua ordem de prioridade (#1 em diante).'
              )}
            </Typography>
          </CardContent>
        </CardThemed>
      ) : (
        <Stack spacing={1.5}>
          {queue.map((item, idx) => (
            <BulkQueueRow
              key={item.id}
              item={item}
              rank={idx + 1}
              isFirst={idx === 0}
              isLast={idx === queue.length - 1}
              disabled={progress.running}
              result={results.find((r) => r.queueId === item.id)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

const BulkQueueRow = memo(function BulkQueueRow({
  item,
  rank,
  isFirst,
  isLast,
  disabled,
  result,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  item: BulkQueueItem
  rank: number
  isFirst: boolean
  isLast: boolean
  disabled: boolean
  result?: BulkBuildResultItem
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (patch: Partial<BulkQueueItem>) => void
  onRemove: () => void
}) {
  const database = useDatabase()
  const team = useTeam(item.teamId)
  const teamChar = useTeamChar(item.teamCharId)

  if (!team || !teamChar) return null

  return (
    <Suspense
      fallback={<Skeleton variant="rectangular" width="100%" height={180} />}
    >
      <BulkQueueRowInner
        item={item}
        rank={rank}
        isFirst={isFirst}
        isLast={isLast}
        disabled={disabled}
        result={result}
        teamId={item.teamId}
        teamCharId={item.teamCharId}
        characterKey={teamChar.key}
        optConfigId={teamChar.optConfigId}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onUpdate={onUpdate}
        onRemove={onRemove}
        database={database}
      />
    </Suspense>
  )
})

function BulkQueueRowInner({
  item,
  rank,
  isFirst,
  isLast,
  disabled,
  result,
  teamId,
  teamCharId,
  characterKey,
  optConfigId,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  item: BulkQueueItem
  rank: number
  isFirst: boolean
  isLast: boolean
  disabled: boolean
  result?: BulkBuildResultItem
  teamId: string
  teamCharId: string
  characterKey: CharacterKey
  optConfigId: string
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (patch: Partial<BulkQueueItem>) => void
  onRemove: () => void
  database: ReturnType<typeof useDatabase>
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const { gender } = useDBMeta()
  const team = useTeam(teamId)!
  const teamChar = useTeamChar(teamCharId)!
  const character = useCharacter(characterKey)
  const optConfig = useOptConfig(optConfigId)!

  const loadoutDatum = useMemo(
    () =>
      team.loadoutData.find((l) => l?.teamCharId === teamCharId) ??
      ({
        teamCharId,
        buildType: 'equipped',
        buildId: '',
        buildTcId: '',
        compare: false,
        compareType: 'equipped',
        compareBuildId: '',
        compareBuildTcId: '',
      } as LoadoutDatum),
    [team.loadoutData, teamCharId]
  )

  const teamData = useTeamDataNoContext(teamId, teamCharId)
  const charUIData = teamData?.[characterKey]?.target

  const teamCharacterContextValue: TeamCharacterContextObj = useMemo(
    () => ({
      teamId,
      team,
      teamCharId,
      teamChar,
      loadoutDatum,
    }),
    [teamId, team, teamCharId, teamChar, loadoutDatum]
  )

  const characterContextValue = useMemo(
    () => (character ? { character } : undefined),
    [character]
  )

  const dataContextValue: dataContextObj | undefined = useMemo(
    () =>
      teamData && charUIData
        ? {
            data: charUIData,
            teamData,
          }
        : undefined,
    [teamData, charUIData]
  )

  // Candidate teams that include this character so user can switch team context
  const teamsWithChar = useMemo(
    () =>
      database.teams.entries
        .map(([tId, tObj]) => {
          const ld = tObj.loadoutData.find(
            (l) =>
              l && database.teamChars.get(l.teamCharId)?.key === characterKey
          )
          return ld
            ? { teamId: tId, teamName: tObj.name, teamCharId: ld.teamCharId }
            : undefined
        })
        .filter(notEmpty),
    [database, characterKey]
  )

  const handleMaxEffectsSingle = useCallback(() => {
    const baseData = charUIData?.data[0] ?? { charKey: constant(characterKey) }
    const fakeData = new UIData(
      {
        ...baseData,
        artSet: objKeyMap(allArtifactSetKeys, () => constant(4)),
        nonStacking: objKeyMap(allNonstackBuffs, () => constant(characterKey)),
      },
      undefined
    )
    const nextCond = buildMaxArtifactConditionals(
      teamChar.conditional,
      characterKey,
      fakeData
    )
    database.teamChars.set(teamCharId, (tc) => {
      tc.conditional = nextCond
    })
    database.optConfigs.set(optConfigId, {
      artSetExclusion: {},
    })
  }, [
    charUIData,
    characterKey,
    teamChar.conditional,
    database,
    teamCharId,
    optConfigId,
  ])

  const hasTarget = Boolean(optConfig.optimizationTarget?.length)

  if (!characterContextValue || !dataContextValue) {
    return <Skeleton variant="rectangular" width="100%" height={160} />
  }

  return (
    <TeamCharacterContext.Provider value={teamCharacterContextValue}>
      <CharacterContext.Provider value={characterContextValue}>
        <DataContext.Provider value={dataContextValue}>
          <FormulaDataWrapper>
            <OptTargetWrapper>
              <CardThemed
                sx={{
                  opacity: item.enabled ? 1 : 0.6,
                  borderLeft: '4px solid',
                  borderLeftColor: !item.enabled
                    ? 'secondary.main'
                    : hasTarget
                      ? 'success.main'
                      : 'warning.main',
                }}
              >
                <CardContent
                  sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
                >
                  {/* Row Header: Priority #Rank, Reorder, Character, Team Selector, Toggles */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <SqBadge
                      color="primary"
                      sx={{ fontSize: '1rem', px: 1.2, py: 0.4 }}
                    >
                      #{rank}
                    </SqBadge>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton
                        size="small"
                        disabled={disabled || isFirst}
                        onClick={onMoveUp}
                      >
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={disabled || isLast}
                        onClick={onMoveDown}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                    </Box>

                    <Button
                      size="small"
                      disabled={disabled}
                      color={item.enabled ? 'success' : 'secondary'}
                      startIcon={
                        item.enabled ? <CheckBox /> : <CheckBoxOutlineBlank />
                      }
                      onClick={() => onUpdate({ enabled: !item.enabled })}
                    >
                      <CharIconSide characterKey={characterKey} />
                      <Typography sx={{ fontWeight: 'bold', ml: 0.5 }}>
                        <CharacterName
                          characterKey={characterKey}
                          gender={gender}
                        />
                      </Typography>
                    </Button>

                    {teamsWithChar.length > 1 ? (
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <Select
                          value={`${teamId}|${teamCharId}`}
                          disabled={disabled}
                          onChange={(e) => {
                            const [newTId, newTcId] = e.target.value.split('|')
                            onUpdate({ teamId: newTId, teamCharId: newTcId })
                          }}
                          sx={{ fontSize: '0.8rem' }}
                        >
                          {teamsWithChar.map((tw) => (
                            <MenuItem
                              key={`${tw.teamId}|${tw.teamCharId}`}
                              value={`${tw.teamId}|${tw.teamCharId}`}
                            >
                              {tw.teamName}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <SqBadge color="secondary">{team.name}</SqBadge>
                    )}

                    {!hasTarget && (
                      <SqBadge color="warning">
                        {t(
                          'bulkBuild.missingTargetBadge',
                          'Selecione um Objetivo'
                        )}
                      </SqBadge>
                    )}

                    <Box
                      sx={{
                        ml: 'auto',
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button
                        size="small"
                        color="success"
                        startIcon={<AutoAwesome />}
                        disabled={disabled}
                        onClick={handleMaxEffectsSingle}
                      >
                        {t(
                          'bulkBuild.maxSetsSingleBtn',
                          'Ativar Todos Sets & Efeitos Máx.'
                        )}
                      </Button>

                      <Button
                        size="small"
                        color={item.autoEquip ? 'info' : 'secondary'}
                        startIcon={
                          item.autoEquip ? (
                            <CheckBox />
                          ) : (
                            <CheckBoxOutlineBlank />
                          )
                        }
                        disabled={disabled}
                        onClick={() => onUpdate({ autoEquip: !item.autoEquip })}
                      >
                        {t('bulkBuild.autoEquipBtn', 'Auto-Equipar')}
                      </Button>

                      <IconButton
                        size="small"
                        color="error"
                        disabled={disabled}
                        onClick={onRemove}
                      >
                        <DeleteForever fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Row Configuration Grid: Target Selector + Artifact Sets & Effects + Constraints/Weapon/KQMS */}
                  <BulkRowConfigControls
                    characterKey={characterKey}
                    optConfigId={optConfigId}
                    loadoutDatum={loadoutDatum}
                    disabled={disabled}
                  />

                  {/* Result Preview for this Priority Slot */}
                  {result && (
                    <>
                      <Divider />
                      {result.status === 'success' ? (
                        <Box>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 1,
                            }}
                          >
                            <SqBadge color="success">
                              #{result.rank}{' '}
                              {t('bulkBuild.resultReady', 'Build Encontrada')}
                            </SqBadge>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 'bold' }}
                            >
                              {t(
                                'bulkBuild.resultScore',
                                'Resultado do Objetivo:'
                              )}{' '}
                              {valueString(
                                result.targetValue,
                                result.targetUnit,
                                result.targetFixed
                              )}
                            </Typography>
                          </Box>
                          <Grid
                            container
                            spacing={1}
                            columns={{ xs: 2, sm: 3, md: 6 }}
                          >
                            <Grid size={1}>
                              <CardThemed bgt="light" sx={{ height: '100%' }}>
                                <WeaponCardNano
                                  weaponId={result.weaponId}
                                  showLocation
                                />
                              </CardThemed>
                            </Grid>
                            {allArtifactSlotKeys.map((slotKey) => (
                              <Grid key={slotKey} size={1}>
                                <CardThemed bgt="light" sx={{ height: '100%' }}>
                                  <ArtifactCardNano
                                    slotKey={slotKey}
                                    artifactId={result.artifactIds[slotKey]}
                                    showLocation
                                  />
                                </CardThemed>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                      ) : (
                        <Alert
                          severity={
                            result.status === 'skipped' ? 'warning' : 'error'
                          }
                          sx={{ py: 0.25 }}
                        >
                          {result.reason}
                        </Alert>
                      )}
                    </>
                  )}
                </CardContent>
              </CardThemed>
            </OptTargetWrapper>
          </FormulaDataWrapper>
        </DataContext.Provider>
      </CharacterContext.Provider>
    </TeamCharacterContext.Provider>
  )
}

const BulkRowConfigControls = memo(function BulkRowConfigControls({
  characterKey,
  optConfigId,
  loadoutDatum,
  disabled,
}: {
  characterKey: CharacterKey
  optConfigId: string
  loadoutDatum: LoadoutDatum
  disabled: boolean
}) {
  const database = useDatabase()
  const optConfig = useOptConfig(optConfigId)!
  const allWeapons = useDataManagerValues(database.weapons)
  const teammateWeaponIds = useTeammateWeaponIds()
  const currentWeaponId = database.teams.getLoadoutWeapon(loadoutDatum)?.id
  const { teamKqms, currentCharErFloor } = useTeamKqmsEr()

  const filteredWeapons = useMemo(
    () =>
      getFilteredWeapons({
        allWeapons,
        characterKey,
        optConfig: {
          ...optConfig,
          useEquippedWeapon: true,
          useTeammateWeapon: true,
        },
        teammateWeaponIds,
        currentWeaponId,
      }),
    [allWeapons, characterKey, optConfig, teammateWeaponIds, currentWeaponId]
  )

  return (
    <Grid container spacing={1}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Stack spacing={1}>
          <OptimizationTargetSelector
            optimizationTarget={optConfig.optimizationTarget}
            setTarget={(target) =>
              database.optConfigs.set(optConfigId, {
                optimizationTarget: target,
              })
            }
            disabled={disabled}
            targetSelectorModalProps={{
              excludeSections: ['character', 'bonusStats', 'teamBuff'],
            }}
          />
          <WeaponFilter
            filteredWeapons={filteredWeapons}
            teammateWeaponIds={teammateWeaponIds}
            currentWeaponId={currentWeaponId}
            disabled={disabled}
          />
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ArtifactSetConfig disabled={disabled} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Stack spacing={1}>
          <StatFilterCard disabled={disabled} />
          <KqmsErCard
            teamKqms={teamKqms}
            currentCharErFloor={currentCharErFloor}
            disabled={disabled}
          />
        </Stack>
      </Grid>
    </Grid>
  )
})
