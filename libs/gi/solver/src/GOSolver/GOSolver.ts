import {
  allArtifactSetKeys,
  allArtifactSlotKeys,
} from '@genshin-optimizer/gi/consts'
import type { OptNode } from '@genshin-optimizer/gi/wr/opt'
import {
  forEachNodes,
  optimize,
  precompute,
} from '@genshin-optimizer/gi/wr/opt'
import type { ArtifactsBySlot } from '../common.js'
import {
  artSetPerm,
  computeFullArtRange,
  computeNodeRange,
  countBuilds,
  filterArts,
  filterFeasiblePerm,
  pruneAll,
  pruneExclusion,
} from '../common.js'
import { WorkerCoordinator } from '../coordinator.js'
import type {
  Count,
  FinalizeResult,
  Interim,
  OptProblemInput,
  Setup,
  WorkerCommand,
  WorkerResult,
} from '../type.js'

export function createSolverWorkers(numWorker: number): Worker[] {
  return Array.from(
    { length: numWorker },
    () =>
      new Worker(new URL('./BackgroundWorker.ts', import.meta.url), {
        type: 'module',
      })
  )
}

export function terminateSolverWorkers(workers: Worker[]): void {
  for (const w of workers) {
    w.onmessage = null
    w.onerror = null
    w.terminate()
  }
  workers.length = 0
}

const artifactSetLookup = new Set<string>(allArtifactSetKeys)

/**
 * Fast <1ms heuristic seeder that evaluates top single-slot marginal pieces
 * AND active 4-piece set combinations to obtain a tight, 100%-feasible lower
 * bound on the `topN`-th best build before Branch-and-Bound begins.
 */
function seedInitialThreshold(
  nodes: OptNode[],
  minimums: number[],
  arts: ArtifactsBySlot,
  topN: number,
  exclusion: Count['exclusion'],
  currentThreshold: number
): number {
  if (countBuilds(arts) < topN) return currentThreshold

  let seededArts = arts
  if (Object.keys(exclusion).length > 0) {
    const allSets = new Set(
      Object.values(arts.values).flatMap((list) => list.map((x) => x.set!))
    )
    let found: ArtifactsBySlot | undefined
    let checked = 0
    for (const perm of filterFeasiblePerm(
      artSetPerm(exclusion, allSets),
      arts
    )) {
      const candidate = filterArts(arts, perm)
      if (countBuilds(candidate) >= topN) {
        found = candidate
        break
      }
      if (++checked >= 8) break
    }
    if (!found) return currentThreshold
    seededArts = found
  }

  const numConstraints = nodes.length - 1
  const evalSingle = precompute(nodes, seededArts.base, (f) => f.path[1], 1)
  const evalFull = precompute(nodes, seededArts.base, (f) => f.path[1], 5)
  const baseSingleRes = evalSingle([{ values: {} }])
  const c0Base = numConstraints > 0 ? baseSingleRes[0] : 0
  const c0SlotShare =
    numConstraints > 0 ? Math.max(0, (minimums[0] - c0Base) / 4.5) : 0

  const pickTopPieces = (
    list: typeof seededArts.values.flower,
    scorer: typeof evalSingle,
    limit: number
  ) => {
    if (list.length <= limit) return list
    const scored = list.map((art) => {
      const res = scorer([art])
      const c0Single = numConstraints > 0 ? evalSingle([art])[0] - c0Base : 0
      return {
        art,
        target: res[numConstraints],
        c0: c0Single,
      }
    })
    scored.sort((a, b) => b.target - a.target)
    if (numConstraints === 0) {
      return scored.slice(0, limit).map((s) => s.art)
    }

    const picked: typeof list = [scored[0].art]
    if (limit >= 3 && c0SlotShare > 0) {
      const balanced = scored.find(
        (s) => s.art !== picked[0] && s.c0 >= c0SlotShare
      )
      if (balanced) picked.push(balanced.art)
    }
    for (let i = 1; i < scored.length && picked.length < limit - 1; i++) {
      if (!picked.includes(scored[i].art)) {
        picked.push(scored[i].art)
      }
    }
    let bestC0 = scored[0]
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].c0 > bestC0.c0) bestC0 = scored[i]
    }
    if (!picked.includes(bestC0.art)) {
      picked.push(bestC0.art)
    } else {
      for (let i = 1; i < scored.length && picked.length < limit; i++) {
        if (!picked.includes(scored[i].art)) picked.push(scored[i].art)
      }
    }
    return picked
  }

  const seenBuildIds = new Set<string>()
  const validScores: number[] = []
  const testGrid = (slots: (typeof seededArts.values.flower)[]) => {
    const [s0, s1, s2, s3, s4] = slots
    if (!s0.length || !s1.length || !s2.length || !s3.length || !s4.length)
      return
    const tuple = [s0[0], s1[0], s2[0], s3[0], s4[0]]
    for (let i0 = 0; i0 < s0.length; i0++) {
      tuple[0] = s0[i0]
      for (let i1 = 0; i1 < s1.length; i1++) {
        tuple[1] = s1[i1]
        for (let i2 = 0; i2 < s2.length; i2++) {
          tuple[2] = s2[i2]
          for (let i3 = 0; i3 < s3.length; i3++) {
            tuple[3] = s3[i3]
            for (let i4 = 0; i4 < s4.length; i4++) {
              tuple[4] = s4[i4]
              const key = `${tuple[0].id}|${tuple[1].id}|${tuple[2].id}|${tuple[3].id}|${tuple[4].id}`
              if (seenBuildIds.has(key)) continue
              seenBuildIds.add(key)
              const res = evalFull(tuple)
              let ok = true
              for (let c = 0; c < numConstraints; c++) {
                if (!(res[c] >= minimums[c])) {
                  ok = false
                  break
                }
              }
              if (ok) validScores.push(res[numConstraints])
            }
          }
        }
      }
    }
  }

  // 1. Rainbow / 2pc marginal top candidates (up to 4^5 = 1,024 builds)
  const rainbowBySlot = allArtifactSlotKeys.map((slot) =>
    pickTopPieces(seededArts.values[slot], evalSingle, 4)
  )
  testGrid(rainbowBySlot)

  // 2. Active 4-piece set candidates referenced in `nodes`
  const activeSets = new Set<string>()
  forEachNodes(
    nodes,
    () => {},
    (f) => {
      if (f.operation === 'read' && artifactSetLookup.has(f.path[1])) {
        activeSets.add(f.path[1])
      }
    }
  )

  let testedSets = 0
  for (const setKey of activeSets) {
    if (testedSets >= 8) break
    const setPiecesBySlot = allArtifactSlotKeys.map((slot) =>
      seededArts.values[slot].filter((a) => a.set === setKey)
    )
    const nonEmptySlots = setPiecesBySlot.filter((l) => l.length > 0).length
    if (nonEmptySlots < 4) continue
    testedSets++

    const evalWith4pc = precompute(
      nodes,
      { ...seededArts.base, [setKey]: (seededArts.base[setKey] ?? 0) + 4 },
      (f) => f.path[1],
      1
    )
    const topSetBySlot = setPiecesBySlot.map((list) =>
      pickTopPieces(list, evalWith4pc, 3)
    )
    const topAnyBySlot = allArtifactSlotKeys.map((slot) =>
      pickTopPieces(seededArts.values[slot], evalWith4pc, 3)
    )

    for (let offSlot = 0; offSlot < 5; offSlot++) {
      const grid = topSetBySlot.map((list, idx) =>
        idx === offSlot ? topAnyBySlot[idx] : list
      )
      testGrid(grid)
    }
  }

  if (validScores.length < topN) return currentThreshold
  validScores.sort((a, b) => b - a)
  const nth = validScores[topN - 1]
  if (!Number.isFinite(nth)) return currentThreshold

  // Subtract a tiny epsilon so floating-point differences never prune the seeded topN builds themselves
  const safeSeed = nth - (Math.abs(nth) * 1e-9 + 1e-9)
  return Math.max(currentThreshold, safeSeed)
}

export class GOSolver extends WorkerCoordinator<WorkerCommand, WorkerResult> {
  private maxIterateSize: number
  private status: Record<
    | 'tested'
    | 'failed'
    | 'skipped'
    | 'total'
    | 'testedPerSecond'
    | 'skippedPerSecond',
    number
  >
  private exclusion: Count['exclusion']
  private topN: number
  private initialThreshold: number
  private isTrivialEmpty: boolean
  private buildValues: { w: Worker; val: number }[]
  private finalizedResults: FinalizeResult[] = []

  constructor(
    problem: OptProblemInput,
    status: GOSolver['status'],
    numWorker: number,
    existingWorkers?: Worker[]
  ) {
    const workers = existingWorkers ?? createSolverWorkers(numWorker)
    super(workers, ['iterate', 'split', 'count'], (r, w) => {
      switch (r.resultType) {
        case 'interim':
          this.interim(r, w)
          break
        case 'finalize':
          this.finalizedResults.push(r)
          break
        case 'count':
          this.status.total = r.count
          break
        case 'err':
          this.onError(r)
          break
      }
    })
    // Balanced chunk size for 32-way BNB splitting: parallelizes across all threads without adding an extra 32x split depth
    this.maxIterateSize = Math.max(
      4_000_000,
      Math.min(16_000_000, Math.floor(32_000_000 / Math.max(1, workers.length)))
    )
    const { exclusion, topN } = problem
    this.status = status
    this.exclusion = exclusion
    this.topN = topN
    this.status.total = Number.NaN
    this.status.testedPerSecond = 0
    this.status.skippedPerSecond = 0

    const setup = this.preprocess(problem)
    this.initialThreshold = setup.initialThreshold ?? Number.NEGATIVE_INFINITY
    this.isTrivialEmpty = countBuilds(setup.arts) === 0
    this.buildValues = Array.from({ length: topN }, () => ({
      w: undefined as any,
      val: this.initialThreshold,
    }))

    if (!this.isTrivialEmpty) {
      this.notifiedBroadcast(setup)
    }
  }

  async solve() {
    if (this.isTrivialEmpty) {
      this.status.total = 0
      for (const w of this._workers) {
        w.onmessage = null
        w.onerror = null
      }
      this.workDone.clear()
      return []
    }

    const { exclusion, maxIterateSize } = this
    this.finalizedResults = []

    // Cleanup function from the BPS tracker
    const stopTracking = this.trackBuildsPerSecond()
    try {
      await this.execute([{ command: 'count', exclusion, maxIterateSize }])
      this.notifiedBroadcast({ command: 'finalize' })
      await this.execute([])
      const results = this.finalizedResults
      this.finalizedResults = []
      this.buildValues = []
      return results
    } finally {
      stopTracking()
      for (const w of this._workers) {
        w.onmessage = null
        w.onerror = null
      }
      this.workDone.clear()
    }
  }

  preprocess({
    plotBase,
    optimizationTarget,
    arts,
    topN,
    exclusion,
    constraints,
    initialThreshold,
  }: OptProblemInput): Setup {
    constraints = constraints.filter((x) => x.min > Number.NEGATIVE_INFINITY)

    let effectiveThreshold = plotBase
      ? Number.NEGATIVE_INFINITY
      : (initialThreshold ?? Number.NEGATIVE_INFINITY)

    let nodes = [...constraints.map((x) => x.value), optimizationTarget]
    const minimums = [
      ...constraints.map((x) => x.min),
      Number.NEGATIVE_INFINITY,
    ]
    if (plotBase) {
      nodes.push(plotBase)
      minimums.push(Number.NEGATIVE_INFINITY)
    }

    nodes = pruneExclusion(nodes, exclusion)
    nodes = optimize(nodes, {}, (_) => false)
    ;({ nodes, arts } = pruneAll(nodes, minimums, arts, topN, exclusion, {
      reaffine: true,
      pruneArtRange: true,
      pruneNodeRange: true,
      pruneOrder: true,
    }))
    nodes = optimize(nodes, {}, (_) => false)

    if (!plotBase && countBuilds(arts) > 0) {
      const targetCandidate = nodes[nodes.length - 1]
      if (effectiveThreshold > Number.NEGATIVE_INFINITY) {
        const fullRange = computeNodeRange(
          [targetCandidate],
          computeFullArtRange(arts)
        )
        const upperBound =
          fullRange.get(targetCandidate)?.max ?? Number.POSITIVE_INFINITY
        if (upperBound < effectiveThreshold) {
          arts = {
            base: arts.base,
            values: {
              flower: [],
              plume: [],
              sands: [],
              goblet: [],
              circlet: [],
            },
          }
        }
      }

      if (countBuilds(arts) > 0) {
        effectiveThreshold = seedInitialThreshold(
          nodes,
          minimums,
          arts,
          topN,
          exclusion,
          effectiveThreshold
        )
      }
    }

    if (plotBase) plotBase = nodes.pop()
    const optTarget = nodes.pop()!

    return {
      command: 'setup',
      arts,
      optTarget,
      plotBase,
      topN,
      initialThreshold: effectiveThreshold,
      constraints: nodes.map((value, i) => ({ value, min: minimums[i] })),
    }
  }

  /** Tracks number of builds processed per second. Returns a cleanup function to be called once Artifact Optimization is complete. */
  private trackBuildsPerSecond() {
    let lastTime = performance.now()
    let lastTested = 0
    let lastSkipped = 0

    let intervalId: NodeJS.Timeout | null = null
    const cleanup = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    try {
      intervalId = setInterval(() => {
        const currentTime = performance.now()
        const elapsedTime = (currentTime - lastTime) / 1000 // in seconds
        const testedDifference = this.status.tested - lastTested
        const skippedDifference = this.status.skipped - lastSkipped

        if (elapsedTime !== 0) {
          this.status.testedPerSecond = testedDifference / elapsedTime
          this.status.skippedPerSecond = skippedDifference / elapsedTime
        }

        lastTime = currentTime
        lastTested = this.status.tested
        lastSkipped = this.status.skipped
      }, 1000)
    } catch (e) {
      cleanup()
      throw e
    }

    // Return a cleanup function to stop the interval
    return cleanup
  }

  /** Returns a new `threshold` if altered */
  private interim(r: Interim, worker: Worker) {
    this.status.tested += r.tested
    this.status.failed += r.failed
    this.status.skipped += r.skipped

    if (r.buildValues) {
      const { topN } = this,
        oldThreshold =
          this.buildValues[topN - 1]?.val ?? Number.NEGATIVE_INFINITY

      this.buildValues = this.buildValues.filter(({ w }) => w !== worker)
      this.buildValues.push(
        ...r.buildValues.map((val) => ({ w: worker!, val }))
      )
      while (this.buildValues.length < topN) {
        this.buildValues.push({
          w: undefined as any,
          val: this.initialThreshold,
        })
      }
      this.buildValues.sort((a, b) => b.val - a.val).splice(topN)

      const threshold =
        this.buildValues[topN - 1]?.val ?? Number.NEGATIVE_INFINITY
      if (threshold > oldThreshold)
        this.broadcast({ command: 'threshold', threshold })
    }
  }
}
