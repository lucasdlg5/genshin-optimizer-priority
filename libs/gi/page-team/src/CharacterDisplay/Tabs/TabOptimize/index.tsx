import { AdResponsive } from '@genshin-optimizer/common/ad'
import {
  useDataManagerEntries,
  useDataManagerValues,
} from '@genshin-optimizer/common/database-ui'
import {
  useBoolState,
  useMediaQueryUp,
} from '@genshin-optimizer/common/react-util'
import {
  BootstrapTooltip,
  CardThemed,
  DropdownButton,
  InfoTooltip,
  ModalWrapper,
  SqBadge,
  useConstObj,
  usePrev,
} from '@genshin-optimizer/common/ui'
import {
  bulkCatTotal,
  notEmpty,
  objKeyMap,
  objPathValue,
  range,
} from '@genshin-optimizer/common/util'
import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import {
  allArtifactSlotKeys,
  charKeyToLocCharKey,
} from '@genshin-optimizer/gi/consts'
import type {
  GeneratedBuild,
  ICachedWeapon,
  OptConfig,
} from '@genshin-optimizer/gi/db'
import { maxBuildsToShowList } from '@genshin-optimizer/gi/db'
import {
  TeamCharacterContext,
  useArtifacts,
  useDatabase,
  useDBMeta,
  useGeneratedBuildList,
  useOptConfig,
  useTeammateArtifactIds,
  useWeapon,
} from '@genshin-optimizer/gi/db-ui'
import type { OptProblemInput, SolverBuild } from '@genshin-optimizer/gi/solver'
import {
  createSolverWorkers,
  GOSolver,
  mergeBuilds,
  mergePlot,
  terminateSolverWorkers,
} from '@genshin-optimizer/gi/solver'
import { compactArtifacts } from '@genshin-optimizer/gi/solver-tc'
import {
  ArtifactLevelSlider,
  BuildDisplayItem,
  CharacterName,
  DataContext,
  GOAdWrapper,
  GraphContext,
  getTeamData,
  HitModeToggle,
  NoArtWarning,
  ReactionToggle,
  resolveInfo,
  statFilterToNumNode,
  useGlobalError,
  useNumWorkers,
  useTeamData,
} from '@genshin-optimizer/gi/ui'
import type { CalcResult, UIData } from '@genshin-optimizer/gi/uidata'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { NumNode } from '@genshin-optimizer/gi/wr'
import { dynamicData, mergeData, optimize } from '@genshin-optimizer/gi/wr'
import {
  CheckBox,
  CheckBoxOutlineBlank,
  Close,
  DeleteForever,
  Science,
  TrendingUp,
} from '@mui/icons-material'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import CloseIcon from '@mui/icons-material/Close'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff'
import {
  Box,
  Button,
  ButtonGroup,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'
import type React from 'react'
import type { FormEventHandler, ReactNode } from 'react'
import {
  memo,
  Suspense,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Trans, useTranslation } from 'react-i18next'
import useCompareData from '../../../useCompareData'
import CompareBtn from '../../CompareBtn'
import { CustomMultiTargetButton } from '../../CustomMultiTarget/CustomMultiTargetButton'
import ArtifactSetConfig from './Components/ArtifactSetConfig'
import AssumeFullLevelToggle from './Components/AssumeFullLevelToggle'
import BonusStatsCard from './Components/BonusStatsCard'
import type { BuildStatus } from './Components/BuildAlert'
import BuildAlert from './Components/BuildAlert'
import ChartCard from './Components/ChartCard'
import ExcludeArt from './Components/ExcludeArt'
import { KqmsErCard, KqmsErResultsSummary } from './Components/KqmsErCard'
import MainStatSelectionCard from './Components/MainStatSelectionCard'
import { OptCharacterCard } from './Components/OptCharacterCard'
import OptimizationTargetSelector from './Components/OptimizationTargetSelector'
import StatFilterCard from './Components/StatFilterCard'
import UseEquipped from './Components/UseEquipped'
import { UseTeammateArt } from './Components/UseTeammateArt'
import { WeaponBuildsPreviewCard } from './Components/WeaponBuildsPreviewCard'
import { WeaponFilter } from './Components/WeaponFilter'
import { calculateTeamKqmsEr } from './kqmsErCalc'
import ScalesWith from './ScalesWith'
import { useTeamKqmsEr } from './useTeamKqmsEr'
import {
  deduplicateAndSortWeapons,
  getFilteredWeapons,
  useTeammateWeaponIds,
} from './weaponFilterUtil'

function initBuildStatus(): BuildStatus {
  return {
    type: 'inactive',
    tested: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    testedPerSecond: 0,
    skippedPerSecond: 0,
  }
}
const audio = new Audio('assets/notification.mp3')
export default function TabBuild() {
  const { t } = useTranslation('page_character_optimize')
  const {
    loadoutDatum,
    teamCharId,
    teamChar: { optConfigId, key: characterKey },
    teamId,
  } = useContext(TeamCharacterContext)
  const database = useDatabase()
  const { setChartData, graphBuilds, setGraphBuilds } = useContext(GraphContext)
  const { gender } = useDBMeta()

  const activeCharKey = database.teams.getActiveTeamChar(teamId)!.key

  const [notification, setnotification] = useState(false)
  const notificationRef = useRef(notification)
  notificationRef.current = notification

  const [buildStatus, setBuildStatus] = useState(() => initBuildStatus())
  const generatingBuilds = buildStatus.type !== 'inactive'

  const [maxWorkers, nativeThreads, setMaxWorkers] = useNumWorkers()

  // Clear state when changing characters
  if (usePrev(characterKey) !== characterKey) setBuildStatus(initBuildStatus())

  const noArtifact = useMemo(() => !database.arts.values.length, [database])

  const buildSetting = useOptConfig(optConfigId)!
  const {
    plotBase,
    optimizationTarget: optimizationTargetDb,
    mainStatAssumptionLevel,
    allowPartial,
    maxBuildsToShow,
    levelLow,
    levelHigh,
    generatedBuildListId,
    useTeammateBuild,
    optWeapon,
    kqmsErEnabled,
  } = buildSetting
  const { teamKqms, currentCharErFloor } = useTeamKqmsEr()
  const {
    builds: buildsDb,
    weaponBuilds: weaponBuildsDb,
    buildDate,
  } = useGeneratedBuildList(generatedBuildListId ?? '') ?? {
    builds: [] as GeneratedBuild[],
    weaponBuilds: undefined as GeneratedBuild[] | undefined,
  }

  const builds = useConstObj(buildsDb)
  const weaponBuilds = useConstObj(weaponBuildsDb ?? [])
  const optimizationTarget = useConstObj(optimizationTargetDb)
  const { data } = useContext(DataContext)
  const compareData = useCompareData()
  const optimizationTargetNode =
    optimizationTarget &&
    (objPathValue(data?.getDisplay(), optimizationTarget) as CalcResult)
  const isSM = ['xs', 'sm'].includes(useMediaQueryUp())
  const deferredBuildSetting = useDeferredValue(buildSetting)
  const teammateArtifactIds = useTeammateArtifactIds()
  const teammateWeaponIds = useTeammateWeaponIds()
  const allArts = useDataManagerValues(database.arts)
  const allWeapons = useDataManagerValues(database.weapons)
  const currentWeaponId = database.teams.getLoadoutWeapon(loadoutDatum)?.id
  const filteredWeapons = useMemo(
    () =>
      getFilteredWeapons({
        allWeapons,
        characterKey,
        optConfig: deferredBuildSetting,
        teammateWeaponIds,
        currentWeaponId,
      }),
    [
      allWeapons,
      characterKey,
      deferredBuildSetting,
      teammateWeaponIds,
      currentWeaponId,
    ]
  )
  /**
   * Filter the artifacts down to the pool the optimizer is allowed to use for
   * the given opt config. The opt config is passed in as an argument (instead
   * of being read from `buildSetting`) so that callers can filter with the
   * latest settings, even while the rendered `filteredArts` is still deferred.
   */
  const getFilteredArts = useCallback(
    (optConfig: OptConfig) => {
      const {
        mainStatKeys,
        excludedLocations,
        artExclusion,
        levelLow,
        levelHigh,
        useExcludedArts,
        useTeammateBuild,
      } = optConfig

      return allArts.filter((art) => {
        if (!useExcludedArts && artExclusion.includes(art.id)) return false
        if (!useTeammateBuild && teammateArtifactIds.includes(art.id))
          return false
        if (art.level < levelLow) return false
        if (art.level > levelHigh) return false
        const mainStats = mainStatKeys[art.slotKey]
        if (mainStats?.length && !mainStats.includes(art.mainStatKey))
          return false

        const locKey = charKeyToLocCharKey(characterKey)

        if (
          art.location &&
          art.location !== locKey &&
          excludedLocations.includes(art.location)
        )
          return false

        return true
      })
    },
    [allArts, teammateArtifactIds, characterKey]
  )
  const filteredArts = useMemo(
    () => getFilteredArts(deferredBuildSetting),
    [getFilteredArts, deferredBuildSetting]
  )

  const filteredArtIdMap = useMemo(
    () =>
      objKeyMap(
        filteredArts.map(({ id }) => id),
        (_) => true
      ),
    [filteredArts]
  )
  const artEntries = useDataManagerEntries(database.arts)
  const { levelTotal, allowListTotal, excludedTotal, teammateBuildTotal } =
    useMemo(() => {
      const catKeys = {
        levelTotal: ['in'],
        allowListTotal: ['in'],
        excludedTotal: ['in'],
        teammateBuildTotal: ['in'],
      } as const
      return bulkCatTotal(catKeys, (ctMap) =>
        artEntries.forEach(([id, art]) => {
          const { level, location } = art
          const { levelLow, levelHigh, excludedLocations, artExclusion } =
            deferredBuildSetting
          if (level >= levelLow && level <= levelHigh) {
            ctMap['levelTotal']['in'].total++
            if (filteredArtIdMap[id]) ctMap['levelTotal']['in'].current++
          }
          const locKey = charKeyToLocCharKey(characterKey)
          if (
            location &&
            location !== locKey &&
            !excludedLocations.includes(location)
          ) {
            ctMap['allowListTotal']['in'].total++
            if (filteredArtIdMap[id]) ctMap['allowListTotal']['in'].current++
          }
          if (artExclusion.includes(id)) {
            ctMap['excludedTotal']['in'].total++
            if (filteredArtIdMap[id]) ctMap['excludedTotal']['in'].current++
          }
          if (teammateArtifactIds.includes(id)) {
            ctMap['teammateBuildTotal']['in'].total++
            if (filteredArtIdMap[id])
              ctMap['teammateBuildTotal']['in'].current++
          }
        })
      )
    }, [
      characterKey,
      artEntries,
      deferredBuildSetting,
      filteredArtIdMap,
      teammateArtifactIds,
    ])

  const tabFocused = useRef(true)
  useEffect(() => {
    const onFocus = () => (tabFocused.current = true)
    const onBlur = () => (tabFocused.current = false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [tabFocused])

  // Provides a function to cancel the work
  const cancelToken = useRef(() => {})
  //terminate worker when component unmounts
  useEffect(() => () => cancelToken.current(), [])
  const throwGlobalError = useGlobalError()

  const generateBuilds = useCallback(async () => {
    const {
      artSetExclusion,
      plotBase,
      statFilters,
      optimizationTarget,
      mainStatAssumptionLevel,
      allowPartial,
      maxBuildsToShow,
      optWeapon,
      kqmsErEnabled,
      kqmsRotationDuration,
      kqmsEnemyScenario,
    } = buildSetting
    if (!characterKey || !optimizationTarget) return
    if (notificationRef.current) Notification?.requestPermission()

    const loadoutWeapon = database.teams.getLoadoutWeapon(loadoutDatum)
    const weaponsToOptimize: ICachedWeapon[] = optWeapon
      ? deduplicateAndSortWeapons(
          getFilteredWeapons({
            allWeapons,
            characterKey,
            optConfig: buildSetting,
            teammateWeaponIds,
            currentWeaponId: loadoutWeapon?.id,
          }),
          characterKey,
          loadoutWeapon?.id
        )
      : [loadoutWeapon]
    if (!weaponsToOptimize.length) return

    // Filter with the latest settings rather than the deferred `filteredArts`,
    // so that a build started right after a settings change does not use an
    // outdated artifact pool. (#1120)
    const split = compactArtifacts(
      getFilteredArts(buildSetting),
      mainStatAssumptionLevel,
      allowPartial
    )

    setChartData(undefined)

    const cancelled = new Promise<void>((r) => (cancelToken.current = r))
    const cancellationError = new Error()
    let isCancelled = false
    let activeSolver: GOSolver | undefined
    let sharedWorkers: Worker[] = []
    cancelled.then(() => {
      isCancelled = true
      activeSolver?.cancel(cancellationError)
      terminateSolverWorkers(sharedWorkers)
    })

    const status: Omit<BuildStatus, 'type'> = {
      tested: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testedPerSecond: 0,
      skippedPerSecond: 0,
      startTime: performance.now(),
      weaponIndex: 1,
      weaponTotal: weaponsToOptimize.length,
    }
    let baseTested = 0
    let baseFailed = 0
    let baseSkipped = 0
    let baseTotal = 0
    let activeWeaponStatus: Omit<BuildStatus, 'type'> = {
      tested: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testedPerSecond: 0,
      skippedPerSecond: 0,
    }

    const syncStatus = () => {
      status.tested = baseTested + activeWeaponStatus.tested
      status.failed = baseFailed + activeWeaponStatus.failed
      status.skipped = baseSkipped + activeWeaponStatus.skipped
      status.total = Number.isFinite(activeWeaponStatus.total)
        ? baseTotal + activeWeaponStatus.total
        : Number.NaN
      status.testedPerSecond = activeWeaponStatus.testedPerSecond
      status.skippedPerSecond = activeWeaponStatus.skippedPerSecond
    }

    const statusUpdateTimer = setInterval(() => {
      syncStatus()
      setBuildStatus({ type: 'active', ...status })
    }, 200)

    const teamObj = database.teams.get(teamId)

    try {
      sharedWorkers = createSolverWorkers(maxWorkers)
      const allWeaponBuilds: Array<SolverBuild & { weaponId: string }> = []
      const bestBuildPerWeapon: Array<SolverBuild & { weaponId: string }> = []
      const mergedPlotByX = new Map<
        number,
        { value: number; plot: number; artifactIds: string[]; weaponId: string }
      >()
      let targetNodeForPlot: NumNode | undefined
      let plotBaseNumNodeForPlot: NumNode | undefined
      let hasAnyResults = false

      for (let wIdx = 0; wIdx < weaponsToOptimize.length; wIdx++) {
        if (isCancelled) throw cancellationError
        const weapon = weaponsToOptimize[wIdx]
        status.weaponIndex = wIdx + 1

        const teamData = getTeamData(
          database,
          teamId,
          teamCharId,
          mainStatAssumptionLevel,
          [],
          optWeapon ? weapon : undefined
        )
        if (!teamData) continue
        const workerData = uiDataForTeam(
          teamData.teamData,
          gender,
          activeCharKey
        )[characterKey]?.target.data[0]
        if (!workerData) continue
        Object.assign(workerData, mergeData([workerData, dynamicData])) // Mark art fields as dynamic
        const unoptimizedOptimizationTargetNode = objPathValue(
          workerData.display ?? {},
          optimizationTarget
        ) as NumNode | undefined
        if (!unoptimizedOptimizationTargetNode) continue
        const targetNode = unoptimizedOptimizationTargetNode
        if (plotBase && !targetNodeForPlot) targetNodeForPlot = targetNode

        let effectiveStatFilters = statFilters
        if (kqmsErEnabled && teamObj) {
          const kqmsMembers = teamObj.loadoutData
            .map((ld, index) => {
              if (!ld) return undefined
              const tc = database.teamChars.get(ld.teamCharId)
              if (!tc) return undefined
              const dbChar = database.chars.get(tc.key)
              const memberWeapon =
                ld.teamCharId === teamCharId && weapon
                  ? weapon
                  : database.teams.getLoadoutWeapon(ld)
              const arts = database.teams.getLoadoutArtifacts(ld)
              const artifactSetCounts: Record<string, number> = {}
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
                weaponKey: memberWeapon?.key,
                weaponRefinement: memberWeapon?.refinement ?? 1,
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
          unoptimizedOptimizationTargetNode,
        ]
        const minimum = [
          ...valueFilter.map((x) => x.minimum),
          Number.NEGATIVE_INFINITY,
        ]
        const plotBaseNumNode: NumNode | undefined =
          plotBase && objPathValue(workerData.display ?? {}, plotBase)
        if (plotBaseNumNode) {
          if (!plotBaseNumNodeForPlot) plotBaseNumNodeForPlot = plotBaseNumNode
          unoptimizedNodes.push(plotBaseNumNode)
          minimum.push(Number.NEGATIVE_INFINITY)
        }

        const nodes = optimize(
          unoptimizedNodes,
          workerData,
          ({ path: [p] }) => p !== 'dyn'
        )
        const plotBaseNode = plotBaseNumNode ? nodes.pop() : undefined
        const optimizationTargetNode = nodes.pop()!

        const problem: OptProblemInput = {
          arts: split,
          optimizationTarget: optimizationTargetNode,
          exclusion: artSetExclusion,
          constraints: nodes.map((value, i) => ({ value, min: minimum[i] })),

          topN: maxBuildsToShow,
          plotBase: plotBaseNode,
        }

        activeWeaponStatus = {
          tested: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          testedPerSecond: 0,
          skippedPerSecond: 0,
        }

        const solver = new GOSolver(
          problem,
          activeWeaponStatus,
          maxWorkers,
          sharedWorkers
        )
        activeSolver = solver
        if (isCancelled) {
          solver.cancel(cancellationError)
          throw cancellationError
        }

        const results = await solver.solve()
        activeSolver = undefined
        hasAnyResults = true

        baseTested += activeWeaponStatus.tested
        baseFailed += activeWeaponStatus.failed
        baseSkipped += activeWeaponStatus.skipped
        if (Number.isFinite(activeWeaponStatus.total))
          baseTotal += activeWeaponStatus.total
        activeWeaponStatus = {
          tested: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          testedPerSecond: activeWeaponStatus.testedPerSecond,
          skippedPerSecond: activeWeaponStatus.skippedPerSecond,
        }
        syncStatus()

        if (plotBaseNumNode) {
          const plotData = mergePlot(results.map((x) => x.plotData!))
          for (const dataEntry of Object.values(plotData)) {
            if (!dataEntry || dataEntry.plot === undefined) continue
            const existing = mergedPlotByX.get(dataEntry.plot)
            if (!existing || dataEntry.value > existing.value) {
              mergedPlotByX.set(dataEntry.plot, {
                value: dataEntry.value,
                plot: dataEntry.plot,
                artifactIds: dataEntry.artifactIds,
                weaponId: weapon.id,
              })
            }
          }
        }

        const weaponBuilds = mergeBuilds(
          results.map((x) => x.builds),
          maxBuildsToShow
        )
        if (optWeapon && weaponBuilds.length > 0) {
          bestBuildPerWeapon.push({ ...weaponBuilds[0], weaponId: weapon.id })
        }
        for (const build of weaponBuilds) {
          allWeaponBuilds.push({ ...build, weaponId: weapon.id })
        }
        allWeaponBuilds.sort((a, b) => b.value - a.value)
        if (allWeaponBuilds.length > maxBuildsToShow)
          allWeaponBuilds.length = maxBuildsToShow

        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      bestBuildPerWeapon.sort((a, b) => b.value - a.value)
      cancelToken.current = () => {}

      if (plotBaseNumNodeForPlot && targetNodeForPlot) {
        const solverBuilds = Array.from(mergedPlotByX.values())
        const targetNodeinfo =
          targetNodeForPlot.info && resolveInfo(targetNodeForPlot.info)
        const plotBaseNumNodeInfo =
          plotBaseNumNodeForPlot.info &&
          resolveInfo(plotBaseNumNodeForPlot.info)
        const valueScale = targetNodeinfo?.unit === '%' ? 100 : 1
        const plotScale = plotBaseNumNodeInfo?.unit === '%' ? 100 : 1
        setChartData({
          valueNode: targetNodeForPlot,
          plotNode: plotBaseNumNodeForPlot,
          data: solverBuilds.map(({ value, plot, artifactIds, weaponId }) => ({
            artifactIds: objKeyMap(allArtifactSlotKeys, (slotKey) =>
              artifactIds.find(
                (aId) => database.arts.get(aId)?.slotKey === slotKey
              )
            ),
            weaponId,
            value: value * valueScale,
            plot: plot * plotScale,
          })),
        })
      }

      if (process.env['NODE_ENV'] === 'development')
        console.log('Build Result', allWeaponBuilds)

      const mapSolverBuild = (build: SolverBuild & { weaponId: string }) => ({
        artifactIds: objKeyMap(allArtifactSlotKeys, (slotKey) =>
          build.artifactIds.find(
            (aId) => database.arts.get(aId)?.slotKey === slotKey
          )
        ),
        weaponId: build.weaponId,
      })

      database.optConfigs.newOrSetGeneratedBuildList(optConfigId, {
        builds: allWeaponBuilds.map(mapSolverBuild),
        ...(optWeapon && bestBuildPerWeapon.length > 0
          ? { weaponBuilds: bestBuildPerWeapon.map(mapSolverBuild) }
          : {}),
        buildDate: Date.now(),
      })

      setTimeout(async () => {
        // Using a ref because a user can cancel the notification while the build is going.
        if (hasAnyResults && notificationRef.current) {
          audio.play()
          if (!tabFocused.current)
            if (Notification?.permission === 'granted')
              new Notification('Genshin Optimizer', {
                body: t('buildCompleted'),
                icon: './favicon.ico',
              })
            else setTimeout(() => window.alert(t('buildCompleted')), 1)
        }
      }, 100)
    } catch (e) {
      // Worker error, cancelled, printer catches on fire, etc.
      if (e !== cancellationError) {
        console.log('Failed to load worker')
        console.log(e)
        if (e instanceof Error) throwGlobalError(e)
      }

      cancelToken.current()
      status.tested = 0
      status.failed = 0
      status.skipped = 0
      status.total = 0
    } finally {
      terminateSolverWorkers(sharedWorkers)
      clearInterval(statusUpdateTimer)
      setBuildStatus({
        type: 'inactive',
        ...status,
        finishTime: performance.now(),
      })
    }
  }, [
    buildSetting,
    characterKey,
    getFilteredArts,
    allWeapons,
    teammateWeaponIds,
    database,
    teamId,
    teamCharId,
    gender,
    activeCharKey,
    setChartData,
    maxWorkers,
    loadoutDatum,
    optConfigId,
    t,
    throwGlobalError,
  ])

  const characterName = (
    <CharacterName characterKey={characterKey} gender={gender} />
  )

  const setPlotBase = useCallback(
    (plotBase: string[] | undefined) => {
      database.optConfigs.set(optConfigId, { plotBase })
      setChartData(undefined)
    },
    [database, optConfigId, setChartData]
  )

  const targetSelector = (
    <OptimizationTargetSelector
      optimizationTarget={optimizationTarget}
      setTarget={(target) =>
        database.optConfigs.set(optConfigId, { optimizationTarget: target })
      }
      disabled={!!generatingBuilds}
      targetSelectorModalProps={{
        excludeSections: ['character', 'bonusStats', 'teamBuff'],
      }}
    />
  )

  const getGraphBuildLabel = useCallback(
    (index: number) => (
      <Trans t={t} i18nKey="graphBuildLabel" count={index + 1}>
        Graph #{{ count: index + 1 }}
      </Trans>
    ),
    [t]
  )
  const getNormBuildLabel = useCallback((index: number) => `#${index + 1}`, [])
  const getWeaponBuildLabel = useCallback(
    (index: number) =>
      t('weaponFilter.weaponBuildLabel', {
        count: index + 1,
        defaultValue: `Weapon #${index + 1}`,
      }),
    [t]
  )

  const [highlightedWeaponIdx, setHighlightedWeaponIdx] = useState<
    number | null
  >(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const handleSelectWeaponBuildIndex = useCallback((index: number) => {
    const el = document.getElementById(`weapon-build-anchor-${index}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setHighlightedWeaponIdx(index)
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedWeaponIdx(null)
      }, 2200)
    }
  }, [])

  const buildShowingCount =
    builds.length + (graphBuilds ? graphBuilds.length : 0)

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {noArtifact && <NoArtWarning />}
      {/* Build Generator Editor */}
      <Grid container spacing={1}>
        {/* 1*/}
        <Grid
          size={{
            xs: 12,
            sm: 6,
            lg: 3,
          }}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <OptCharacterCard characterKey={characterKey} />
          <WeaponFilter
            filteredWeapons={filteredWeapons}
            teammateWeaponIds={teammateWeaponIds}
            currentWeaponId={currentWeaponId}
            disabled={generatingBuilds}
            showQuickMaxButton
          />
          <BonusStatsCard />
          <CustomMultiTargetButton />
        </Grid>
        {/* 2 */}
        <Grid
          size={{
            xs: 12,
            sm: 6,
            lg: 4,
          }}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {/* Level Filter */}
          <LevelFilter
            levelTotal={levelTotal['in']}
            levelLow={levelLow}
            levelHigh={levelHigh}
            disabled={generatingBuilds}
            optConfigId={optConfigId}
          />

          {/* Main Stat Filters */}
          <CardThemed bgt="light">
            <CardContent>
              <Typography sx={{ fontWeight: 'bold' }}>
                {t('mainStat.title')}
              </Typography>
            </CardContent>
            <Divider />
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <AssumeFullLevelToggle
                  mainStatAssumptionLevel={mainStatAssumptionLevel}
                  setmainStatAssumptionLevel={(
                    mainStatAssumptionLevel: number
                  ) =>
                    database.optConfigs.set(optConfigId, {
                      mainStatAssumptionLevel,
                    })
                  }
                  disabled={generatingBuilds}
                />
                <InfoTooltip
                  title={
                    <Box>
                      <Typography variant="h6">
                        {t('mainStat.levelAssTooltip.title')}
                      </Typography>
                      <Typography>
                        {t('mainStat.levelAssTooltip.desc')}
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            </CardContent>
            {/* main stat selector */}
            <MainStatSelectionCard
              disabled={generatingBuilds}
              filteredArtIdMap={filteredArtIdMap}
            />
          </CardThemed>

          {/* use excluded */}
          <ExcludeArt
            disabled={generatingBuilds}
            excludedTotal={excludedTotal['in']}
          />
          <UseTeammateArt
            totalTally={teammateBuildTotal['in']}
            useTeammateBuild={useTeammateBuild}
            disabled={generatingBuilds}
          />
          <Button
            fullWidth
            startIcon={allowPartial ? <CheckBox /> : <CheckBoxOutlineBlank />}
            color={allowPartial ? 'success' : 'secondary'}
            onClick={() =>
              database.optConfigs.set(optConfigId, {
                allowPartial: !allowPartial,
              })
            }
            disabled={generatingBuilds}
          >
            {t('allowPartial')}
          </Button>
        </Grid>

        {/* 3 */}
        <Grid
          size={{
            xs: 12,
            sm: 6,
            lg: 5,
          }}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <ArtifactSetConfig disabled={generatingBuilds} />

          {/* use equipped */}
          <UseEquipped
            disabled={generatingBuilds}
            allowListTotal={allowListTotal['in']}
          />

          {/*Minimum Final Stat Filter */}
          <StatFilterCard disabled={generatingBuilds} />
          <KqmsErCard
            teamKqms={teamKqms}
            currentCharErFloor={currentCharErFloor}
            disabled={generatingBuilds}
          />
          <AdResponsive dataAdSlot="7724855772" bgt="light" Ad={GOAdWrapper} />
        </Grid>
      </Grid>
      {/* Footer */}
      {isSM && targetSelector}
      <ButtonGroup>
        {!isSM && targetSelector}
        <DropdownButton
          disabled={generatingBuilds || !characterKey || !optimizationTarget}
          title={
            <Trans t={t} i18nKey="build" count={maxBuildsToShow}>
              {{ count: maxBuildsToShow }} Builds
            </Trans>
          }
        >
          <MenuItem>
            <Typography
              variant="caption"
              sx={{
                color: 'info.main',
              }}
            >
              {t('buildDropdownDesc')}
            </Typography>
          </MenuItem>
          <Divider />
          {maxBuildsToShowList.map((v) => (
            <MenuItem
              key={v}
              onClick={() =>
                database.optConfigs.set(optConfigId, { maxBuildsToShow: v })
              }
            >
              <Trans t={t} i18nKey="build" count={v}>
                {{ count: v }} Builds
              </Trans>
            </MenuItem>
          ))}
        </DropdownButton>
        <DropdownButton
          disabled={generatingBuilds || !characterKey || !optimizationTarget}
          sx={{ borderRadius: '4px 0px 0px 4px' }}
          title={
            <Trans t={t} i18nKey="thread" count={maxWorkers}>
              {{ count: maxWorkers }} Threads
            </Trans>
          }
        >
          <MenuItem>
            <Typography
              variant="caption"
              sx={{
                color: 'info.main',
              }}
            >
              {t('threadDropdownDesc')}
            </Typography>
          </MenuItem>
          <Divider />
          {range(1, nativeThreads)
            .reverse()
            .map((v) => (
              <MenuItem key={v} onClick={() => setMaxWorkers(v)}>
                <Trans t={t} i18nKey="thread" count={v}>
                  {{ count: v }} Threads
                </Trans>
              </MenuItem>
            ))}
        </DropdownButton>
        <BootstrapTooltip placement="top" title={t('notifyTooltip')}>
          <Box>
            <Button
              sx={{ borderRadius: 0 }}
              color="warning"
              onClick={async () => {
                await Notification?.requestPermission()
                setnotification((n) => !n)
              }}
              disabled={!optimizationTarget}
            >
              {notification ? (
                <NotificationsActiveIcon />
              ) : (
                <NotificationsOffIcon />
              )}
            </Button>
          </Box>
        </BootstrapTooltip>
        <BootstrapTooltip
          placement="top"
          title={
            !optimizationTarget || optimizationTargetNode?.isEmpty ? (
              <Typography>
                {t('selectTargetFirst')}
                {optimizationTargetNode?.isEmpty && (
                  <>
                    <br />
                    {t('emptyTarget')}
                  </>
                )}
              </Typography>
            ) : (
              ''
            )
          }
        >
          <span>
            <Button
              disabled={
                !characterKey ||
                !optimizationTarget ||
                !optimizationTargetNode ||
                optimizationTargetNode.isEmpty ||
                (optWeapon && !filteredWeapons.length)
              }
              color={generatingBuilds ? 'error' : 'success'}
              onClick={
                generatingBuilds ? () => cancelToken.current() : generateBuilds
              }
              startIcon={generatingBuilds ? <Close /> : <TrendingUp />}
              sx={{ borderRadius: '0px 4px 4px 0px' }}
            >
              {generatingBuilds
                ? t('generateButton.cancel')
                : t('generateButton.generateBuilds')}
            </Button>
          </span>
        </BootstrapTooltip>
      </ButtonGroup>
      <ScalesWith />
      {!!characterKey && (
        <BuildAlert
          {...{ status: buildStatus, characterName, maxBuildsToShow }}
        />
      )}
      {optimizationTarget && (
        <Box>
          <ChartCard
            disabled={generatingBuilds || !optimizationTarget}
            plotBase={plotBase}
            setPlotBase={setPlotBase}
            showTooltip={!optimizationTarget}
          />
        </Box>
      )}
      {optimizationTarget && (
        <CardThemed bgt="light">
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1,
              }}
            >
              <Typography sx={{ flexGrow: 1 }}>
                {builds ? (
                  <span>
                    <Trans
                      t={t}
                      i18nKey="buildShowingNum"
                      count={buildShowingCount}
                    >
                      Showing{' '}
                      <strong>{{ count: buildShowingCount } as any}</strong>{' '}
                      build generated for{' '}
                      <CharacterName
                        characterKey={characterKey}
                        gender={gender}
                      />
                      .
                    </Trans>{' '}
                    {!!buildDate && (
                      <span>
                        {t('generatedOn')}
                        <strong>{new Date(buildDate).toLocaleString()}</strong>
                      </span>
                    )}
                  </span>
                ) : (
                  <span>{t('selectChar')}</span>
                )}
              </Typography>
              <Button
                disabled={!builds.length && !weaponBuilds.length}
                color="error"
                onClick={() => {
                  setGraphBuilds(undefined)
                  database.optConfigs.newOrSetGeneratedBuildList(optConfigId, {
                    builds: [],
                    weaponBuilds: [],
                    buildDate: 0,
                  })
                }}
              >
                {t('clearBuildsBtn')}
              </Button>
            </Box>
            <Grid
              container
              spacing={1}
              sx={{
                display: 'flex',
              }}
            >
              <Grid>
                <HitModeToggle size="small" />
              </Grid>
              <Grid>
                <ReactionToggle size="small" />
              </Grid>
              <Grid
                sx={{
                  flexGrow: 1,
                }}
              />
              <Grid>
                <CompareBtn />
              </Grid>
            </Grid>
          </CardContent>
        </CardThemed>
      )}

      {optimizationTarget && kqmsErEnabled && (
        <KqmsErResultsSummary
          teamKqms={teamKqms}
          highlightCharKey={characterKey}
        />
      )}

      {graphBuilds && (
        <BuildList
          builds={graphBuilds}
          compareData={compareData}
          disabled={!!generatingBuilds}
          getLabel={getGraphBuildLabel}
          setBuilds={setGraphBuilds}
          mainStatAssumptionLevel={mainStatAssumptionLevel}
        />
      )}
      <BuildList
        builds={builds}
        compareData={compareData}
        disabled={!!generatingBuilds}
        getLabel={getNormBuildLabel}
        mainStatAssumptionLevel={mainStatAssumptionLevel}
      />
      {weaponBuilds.length > 0 && (
        <>
          <WeaponBuildsPreviewCard
            weaponBuilds={weaponBuilds}
            optimizationTarget={optimizationTarget}
            compareData={compareData}
            mainStatAssumptionLevel={mainStatAssumptionLevel}
            currentWeaponId={currentWeaponId}
            onSelectWeaponIndex={handleSelectWeaponBuildIndex}
          />
          <CardThemed bgt="light">
            <CardContent
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {t('weaponFilter.perWeaponTitle', 'Best Build per Weapon')}
              </Typography>
              <SqBadge color="info">{weaponBuilds.length}</SqBadge>
            </CardContent>
          </CardThemed>
          <BuildList
            builds={weaponBuilds}
            compareData={compareData}
            disabled={!!generatingBuilds}
            getLabel={getWeaponBuildLabel}
            mainStatAssumptionLevel={mainStatAssumptionLevel}
            itemIdPrefix="weapon-build-anchor"
            highlightedIndex={highlightedWeaponIdx}
          />
        </>
      )}
    </Box>
  )
}

const LevelFilter = memo(function LevelFilter({
  levelTotal,
  levelLow,
  levelHigh,
  disabled,
  optConfigId,
}: {
  levelTotal: string
  levelLow: number
  levelHigh: number
  disabled: boolean
  optConfigId: string
}) {
  const database = useDatabase()
  const { t } = useTranslation('page_character_optimize')
  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', gap: 1 }}>
        <Typography sx={{ fontWeight: 'bold' }}>{t('levelFilter')}</Typography>
        <SqBadge color="info">{levelTotal}</SqBadge>
      </CardContent>
      <Divider />
      <ArtifactLevelSlider
        levelLow={levelLow}
        levelHigh={levelHigh}
        setLow={(levelLow) =>
          database.optConfigs.set(optConfigId, { levelLow })
        }
        setHigh={(levelHigh) =>
          database.optConfigs.set(optConfigId, { levelHigh })
        }
        setBoth={(levelLow, levelHigh) =>
          database.optConfigs.set(optConfigId, {
            levelLow,
            levelHigh,
          })
        }
        disabled={disabled}
      />
    </CardThemed>
  )
})

const BuildList = memo(function BuildList({
  builds,
  setBuilds,
  compareData,
  disabled,
  getLabel,
  mainStatAssumptionLevel,
  itemIdPrefix,
  highlightedIndex,
}: {
  builds: GeneratedBuild[]
  setBuilds?: (builds: GeneratedBuild[] | undefined) => void
  compareData?: UIData
  disabled: boolean
  getLabel: (index: number) => ReactNode
  mainStatAssumptionLevel: number
  itemIdPrefix?: string
  highlightedIndex?: number | null
}) {
  const deleteBuild = useCallback(
    (index: number) => {
      if (setBuilds) {
        const builds_ = [...builds]
        builds_.splice(index, 1)
        setBuilds(builds_)
      }
    },
    [builds, setBuilds]
  )
  // retrive this value because inner calcs depends on this
  const teamCharacterContextValue = useContext(TeamCharacterContext)
  const {
    teamChar: { key: characterKey },
  } = teamCharacterContextValue
  return (
    <Suspense
      fallback={<Skeleton variant="rectangular" width="100%" height={600} />}
    >
      {builds?.map((build, index) => (
        <Box
          key={`${index}-${build.weaponId ?? ''}-${Object.values(
            build.artifactIds
          ).join()}`}
          id={itemIdPrefix ? `${itemIdPrefix}-${index}` : undefined}
          sx={{
            scrollMarginTop: '16px',
            borderRadius: 1,
            transition: 'box-shadow 0.3s ease',
            ...(highlightedIndex === index
              ? {
                  boxShadow: (theme) => `0 0 0 2px ${theme.palette.info.main}`,
                }
              : {}),
          }}
        >
          <DataContextWrapper
            characterKey={characterKey}
            build={build}
            compareData={compareData}
            mainStatAssumptionLevel={mainStatAssumptionLevel}
          >
            <BuildItemWrapper
              index={index}
              label={getLabel(index)}
              build={build}
              disabled={disabled}
              deleteBuild={setBuilds ? deleteBuild : undefined}
              mainStatAssumptionLevel={mainStatAssumptionLevel}
            />
          </DataContextWrapper>
        </Box>
      ))}
    </Suspense>
  )
})
const BuildItemWrapper = memo(function BuildItemWrapper({
  index,
  label,
  build,
  disabled,
  deleteBuild,
  mainStatAssumptionLevel,
}: {
  index: number
  label: ReactNode
  build: GeneratedBuild
  disabled: boolean
  deleteBuild?: (index: number) => void
  mainStatAssumptionLevel: number
}) {
  const { t } = useTranslation('page_character_optimize')
  const extraButtonsLeft = useMemo(() => {
    return (
      <>
        <CopyTcButton build={build} />
        <CopyBuildButton build={build} />
        {deleteBuild && (
          <Button
            color="error"
            size="small"
            startIcon={<DeleteForever />}
            onClick={() => deleteBuild(index)}
          >
            {t('removeBuildButton')}
          </Button>
        )}
      </>
    )
  }, [build, deleteBuild, index, t])
  return (
    <BuildDisplayItem
      label={label}
      disabled={disabled}
      extraButtonsLeft={extraButtonsLeft}
      mainStatAssumptionLevel={mainStatAssumptionLevel}
    />
  )
})
function CopyTcButton({ build }: { build: GeneratedBuild }) {
  const { t } = useTranslation('build')
  const [name, setName] = useState('')
  const [showTcPrompt, onShowTcPrompt, OnHideTcPrompt] = useBoolState()

  const database = useDatabase()
  const {
    loadoutDatum,
    teamCharId,
    teamChar: { key: characterKey },
  } = useContext(TeamCharacterContext)

  const toTc = () => {
    const weapon =
      (build.weaponId && database.weapons.get(build.weaponId)) ||
      database.teams.getLoadoutWeapon(loadoutDatum)
    const buildTcId = database.buildTcs.newFromBuild(
      characterKey,
      weapon,
      Object.values(build.artifactIds).map((id) => database.arts.get(id)),
      teamCharId
    )
    if (buildTcId)
      database.buildTcs.set(buildTcId, {
        name,
      })

    setName('')
    OnHideTcPrompt()
  }
  return (
    <>
      <Button
        color="info"
        size="small"
        startIcon={<Science />}
        onClick={onShowTcPrompt}
      >
        {t('createBuildTc.button')}
      </Button>
      {/* TODO: Dialog Wanted to use a Dialog here, but was having some weird issues with closing out of it */}
      <ModalWrapper open={showTcPrompt} onClose={OnHideTcPrompt}>
        <CardThemed>
          <CardHeader
            title={t('createBuildTc.title')}
            action={
              <IconButton onClick={OnHideTcPrompt}>
                <CloseIcon />
              </IconButton>
            }
          />
          <Divider />
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <Typography>{t('createBuildTc.desc')}</Typography>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              margin="dense"
              label={t('createBuildTc.label')}
              fullWidth
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={OnHideTcPrompt}>
                {t('createBuildTc.cancel')}
              </Button>
              <Button color="success" disabled={!name} onClick={toTc}>
                {t('createBuildTc.create')}
              </Button>
            </Box>
          </CardContent>
        </CardThemed>
      </ModalWrapper>
    </>
  )
}
function CopyBuildButton({
  build: { artifactIds, weaponId },
}: {
  build: GeneratedBuild
}) {
  const { t } = useTranslation('build')
  const [name, setName] = useState('')
  const [showPrompt, onShowPrompt, OnHidePrompt] = useBoolState()

  const database = useDatabase()
  const {
    teamCharId,
    teamChar: { key: characterKey },
  } = useContext(TeamCharacterContext)

  const toLoadout: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    database.builds.new({
      characterKey,
      name,
      artifactIds,
      weaponId,
      srcTeamCharId: teamCharId,
    })

    setName('')
    OnHidePrompt()
  }
  return (
    <>
      <Button
        color="info"
        size="small"
        startIcon={<CheckroomIcon />}
        onClick={onShowPrompt}
      >
        {t('createBuildReal.button')}
      </Button>
      {/* TODO: Dialog Wanted to use a Dialog here, but was having some weird issues with closing out of it */}
      <ModalWrapper
        open={showPrompt}
        onClose={OnHidePrompt}
        disableRestoreFocus
      >
        <CardThemed>
          <CardHeader
            title={t('createBuildReal.title')}
            action={
              <IconButton onClick={OnHidePrompt}>
                <CloseIcon />
              </IconButton>
            }
          />
          <Divider />
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <Typography>{t('createBuildReal.desc')}</Typography>
            <form onSubmit={toLoadout}>
              <TextField
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                margin="dense"
                label={t('createBuildReal.label')}
                fullWidth
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={OnHidePrompt}>
                  {t('createBuildReal.cancel')}
                </Button>
                <Button type="submit" color="success" disabled={!name}>
                  {t('createBuildReal.create')}
                </Button>
              </Box>
            </form>
          </CardContent>
        </CardThemed>
      </ModalWrapper>
    </>
  )
}

type Prop = {
  children: React.ReactNode
  characterKey: CharacterKey
  build: GeneratedBuild
  compareData?: UIData
  mainStatAssumptionLevel: number
}
const DataContextWrapper = memo(function DataContextWrapper({
  children,
  characterKey,
  build,
  compareData,
  mainStatAssumptionLevel,
}: Prop) {
  const { artifactIds, weaponId } = build

  const artifacts = useArtifacts(artifactIds)
  const buildsArts = useMemo(
    () => Object.values(artifacts).filter(notEmpty),
    [artifacts]
  )
  const buildWeapon = useWeapon(weaponId)
  const teamData = useTeamData(mainStatAssumptionLevel, buildsArts, buildWeapon)
  const providerValue = useMemo(() => {
    const tdc = teamData?.[characterKey]
    if (!tdc) return undefined
    return { data: tdc.target, teamData, compareData }
  }, [teamData, compareData, characterKey])
  if (!providerValue) return null
  return (
    <DataContext.Provider value={providerValue}>
      {children}
    </DataContext.Provider>
  )
})
