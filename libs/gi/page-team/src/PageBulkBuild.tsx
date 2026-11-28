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
  OptConfig,
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
import {
  createSolverWorkers,
  GOSolver,
  mergeBuilds,
  terminateSolverWorkers,
} from '@genshin-optimizer/gi/solver'
import { compactArtifacts } from '@genshin-optimizer/gi/solver-tc'
import {
  ArtifactCardNano,
  CharacterBulkSelectionModal,
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
  Filter4,
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
  Pagination,
  Select,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import ArtifactSetConfig from './CharacterDisplay/Tabs/TabOptimize/Components/ArtifactSetConfig'
import { KqmsErCard } from './CharacterDisplay/Tabs/TabOptimize/Components/KqmsErCard'
import { buildMaxArtifactConditionals } from './CharacterDisplay/Tabs/TabOptimize/Components/maxArtifactCondsUtil'
import {
  buildMaxWeaponConditionals,
  getUniqueBestWeaponsAndExclusion,
} from './CharacterDisplay/Tabs/TabOptimize/Components/maxWeaponCondsUtil'
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
import { enableAllTeamTalentPassivesMax } from './TeamSetting/maxTalentCondsUtil'

type ValueUnit = Parameters<typeof valueString>[1]
type DatabaseInstance = ReturnType<typeof useDatabase>
type GenderType = ReturnType<typeof useDBMeta>['gender']

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
  currentQueueId?: string
  currentIndex: number
  totalCount: number
  currentCharKey?: CharacterKey
  weaponIndex: number
  weaponTotal: number
  tested: number
  skipped: number
  total: number
}

const INITIAL_PROGRESS_STATE: BulkProgressState = {
  running: false,
  currentQueueId: undefined,
  currentIndex: 0,
  totalCount: 0,
  currentCharKey: undefined,
  weaponIndex: 0,
  weaponTotal: 0,
  tested: 0,
  skipped: 0,
  total: 0,
}

function createBulkProgressStore() {
  let state: BulkProgressState = INITIAL_PROGRESS_STATE
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (patch: Partial<BulkProgressState>) => {
      state = { ...state, ...patch }
      for (const listener of listeners) listener()
    },
    reset: () => {
      state = INITIAL_PROGRESS_STATE
      for (const listener of listeners) listener()
    },
  }
}

type BulkProgressStore = ReturnType<typeof createBulkProgressStore>

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const

function makeQueueId() {
  return `bq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function yieldToEventLoop(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Synchronous helper that builds `OptProblemInput` for a single weapon and
 * immediately releases `teamData`, `workerData`, and intermediate AST nodes
 * before the Web Worker solver starts.
 */
function buildSingleWeaponProblem({
  database,
  gender,
  teamId,
  teamCharId,
  characterKey,
  activeCharKey,
  optConfig,
  weapon,
  split,
  initialThreshold,
}: {
  database: DatabaseInstance
  gender: GenderType
  teamId: string
  teamCharId: string
  characterKey: CharacterKey
  activeCharKey: CharacterKey
  optConfig: OptConfig
  weapon: ICachedWeapon
  split: ReturnType<typeof compactArtifacts>
  initialThreshold: number
}):
  | {
      problem: OptProblemInput
      targetUnit: ValueUnit
      targetFixed?: number
    }
  | undefined {
  const {
    mainStatAssumptionLevel,
    artSetExclusion,
    statFilters,
    optimizationTarget,
    kqmsErEnabled,
    kqmsRotationDuration,
    kqmsEnemyScenario,
  } = optConfig
  if (!optimizationTarget?.length) return undefined

  const team = database.teams.get(teamId)
  if (!team) return undefined

  const teamData = getTeamData(
    database,
    teamId,
    teamCharId,
    mainStatAssumptionLevel,
    [],
    weapon
  )
  if (!teamData) return undefined

  const workerData = uiDataForTeam(teamData.teamData, gender, activeCharKey)[
    characterKey
  ]?.target.data[0]
  if (!workerData) return undefined
  Object.assign(workerData, mergeData([workerData, dynamicData]))

  const unoptimizedTargetNode = objPathValue(
    workerData.display ?? {},
    optimizationTarget
  ) as NumNode | undefined
  if (!unoptimizedTargetNode) return undefined

  let targetUnit: ValueUnit = ''
  let targetFixed: number | undefined
  const resolved =
    unoptimizedTargetNode.info && resolveInfo(unoptimizedTargetNode.info)
  if (resolved) {
    targetUnit = (resolved.unit as ValueUnit) ?? ''
    targetFixed = resolved.fixed
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
          ld.teamCharId === teamCharId
            ? weapon
            : database.teams.getLoadoutWeapon(ld)
        const arts = database.teams.getLoadoutArtifacts(ld)
        const artifactSetCounts: Record<string, number> = {}
        for (const a of Object.values(arts)) {
          if (a?.setKey) {
            artifactSetCounts[a.setKey] = (artifactSetCounts[a.setKey] ?? 0) + 1
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

  const valueFilter = statFilterToNumNode(workerData, effectiveStatFilters)
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
    initialThreshold,
  }

  return {
    problem,
    targetUnit,
    targetFixed,
  }
}

/**
 * Executes a single character's optimization pass in an isolated scope so
 * `candidateArts`, `split`, and per-weapon solver structures are eligible for
 * garbage collection immediately before the next character starts.
 */
async function executeSingleCharacterQueueItem({
  item,
  rank,
  database,
  gender,
  maxWorkers,
  sharedWorkers,
  claimedArtifactIds,
  claimedWeaponIds,
  progressStore,
  getIsCancelled,
  cancellationError,
  setActiveSolver,
  t,
}: {
  item: BulkQueueItem
  rank: number
  database: DatabaseInstance
  gender: GenderType
  maxWorkers: number
  sharedWorkers: Worker[]
  claimedArtifactIds: Set<string>
  claimedWeaponIds: Set<string>
  progressStore: BulkProgressStore
  getIsCancelled: () => boolean
  cancellationError: Error
  setActiveSolver: (solver: GOSolver | undefined) => void
  t: ReturnType<typeof useTranslation>['t']
}): Promise<BulkBuildResultItem | undefined> {
  const team = database.teams.get(item.teamId)
  const teamChar = database.teamChars.get(item.teamCharId)
  if (!team || !teamChar) return undefined

  const characterKey = teamChar.key
  const optConfig = database.optConfigs.get(teamChar.optConfigId)

  if (!optConfig?.optimizationTarget?.length) {
    return {
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
    }
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
  const allWeapons = database.weapons.values

  // Filter candidate weapons: NEVER allow weapons claimed by higher-priority (#1..#i) characters!
  let candidateWeapons: ICachedWeapon[]
  if (optConfig.optWeapon) {
    const pool = getFilteredWeapons({
      allWeapons,
      characterKey,
      optConfig: {
        ...optConfig,
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
  } else if (currentWeapon && !claimedWeaponIds.has(currentWeapon.id)) {
    candidateWeapons = [currentWeapon]
  } else {
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

  if (!candidateWeapons.length) {
    return {
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
    }
  }

  const {
    mainStatKeys,
    artExclusion,
    levelLow,
    levelHigh,
    useExcludedArts,
    mainStatAssumptionLevel,
    allowPartial,
  } = optConfig
  const exclusionSet = useExcludedArts ? undefined : new Set(artExclusion)

  const candidateArts = database.arts.values.filter((art) => {
    if (claimedArtifactIds.has(art.id)) return false
    if (exclusionSet?.has(art.id)) return false
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
  let lastWeaponYield = performance.now()

  for (let wIdx = 0; wIdx < candidateWeapons.length; wIdx++) {
    if (getIsCancelled()) throw cancellationError
    const weapon = candidateWeapons[wIdx]

    progressStore.set({
      weaponIndex: wIdx + 1,
      weaponTotal: candidateWeapons.length,
      tested: 0,
      skipped: 0,
      total: 0,
    })

    const built = buildSingleWeaponProblem({
      database,
      gender,
      teamId: item.teamId,
      teamCharId: item.teamCharId,
      characterKey,
      activeCharKey,
      optConfig,
      weapon,
      split,
      initialThreshold: bestOverall?.value ?? Number.NEGATIVE_INFINITY,
    })
    if (!built) continue

    targetInfoUnit = built.targetUnit
    targetInfoFixed = built.targetFixed

    const solverStatus = {
      tested: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testedPerSecond: 0,
      skippedPerSecond: 0,
    }
    const timer = setInterval(() => {
      progressStore.set({
        tested: solverStatus.tested,
        skipped: solverStatus.skipped,
        total: solverStatus.total,
      })
    }, 200)

    try {
      const solver = new GOSolver(
        built.problem,
        solverStatus,
        maxWorkers,
        sharedWorkers
      )
      // Allow the preprocessed problem graph on the main thread to be GC'd while workers run
      ;(built as { problem?: OptProblemInput }).problem = undefined
      setActiveSolver(solver)
      if (getIsCancelled()) {
        solver.cancel(cancellationError)
        throw cancellationError
      }

      const solverRes = await solver.solve()
      setActiveSolver(undefined)

      const topWeaponBuilds = mergeBuilds(
        solverRes.map((r) => r.builds),
        1
      )
      if (
        topWeaponBuilds.length > 0 &&
        (!bestOverall || topWeaponBuilds[0].value > bestOverall.value)
      ) {
        bestOverall = {
          value: topWeaponBuilds[0].value,
          artifactIds: [...topWeaponBuilds[0].artifactIds],
          weaponId: weapon.id,
        }
      }
    } finally {
      clearInterval(timer)
      setActiveSolver(undefined)
    }

    // Frame-paced yield keeps UI at 60 FPS and lets V8 GC reclaim temporary ASTs without 4ms timer stalls on fast-pruned weapons
    if (performance.now() - lastWeaponYield >= 16) {
      await yieldToEventLoop(0)
      lastWeaponYield = performance.now()
    }
  }

  if (!bestOverall) {
    return {
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
    }
  }

  const mappedArtifactIds = objKeyMap(allArtifactSlotKeys, (slotKey) =>
    bestOverall.artifactIds.find(
      (aId) => database.arts.get(aId)?.slotKey === slotKey
    )
  )

  // Lock winning weapon & artifacts so #rank+1 and below CANNOT use them!
  if (bestOverall.weaponId) claimedWeaponIds.add(bestOverall.weaponId)
  for (const aId of Object.values(mappedArtifactIds)) {
    if (aId) claimedArtifactIds.add(aId)
  }

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
      for (const s of allArtifactSlotKeys) {
        const aid = mappedArtifactIds[s]
        if (aid) {
          database.arts.set(aid, { location: locKey })
        } else if (charObj?.equippedArtifacts[s]) {
          database.arts.set(charObj.equippedArtifacts[s], {
            location: '',
          })
        }
      }
      if (bestOverall.weaponId) {
        database.weapons.set(bestOverall.weaponId, { location: locKey })
      }
    }
  }

  return {
    queueId: item.id,
    rank,
    characterKey,
    teamName: team.name,
    weaponId: bestOverall.weaponId,
    artifactIds: mappedArtifactIds,
    targetValue: bestOverall.value,
    targetUnit: targetInfoUnit,
    targetFixed: targetInfoFixed,
    status: 'success',
  }
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
  const [showMultiAddModal, onOpenMultiAdd, onCloseMultiAdd] =
    useBoolState(false)
  const [maxWorkers, nativeThreads, setMaxWorkers] = useNumWorkers()

  const [progressStore] = useState(createBulkProgressStore)
  const [isRunning, setIsRunning] = useState(false)
  const [resultsByQueueId, setResultsByQueueId] = useState<
    Record<string, BulkBuildResultItem>
  >({})
  const cancelRef = useRef<() => void>(() => {})

  // Pagination bounds mounted UIData ASTs to at most `rowsPerPage` rows in editor mode
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState<number>(10)

  const totalPages = Math.max(1, Math.ceil(queue.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageStartIndex = (safePage - 1) * rowsPerPage
  const visibleQueueSlice = useMemo(
    () => queue.slice(pageStartIndex, pageStartIndex + rowsPerPage),
    [queue, pageStartIndex, rowsPerPage]
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => () => cancelRef.current(), [])

  const queuedCharKeys = useMemo(
    () =>
      queue
        .map((q) => database.teamChars.get(q.teamCharId)?.key)
        .filter(notEmpty),
    [queue, database]
  )

  const queuedLoadoutData = useMemo(
    () =>
      queue.map(
        (q) =>
          ({
            teamCharId: q.teamCharId,
            buildType: 'equipped',
          }) as LoadoutDatum
      ),
    [queue]
  )

  const resolveOrCreateQueueItem = useCallback(
    (charKey: CharacterKey): BulkQueueItem => {
      database.chars.getWithInitWeapon(charKey)

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

      const tc = database.teamChars.get(foundTeamCharId)
      return {
        id: makeQueueId(),
        teamId: foundTeamId,
        teamCharId: foundTeamCharId,
        enabled: true,
        optWeapon: Boolean(
          tc && database.optConfigs.get(tc.optConfigId)?.optWeapon
        ),
        autoEquip: true,
      }
    },
    [database]
  )

  const handleAddCharacter = useCallback(
    (charKey: CharacterKey) => {
      onCloseAddChar()
      if (queuedCharKeys.includes(charKey)) return
      const newItem = resolveOrCreateQueueItem(charKey)
      const next = [...queue, newItem]
      setQueue(next)
      setPage(Math.max(1, Math.ceil(next.length / rowsPerPage)))
    },
    [
      onCloseAddChar,
      queuedCharKeys,
      resolveOrCreateQueueItem,
      queue,
      setQueue,
      rowsPerPage,
    ]
  )

  const handleBulkSelectCharacters = useCallback(
    (selectedKeys: CharacterKey[]) => {
      const existingByCharKey = new Map<CharacterKey, BulkQueueItem>()
      for (const item of queue) {
        const ck = database.teamChars.get(item.teamCharId)?.key
        if (ck && !existingByCharKey.has(ck)) {
          existingByCharKey.set(ck, item)
        }
      }

      const nextQueue: BulkQueueItem[] = []
      const seen = new Set<CharacterKey>()
      for (const ck of selectedKeys) {
        if (seen.has(ck)) continue
        seen.add(ck)
        const existing = existingByCharKey.get(ck)
        if (existing) {
          nextQueue.push(existing)
        } else {
          nextQueue.push(resolveOrCreateQueueItem(ck))
        }
      }

      setQueue(nextQueue)
    },
    [queue, database, resolveOrCreateQueueItem, setQueue]
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

  const handleEnableMaxWeaponsQueue = useCallback(() => {
    const allWeaponsList = database.weapons.values
    for (const item of queue) {
      const team = database.teams.get(item.teamId)
      const tc = database.teamChars.get(item.teamCharId)
      if (!tc) continue
      const existingOptConfig = database.optConfigs.get(tc.optConfigId)
      const ld =
        team?.loadoutData.find((l) => l?.teamCharId === item.teamCharId) ??
        ({
          teamCharId: item.teamCharId,
          buildType: 'equipped',
        } as LoadoutDatum)
      const curWeaponId = database.teams.getLoadoutWeapon(ld)?.id

      const { weaponExclusion: nextExclusion, keptWeaponKeys } =
        getUniqueBestWeaponsAndExclusion({
          allWeapons: allWeaponsList,
          characterKey: tc.key,
          currentWeaponId: curWeaponId,
          existingWeaponExclusion: existingOptConfig?.weaponExclusion,
        })

      const fakeData = new UIData({ charKey: constant(tc.key) }, undefined)
      const nextConditional = buildMaxWeaponConditionals(
        tc.conditional,
        tc.key,
        fakeData,
        keptWeaponKeys
      )

      database.teamChars.set(item.teamCharId, (teamChar) => {
        teamChar.conditional = nextConditional
      })
      database.optConfigs.set(tc.optConfigId, {
        optWeapon: true,
        useEquippedWeapon: true,
        useTeammateWeapon: true,
        weaponLevelLow: 1,
        weaponLevelHigh: 90,
        weaponExclusion: nextExclusion,
      })
    }
    if (queue.length) {
      setQueue(queue.map((item) => ({ ...item, optWeapon: true })))
    }
  }, [database, queue, setQueue])

  const handleEnableMaxTalentsQueue = useCallback(() => {
    const enabledItems = queue.filter((q) => q.enabled)
    const targetItems = enabledItems.length ? enabledItems : queue
    const uniqueTeamIds = Array.from(new Set(targetItems.map((q) => q.teamId)))
    for (const tId of uniqueTeamIds) {
      enableAllTeamTalentPassivesMax(database, tId, gender)
    }
  }, [queue, database, gender])

  const queueRef = useRef(queue)
  queueRef.current = queue

  const handleMoveItem = useCallback(
    (id: string, delta: -1 | 1) => {
      const cur = queueRef.current
      const index = cur.findIndex((q) => q.id === id)
      if (index < 0) return
      const targetIndex = index + delta
      if (targetIndex < 0 || targetIndex >= cur.length) return
      const copy = [...cur]
      const [moved] = copy.splice(index, 1)
      copy.splice(targetIndex, 0, moved)
      setQueue(copy)
    },
    [setQueue]
  )

  const handleUpdateItem = useCallback(
    (id: string, patch: Partial<BulkQueueItem>) => {
      const cur = queueRef.current
      setQueue(
        cur.map((item) => (item.id === id ? { ...item, ...patch } : item))
      )
    },
    [setQueue]
  )

  const handleRemoveItem = useCallback(
    (id: string) => {
      const cur = queueRef.current
      setQueue(cur.filter((item) => item.id !== id))
    },
    [setQueue]
  )

  const computeReadyCount = useCallback(() => {
    let count = 0
    for (const item of queue) {
      if (!item.enabled) continue
      const tc = database.teamChars.get(item.teamCharId)
      if (!tc) continue
      if (database.optConfigs.get(tc.optConfigId)?.optimizationTarget?.length) {
        count++
      }
    }
    return count
  }, [queue, database])

  const [readyCount, setReadyCount] = useState(computeReadyCount)
  useEffect(() => {
    setReadyCount(computeReadyCount())
    if (isRunning) return
    return database.optConfigs.followAny(() => {
      setReadyCount((prev) => {
        const next = computeReadyCount()
        return prev === next ? prev : next
      })
    })
  }, [computeReadyCount, database, isRunning])

  const runBulkBuild = useCallback(async () => {
    const snapshotQueue = [...queueRef.current]
    const activeQueue = snapshotQueue.filter((q) => q.enabled)
    if (!activeQueue.length) return

    let isCancelled = false
    const cancellationError = new Error('BulkCancelled')
    let activeSolver: GOSolver | undefined
    let sharedWorkers: Worker[] = []

    cancelRef.current = () => {
      isCancelled = true
      activeSolver?.cancel(cancellationError)
      terminateSolverWorkers(sharedWorkers)
    }

    setResultsByQueueId({})
    setPage(1)
    setIsRunning(true)
    progressStore.set({
      running: true,
      currentQueueId: undefined,
      currentIndex: 0,
      totalCount: activeQueue.length,
      currentCharKey: undefined,
      weaponIndex: 0,
      weaponTotal: 0,
      tested: 0,
      skipped: 0,
      total: 0,
    })

    // Wait one frame + micro-pause so React unmounts heavy editor UIData ASTs and V8 GC reclaims them before spawning workers
    await yieldToEventLoop(80)

    const claimedArtifactIds = new Set<string>()
    const claimedWeaponIds = new Set<string>()

    try {
      if (isCancelled) throw cancellationError
      // Reuse a SINGLE worker pool across every weapon and every character in the queue!
      sharedWorkers = createSolverWorkers(maxWorkers)

      let enabledCounter = 0
      for (let i = 0; i < snapshotQueue.length; i++) {
        if (isCancelled) throw cancellationError
        const item = snapshotQueue[i]
        const rank = i + 1
        const team = database.teams.get(item.teamId)
        const teamChar = database.teamChars.get(item.teamCharId)
        if (!team || !teamChar) continue

        if (!item.enabled) {
          // Lock equipped gear of higher-priority disabled characters
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

        enabledCounter++
        const targetPage = Math.floor(i / rowsPerPage) + 1
        setPage((prev) => (prev === targetPage ? prev : targetPage))

        progressStore.set({
          currentQueueId: item.id,
          currentIndex: enabledCounter,
          currentCharKey: teamChar.key,
          weaponIndex: 0,
          weaponTotal: 0,
          tested: 0,
          skipped: 0,
          total: 0,
        })

        const charResult = await executeSingleCharacterQueueItem({
          item,
          rank,
          database,
          gender,
          maxWorkers,
          sharedWorkers,
          claimedArtifactIds,
          claimedWeaponIds,
          progressStore,
          getIsCancelled: () => isCancelled,
          cancellationError,
          setActiveSolver: (s) => {
            activeSolver = s
          },
          t,
        })

        if (charResult) {
          setResultsByQueueId((prev) => ({
            ...prev,
            [item.id]: charResult,
          }))
        }

        // Yield between characters so UI paints and V8 GC frees the finished character's buffers
        await yieldToEventLoop(16)
      }
    } catch (e) {
      if (e !== cancellationError) {
        console.error(e)
        if (e instanceof Error) throwGlobalError(e)
      }
    } finally {
      terminateSolverWorkers(sharedWorkers)
      activeSolver = undefined
      cancelRef.current = () => {}
      progressStore.set({
        running: false,
        currentQueueId: undefined,
      })
      setIsRunning(false)
    }
  }, [
    database,
    gender,
    maxWorkers,
    progressStore,
    rowsPerPage,
    t,
    throwGlobalError,
  ])

  const paginationBar = queue.length > rowsPerPage && (
    <CardThemed>
      <CardContent
        sx={{
          py: 1,
          '&:last-child': { pb: 1 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('bulkBuild.showingRange', {
            start: pageStartIndex + 1,
            end: Math.min(pageStartIndex + rowsPerPage, queue.length),
            total: queue.length,
            defaultValue: `Exibindo #${pageStartIndex + 1}–#${Math.min(
              pageStartIndex + rowsPerPage,
              queue.length
            )} de ${queue.length} personagens`,
          })}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FormControl size="small">
            <Select
              value={rowsPerPage}
              disabled={isRunning}
              onChange={(e) => {
                const nextSize = Number(e.target.value)
                setRowsPerPage(nextSize)
                setPage(1)
              }}
              sx={{ fontSize: '0.8rem' }}
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt} / {t('bulkBuild.perPage', 'página')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Pagination
            count={totalPages}
            page={safePage}
            onChange={(_, nextPage) => setPage(nextPage)}
            color="primary"
            size="small"
            showFirstButton
            showLastButton
          />
        </Box>
      </CardContent>
    </CardThemed>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, my: 1 }}>
      {!isRunning && (
        <>
          <Suspense fallback={false}>
            <CharacterSingleSelectionModal
              show={showAddCharModal}
              onHide={onCloseAddChar}
              onSelect={handleAddCharacter}
              loadoutData={queuedLoadoutData}
              hideSelectedByDefault
              showSelectedAtTopLabel={t(
                'bulkBuild.showSelectedAtTop',
                'Exibir Já Escolhidos no Topo'
              )}
            />
          </Suspense>
          <Suspense fallback={false}>
            <CharacterBulkSelectionModal
              show={showMultiAddModal}
              onHide={onCloseMultiAdd}
              onSelect={handleBulkSelectCharacters}
              selectedCharacterKeys={queuedCharKeys}
              showSelectedAtTopLabel={t(
                'bulkBuild.showSelectedAtTop',
                'Exibir Já Escolhidos no Topo'
              )}
              confirmLabel={t('bulkBuild.confirmSelectionBtn', 'Concluir')}
            />
          </Suspense>
        </>
      )}

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
                disabled={isRunning}
                onClick={onOpenAddChar}
              >
                {t('bulkBuild.addCharBtn', 'Adicionar Personagem')}
              </Button>
              <Button
                color="primary"
                startIcon={<Filter4 />}
                disabled={isRunning}
                onClick={onOpenMultiAdd}
              >
                {t(
                  'bulkBuild.quickMultiAddBtn',
                  'Ajustes Rápidos (Adicionar Múltiplos)'
                )}
              </Button>
              <Button
                color="info"
                startIcon={<GroupAdd />}
                disabled={isRunning}
                onClick={handleImportAllTeams}
              >
                {t('bulkBuild.importTeamsBtn', 'Importar das Equipes')}
              </Button>
              <Button
                color="success"
                startIcon={<AutoAwesome />}
                disabled={isRunning || !queue.length}
                onClick={handleEnableMaxAllQueue}
              >
                {t(
                  'bulkBuild.maxAllSetsBtn',
                  'Ativar Todos os Artefatos e Efeitos no Máximo (Fila Toda)'
                )}
              </Button>
              <Button
                color="success"
                startIcon={<AutoAwesome />}
                disabled={isRunning || !queue.length}
                onClick={handleEnableMaxWeaponsQueue}
              >
                {t(
                  'bulkBuild.maxAllWeaponsBtn',
                  'Ativar Todas as Armas e Efeitos no Máximo - Sem Repetir (Fila Toda)'
                )}
              </Button>
              <Button
                color="success"
                startIcon={<AutoAwesome />}
                disabled={isRunning || !queue.length}
                onClick={handleEnableMaxTalentsQueue}
              >
                {t(
                  'bulkBuild.maxAllTalentsBtn',
                  'Ativar Todas as Passivas e Efeitos de Talentos no Máximo (Fila Toda)'
                )}
              </Button>
              <Button
                color="error"
                startIcon={<DeleteForever />}
                disabled={isRunning || !queue.length}
                onClick={() => {
                  setQueue([])
                  setResultsByQueueId({})
                }}
              >
                {t('bulkBuild.clearQueueBtn', 'Limpar Fila')}
              </Button>

              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <DropdownButton
                  disabled={isRunning}
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
                  color={isRunning ? 'error' : 'success'}
                  variant="contained"
                  disabled={!isRunning && readyCount === 0}
                  startIcon={isRunning ? <Close /> : <PlayArrow />}
                  onClick={isRunning ? () => cancelRef.current() : runBulkBuild}
                >
                  {isRunning
                    ? t('generateButton.cancel', 'Cancelar')
                    : `${t('bulkBuild.runBtn', 'Gerar Bulk Builds')} (${readyCount})`}
                </Button>
              </Box>
            </Box>

            <BulkTopProgressBanner
              progressStore={progressStore}
              gender={gender}
            />
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
        <>
          {paginationBar}
          <Stack spacing={1.5}>
            {visibleQueueSlice.map((item, localIdx) => {
              const globalIdx = pageStartIndex + localIdx
              const rank = globalIdx + 1
              const result = resultsByQueueId[item.id]
              if (isRunning) {
                return (
                  <BulkRunningRow
                    key={item.id}
                    item={item}
                    rank={rank}
                    progressStore={progressStore}
                    result={result}
                  />
                )
              }
              return (
                <BulkQueueRow
                  key={item.id}
                  item={item}
                  rank={rank}
                  isFirst={globalIdx === 0}
                  isLast={globalIdx === queue.length - 1}
                  result={result}
                  onMoveItem={handleMoveItem}
                  onUpdateItem={handleUpdateItem}
                  onRemoveItem={handleRemoveItem}
                />
              )
            })}
          </Stack>
          {paginationBar}
        </>
      )}
    </Box>
  )
}

const BulkTopProgressBanner = memo(function BulkTopProgressBanner({
  progressStore,
  gender,
}: {
  progressStore: BulkProgressStore
  gender: GenderType
}) {
  const { t } = useTranslation('page_character_optimize')
  const progress = useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getSnapshot
  )

  if (!progress.running) return null

  const pct =
    Number.isFinite(progress.total) && progress.total > 0
      ? Math.min(
          100,
          ((progress.tested + progress.skipped) / progress.total) * 100
        )
      : undefined

  return (
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {progress.weaponTotal > 0 && (
              <Typography
                variant="caption"
                sx={{ fontWeight: 'bold' }}
                color="info.main"
              >
                ({progress.weaponIndex}/{progress.weaponTotal})
              </Typography>
            )}
            {pct !== undefined && (
              <Typography variant="caption" color="text.secondary">
                {pct.toFixed(1)}%
              </Typography>
            )}
          </Box>
        </Box>
        <LinearProgress
          variant={pct !== undefined ? 'determinate' : 'indeterminate'}
          value={pct ?? 0}
        />
      </CardContent>
    </CardThemed>
  )
})

const BulkActiveRowProgress = memo(function BulkActiveRowProgress({
  progressStore,
  queueId,
}: {
  progressStore: BulkProgressStore
  queueId: string
}) {
  const { t } = useTranslation('page_character_optimize')
  const getRowProgress = useCallback(() => {
    const snap = progressStore.getSnapshot()
    if (!snap.running || snap.currentQueueId !== queueId) return undefined
    return snap
  }, [progressStore, queueId])

  const activeProgress = useSyncExternalStore(
    progressStore.subscribe,
    getRowProgress
  )

  if (!activeProgress) return null

  const pct =
    Number.isFinite(activeProgress.total) && activeProgress.total > 0
      ? Math.min(
          100,
          ((activeProgress.tested + activeProgress.skipped) /
            activeProgress.total) *
            100
        )
      : undefined

  return (
    <>
      <Divider />
      <Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 0.5,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t('bulkBuild.charProgressLabel', 'Processando builds...')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeProgress.weaponTotal > 0 && (
              <Typography
                variant="caption"
                sx={{ fontWeight: 'bold' }}
                color="info.main"
              >
                ({activeProgress.weaponIndex}/{activeProgress.weaponTotal})
              </Typography>
            )}
            {pct !== undefined && (
              <Typography variant="caption" color="text.secondary">
                {pct.toFixed(1)}%
              </Typography>
            )}
          </Box>
        </Box>
        <LinearProgress
          variant={pct !== undefined ? 'determinate' : 'indeterminate'}
          value={pct ?? 0}
        />
      </Box>
    </>
  )
})

const BulkResultPreviewSection = memo(function BulkResultPreviewSection({
  result,
}: {
  result?: BulkBuildResultItem
}) {
  const { t } = useTranslation('page_character_optimize')
  if (!result) return null

  return (
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
              #{result.rank} {t('bulkBuild.resultReady', 'Build Encontrada')}
            </SqBadge>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {t('bulkBuild.resultScore', 'Resultado do Objetivo:')}{' '}
              {valueString(
                result.targetValue,
                result.targetUnit,
                result.targetFixed
              )}
            </Typography>
          </Box>
          <Grid container spacing={1} columns={{ xs: 2, sm: 3, md: 6 }}>
            <Grid size={1}>
              <CardThemed bgt="light" sx={{ height: '100%' }}>
                <WeaponCardNano weaponId={result.weaponId} showLocation />
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
          severity={result.status === 'skipped' ? 'warning' : 'error'}
          sx={{ py: 0.25 }}
        >
          {result.reason}
        </Alert>
      )}
    </>
  )
})

/**
 * Ultra-lightweight queue card used while `isRunning === true`.
 * Zero `useTeamDataNoContext` ASTs, zero `FormulaDataWrapper` modals, and zero
 * inventory listeners — keeps main-thread memory near 0 MB during optimization.
 */
const BulkRunningRow = memo(function BulkRunningRow({
  item,
  rank,
  progressStore,
  result,
}: {
  item: BulkQueueItem
  rank: number
  progressStore: BulkProgressStore
  result?: BulkBuildResultItem
}) {
  const { t } = useTranslation('page_character_optimize')
  const database = useDatabase()
  const { gender } = useDBMeta()
  const team = database.teams.get(item.teamId)
  const teamChar = database.teamChars.get(item.teamCharId)

  const checkIsActive = useCallback(() => {
    const snap = progressStore.getSnapshot()
    return snap.running && snap.currentQueueId === item.id
  }, [progressStore, item.id])

  const isActive = useSyncExternalStore(progressStore.subscribe, checkIsActive)

  if (!team || !teamChar) return null

  return (
    <CardThemed
      sx={{
        opacity: item.enabled ? 1 : 0.6,
        borderLeft: '4px solid',
        borderLeftColor: !item.enabled
          ? 'secondary.main'
          : isActive
            ? 'info.main'
            : result?.status === 'success'
              ? 'success.main'
              : 'warning.main',
      }}
    >
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <SqBadge color="primary" sx={{ fontSize: '1rem', px: 1.2, py: 0.4 }}>
            #{rank}
          </SqBadge>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CharIconSide characterKey={teamChar.key} />
            <Typography sx={{ fontWeight: 'bold', ml: 0.5 }}>
              <CharacterName characterKey={teamChar.key} gender={gender} />
            </Typography>
          </Box>
          <SqBadge color="secondary">{team.name}</SqBadge>
          <Box sx={{ ml: 'auto' }}>
            {!item.enabled ? (
              <SqBadge color="secondary">
                {t('bulkBuild.statusDisabled', 'Desativado')}
              </SqBadge>
            ) : isActive ? (
              <SqBadge color="info">
                {t('bulkBuild.statusRunning', 'Otimizando agora...')}
              </SqBadge>
            ) : result ? (
              <SqBadge
                color={result.status === 'success' ? 'success' : 'warning'}
              >
                {result.status === 'success'
                  ? t('bulkBuild.statusDone', 'Concluído')
                  : t('bulkBuild.statusSkipped', 'Sem Build')}
              </SqBadge>
            ) : (
              <SqBadge color="secondary">
                {t('bulkBuild.statusQueued', 'Aguardando na fila')}
              </SqBadge>
            )}
          </Box>
        </Box>

        <BulkActiveRowProgress
          progressStore={progressStore}
          queueId={item.id}
        />
        <BulkResultPreviewSection result={result} />
      </CardContent>
    </CardThemed>
  )
})

const BulkQueueRow = memo(function BulkQueueRow({
  item,
  rank,
  isFirst,
  isLast,
  result,
  onMoveItem,
  onUpdateItem,
  onRemoveItem,
}: {
  item: BulkQueueItem
  rank: number
  isFirst: boolean
  isLast: boolean
  result?: BulkBuildResultItem
  onMoveItem: (id: string, delta: -1 | 1) => void
  onUpdateItem: (id: string, patch: Partial<BulkQueueItem>) => void
  onRemoveItem: (id: string) => void
}) {
  const team = useTeam(item.teamId)
  const teamChar = useTeamChar(item.teamCharId)

  const handleMoveUp = useCallback(
    () => onMoveItem(item.id, -1),
    [onMoveItem, item.id]
  )
  const handleMoveDown = useCallback(
    () => onMoveItem(item.id, 1),
    [onMoveItem, item.id]
  )
  const handleUpdate = useCallback(
    (patch: Partial<BulkQueueItem>) => onUpdateItem(item.id, patch),
    [onUpdateItem, item.id]
  )
  const handleRemove = useCallback(
    () => onRemoveItem(item.id),
    [onRemoveItem, item.id]
  )

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
        result={result}
        teamId={item.teamId}
        teamCharId={item.teamCharId}
        characterKey={teamChar.key}
        optConfigId={teamChar.optConfigId}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
      />
    </Suspense>
  )
})

function BulkQueueRowInner({
  item,
  rank,
  isFirst,
  isLast,
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
  result?: BulkBuildResultItem
  teamId: string
  teamCharId: string
  characterKey: CharacterKey
  optConfigId: string
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (patch: Partial<BulkQueueItem>) => void
  onRemove: () => void
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

  const handleMaxWeaponsSingle = useCallback(() => {
    const curWeaponId = database.teams.getLoadoutWeapon(loadoutDatum)?.id
    const { weaponExclusion: nextExclusion, keptWeaponKeys } =
      getUniqueBestWeaponsAndExclusion({
        allWeapons: database.weapons.values,
        characterKey,
        currentWeaponId: curWeaponId,
        existingWeaponExclusion: optConfig.weaponExclusion,
      })
    const baseData = charUIData?.data[0] ?? { charKey: constant(characterKey) }
    const fakeData = new UIData(baseData, undefined)
    const nextCond = buildMaxWeaponConditionals(
      teamChar.conditional,
      characterKey,
      fakeData,
      keptWeaponKeys
    )
    database.teamChars.set(teamCharId, (tc) => {
      tc.conditional = nextCond
    })
    database.optConfigs.set(optConfigId, {
      optWeapon: true,
      useEquippedWeapon: true,
      useTeammateWeapon: true,
      weaponLevelLow: 1,
      weaponLevelHigh: 90,
      weaponExclusion: nextExclusion,
    })
    onUpdate({ optWeapon: true })
  }, [
    database,
    loadoutDatum,
    characterKey,
    optConfig.weaponExclusion,
    charUIData,
    teamChar.conditional,
    teamCharId,
    optConfigId,
    onUpdate,
  ])

  const handleMaxTalentsSingle = useCallback(() => {
    enableAllTeamTalentPassivesMax(database, teamId, gender)
  }, [database, teamId, gender])

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
                        disabled={isFirst}
                        onClick={onMoveUp}
                      >
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={isLast}
                        onClick={onMoveDown}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                    </Box>

                    <Button
                      size="small"
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
                        onClick={handleMaxEffectsSingle}
                      >
                        {t(
                          'bulkBuild.maxSetsSingleBtn',
                          'Ativar Todos Sets & Efeitos Máx.'
                        )}
                      </Button>

                      <Button
                        size="small"
                        color="success"
                        startIcon={<AutoAwesome />}
                        onClick={handleMaxWeaponsSingle}
                      >
                        {t(
                          'bulkBuild.maxWeaponsSingleBtn',
                          'Ativar Todas Armas & Efeitos Máx. (Sem Repetir)'
                        )}
                      </Button>

                      <Button
                        size="small"
                        color="success"
                        startIcon={<AutoAwesome />}
                        onClick={handleMaxTalentsSingle}
                      >
                        {t(
                          'bulkBuild.maxTalentsSingleBtn',
                          'Ativar Passivas & Talentos Máx.'
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
                        onClick={() => onUpdate({ autoEquip: !item.autoEquip })}
                      >
                        {t('bulkBuild.autoEquipBtn', 'Auto-Equipar')}
                      </Button>

                      <IconButton size="small" color="error" onClick={onRemove}>
                        <DeleteForever fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Row Configuration Grid: Target Selector + Artifact Sets & Effects + Constraints/Weapon/KQMS */}
                  <BulkRowConfigControls
                    characterKey={characterKey}
                    optConfigId={optConfigId}
                    loadoutDatum={loadoutDatum}
                  />

                  {/* Result Preview for this Priority Slot */}
                  <BulkResultPreviewSection result={result} />
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
}: {
  characterKey: CharacterKey
  optConfigId: string
  loadoutDatum: LoadoutDatum
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
            targetSelectorModalProps={{
              excludeSections: ['character', 'bonusStats', 'teamBuff'],
            }}
          />
          <WeaponFilter
            filteredWeapons={filteredWeapons}
            teammateWeaponIds={teammateWeaponIds}
            currentWeaponId={currentWeaponId}
          />
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <ArtifactSetConfig />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Stack spacing={1}>
          <StatFilterCard />
          <KqmsErCard
            teamKqms={teamKqms}
            currentCharErFloor={currentCharErFloor}
          />
        </Stack>
      </Grid>
    </Grid>
  )
})
