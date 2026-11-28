import { objMap } from '@genshin-optimizer/common/util'
import type {
  ArtifactSetKey,
  ArtifactSlotKey,
} from '@genshin-optimizer/gi/consts'
import {
  allArtifactSetKeys,
  allArtifactSlotKeys,
} from '@genshin-optimizer/gi/consts'
import type { ArtSetExclusion } from '@genshin-optimizer/gi/db'
import {
  forEachNodes,
  type OptNode,
  optimize,
} from '@genshin-optimizer/gi/wr/opt'
import type {
  ArtifactBuildData,
  ArtifactsBySlot,
  RequestFilter,
} from '../../common.js'
import {
  computeFullArtRange,
  computeNodeRange,
  countBuilds,
  filterArts,
  pruneAll,
  pruneExclusion,
} from '../../common.js'
import type { Interim, Setup } from '../../type.js'
import type { SplitWorker } from '../BackgroundWorker.js'
import { splitBestSingleSlot } from './heuristicSplitting.js'
import type { Linear } from './linearUB.js'
import { linearUB } from './linearUB.js'

const artifactSetLookup = new Set<string>(allArtifactSetKeys)

type Approximation = {
  base: number
  /** optimization target contribution from a given artifact (id) */
  conts: Record<string, number>
}
type Filter = {
  nodes: OptNode[]
  lins: Linear[]
  arts: ArtifactsBySlot
  /**
   * The contribution of each artifact to the optimization target. The (over)estimated
   * optimization target value is the sum of contributions of all artifacts in the build.
   */
  approxs: Approximation[]
  maxConts: Record<ArtifactSlotKey, number>[]
  /** Total number of builds in this filter */
  count: number
  /** Whether or not this filter is in a valid (calculated) state */
  calculated?: boolean
  /** Threshold value (`this.min[0]`) at which pruning was last verified */
  thresholdChecked?: number
  /** Sets restricted to `<= 3` pieces in this filter (`no4pc` remainder subspace) */
  exclude4pc?: ArtifactSetKey[]
  /** Whether `reaffine` + `pruneOrder` should run on next calculation */
  needsReaffine?: boolean
}

function count4pcForSet(arts: ArtifactsBySlot, setKey: ArtifactSetKey): number {
  const a0 = countSlotSet(arts.values.flower, setKey)
  const a1 = countSlotSet(arts.values.plume, setKey)
  const a2 = countSlotSet(arts.values.sands, setKey)
  const a3 = countSlotSet(arts.values.goblet, setKey)
  const a4 = countSlotSet(arts.values.circlet, setKey)
  const b0 = arts.values.flower.length - a0
  const b1 = arts.values.plume.length - a1
  const b2 = arts.values.sands.length - a2
  const b3 = arts.values.goblet.length - a3
  const b4 = arts.values.circlet.length - a4

  return (
    a0 * a1 * a2 * a3 * a4 +
    b0 * a1 * a2 * a3 * a4 +
    a0 * b1 * a2 * a3 * a4 +
    a0 * a1 * b2 * a3 * a4 +
    a0 * a1 * a2 * b3 * a4 +
    a0 * a1 * a2 * a3 * b4
  )
}

function countSlotSet(
  list: ArtifactBuildData[],
  setKey: ArtifactSetKey
): number {
  let c = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i].set === setKey) c++
  }
  return c
}

function filterActiveExclude4pc(
  arts: ArtifactsBySlot,
  exclude4pc?: ArtifactSetKey[]
): ArtifactSetKey[] | undefined {
  if (!exclude4pc?.length) return undefined
  let active: ArtifactSetKey[] | undefined
  for (let i = 0; i < exclude4pc.length; i++) {
    const s = exclude4pc[i]
    if (count4pcForSet(arts, s) > 0) {
      if (!active) active = []
      active.push(s)
    }
  }
  return active
}

function countEffectiveBuilds(
  arts: ArtifactsBySlot,
  exclude4pc?: ArtifactSetKey[]
): number {
  let total = countBuilds(arts)
  if (!total || !exclude4pc?.length) return total
  for (let i = 0; i < exclude4pc.length; i++) {
    total -= count4pcForSet(arts, exclude4pc[i])
  }
  return Math.max(0, total)
}

/**
 * Finds `ArtifactSetKey`s that appear in `nodes` with a 4-piece `threshold(read('dyn', setKey), 4, ...)`
 * and are verified exact set-piece indicators present in >= 4 slots of `arts`.
 */
function findCandidate4pcSets(
  nodes: OptNode[],
  arts: ArtifactsBySlot
): ArtifactSetKey[] {
  const rawCandidates = new Set<ArtifactSetKey>()
  forEachNodes(
    nodes,
    () => {},
    (f) => {
      if (f.operation !== 'threshold') return
      const [v, t] = f.operands
      if (
        v.operation === 'read' &&
        v.path[0] === 'dyn' &&
        artifactSetLookup.has(v.path[1]) &&
        t.operation === 'const' &&
        t.value > 3 &&
        t.value <= 4
      ) {
        rawCandidates.add(v.path[1] as ArtifactSetKey)
      }
    }
  )

  const verified: ArtifactSetKey[] = []
  for (const setKey of rawCandidates) {
    if ((arts.base[setKey] ?? 0) !== 0) continue
    let slotsWithSet = 0
    let indicatorExact = true
    for (let s = 0; s < 5 && indicatorExact; s++) {
      const list = arts.values[allArtifactSlotKeys[s]]
      let hasInSlot = false
      for (let i = 0; i < list.length; i++) {
        const art = list[i]
        const isSet = art.set === setKey
        if ((art.values[setKey] ?? 0) !== (isSet ? 1 : 0)) {
          indicatorExact = false
          break
        }
        if (isSet) hasInSlot = true
      }
      if (hasInSlot) slotsWithSet++
    }
    if (indicatorExact && slotsWithSet >= 4) {
      verified.push(setKey)
    }
  }
  return verified
}

export class BNBSplitWorker implements SplitWorker {
  min: number[]
  nodes: OptNode[]
  arts: ArtifactsBySlot
  topN: number
  isPlotMode: boolean

  /**
   * Filters are not neccessarily in a valid state, i.e., "calculated".
   * We amortize the calculation to 1-per-split so that the calculation
   * overhead doesn't lead to lag.
   */
  filters: Filter[] = []
  interim: Interim | undefined
  firstUncalculated = 0

  callback: (interim: Interim) => void

  constructor(
    { arts, optTarget, constraints, topN, plotBase, initialThreshold }: Setup,
    callback: (interim: Interim) => void
  ) {
    this.arts = arts
    this.isPlotMode = Boolean(plotBase)
    this.min = [
      plotBase
        ? Number.NEGATIVE_INFINITY
        : (initialThreshold ?? Number.NEGATIVE_INFINITY),
      ...constraints.map((x) => x.min),
    ]
    this.nodes = [optTarget, ...constraints.map((x) => x.value)]
    this.callback = callback
    this.topN = topN

    // make sure we can approximate it
    linearUB(this.nodes, arts)
  }

  private checkRangesFeasible(
    nodes: OptNode[],
    arts: ArtifactsBySlot
  ): { feasible: boolean; ub: number } {
    const ranges = computeNodeRange(nodes, computeFullArtRange(arts))
    for (let idx = 0; idx < nodes.length; idx++) {
      const maxVal = ranges.get(nodes[idx])?.max ?? Number.POSITIVE_INFINITY
      if (!(maxVal >= this.min[idx])) {
        return { feasible: false, ub: Number.NEGATIVE_INFINITY }
      }
    }
    return {
      feasible: true,
      ub: ranges.get(nodes[0])?.max ?? Number.POSITIVE_INFINITY,
    }
  }

  addFilter(filter: RequestFilter): void {
    const arts = filterArts(this.arts, filter),
      totalCount = countBuilds(arts)
    if (!totalCount) return

    const candidate4pc =
      !this.isPlotMode && totalCount > 65536
        ? findCandidate4pcSets(this.nodes, arts)
        : []

    if (candidate4pc.length === 0) {
      this.filters.push({
        nodes: this.nodes,
        arts,
        maxConts: [],
        lins: [],
        approxs: [],
        count: totalCount,
      })
      return
    }

    // Disjoint decomposition:
    //   arts = (\bigsqcup_{setKey in candidate4pc} \bigsqcup_{p=0..4} 4pcPattern(setKey, p)) \sqcup no4pc(arts)
    // Eliminates 26^k multi-set phantom upper-bound blowup in a single exact step.
    const fourPcChildren: {
      arts: ArtifactsBySlot
      count: number
      ub: number
    }[] = []
    let sum4pcCount = 0

    const allSlots = allArtifactSlotKeys.map((s) => arts.values[s])
    for (const setKey of candidate4pc) {
      const onSet = allSlots.map((list) => list.filter((a) => a.set === setKey))
      const offSet = allSlots.map((list) =>
        list.filter((a) => a.set !== setKey)
      )

      for (let p = 0; p < 5; p++) {
        // p === 0: [any, A, A, A, A] (covers both 5pc A and off-piece at slot 0)
        // p in 1..4: off-piece (!A) at slot p, A at all other 4 slots
        const picked = [0, 1, 2, 3, 4].map((s) => {
          if (p === 0 && s === 0) return allSlots[0]
          if (s === p) return offSet[s]
          return onSet[s]
        })
        if (!picked.every((l) => l.length > 0)) continue
        const childArts: ArtifactsBySlot = {
          base: arts.base,
          values: {
            flower: picked[0],
            plume: picked[1],
            sands: picked[2],
            goblet: picked[3],
            circlet: picked[4],
          },
        }
        const c = countBuilds(childArts)
        sum4pcCount += c
        const { feasible, ub } = this.checkRangesFeasible(this.nodes, childArts)
        if (!feasible) {
          this.recordSkipped(c)
        } else {
          fourPcChildren.push({ arts: childArts, count: c, ub })
        }
      }
    }

    const no4pcCount = totalCount - sum4pcCount
    if (no4pcCount > 0) {
      const excl4: ArtSetExclusion = Object.fromEntries(
        candidate4pc.map((s) => [s, [4]])
      )
      const no4pcNodes = optimize(
        pruneExclusion(this.nodes, excl4),
        {},
        (_) => false
      )
      const { feasible } = this.checkRangesFeasible(no4pcNodes, arts)
      if (!feasible) {
        this.recordSkipped(no4pcCount)
      } else {
        // Push `no4pc` remainder FIRST (bottom of LIFO stack) so all 4pc sets run first and raise `this.min[0]`
        this.filters.push({
          nodes: no4pcNodes,
          arts,
          maxConts: [],
          lins: [],
          approxs: [],
          count: no4pcCount,
          exclude4pc: filterActiveExclude4pc(arts, candidate4pc),
          needsReaffine: true,
        })
      }
    }

    // Sort 4pc sets ascending by exact single-set upper bound so LIFO `pop()` explores the best 4pc set first
    fourPcChildren.sort((a, b) => a.ub - b.ub || b.count - a.count)
    for (const { arts: childArts, count } of fourPcChildren) {
      this.filters.push({
        nodes: this.nodes,
        arts: childArts,
        maxConts: [],
        lins: [],
        approxs: [],
        count,
      })
    }
  }

  setThreshold(newThreshold: number): void {
    if (newThreshold > this.min[0]) {
      this.min[0] = newThreshold
      this.firstUncalculated = 0
    }
  }

  *split(filter: RequestFilter, minCount: number): Generator<RequestFilter> {
    this.addFilter(filter)

    while (this.filters.length) {
      const currentFilter = this.getApproxFilter(),
        { arts, count, exclude4pc } = currentFilter

      if (!count) continue

      if (count <= minCount || Object.keys(arts.base).length === 0) {
        if (this.firstUncalculated < this.filters.length)
          this.calculateFilter(this.firstUncalculated++) // Amortize the filter calculation to 1-per-split

        this.reportInterim(false)
        const outFilter: RequestFilter = objMap(arts.values, (arts) => ({
          kind: 'id' as const,
          ids: new Set(arts.map((art) => art.id)),
        }))
        if (exclude4pc?.length) {
          outFilter.exclude4pc = exclude4pc
        }
        yield outFilter
      } else this.splitOldFilter(currentFilter)
    }

    this.reportInterim(true)
  }

  reportInterim(forced = false) {
    if (this.interim && (this.interim.skipped > 1000000 || forced === true)) {
      this.callback(this.interim)
      this.interim = undefined
    }
  }

  splitOldFilter(filter: Filter) {
    const { nodes, arts, lins, exclude4pc } = filter
    if (filter.count === 0) return

    const rawChildren = splitBestSingleSlot(lins, arts)
    const nextExclude = exclude4pc

    const scoredChildren: {
      arts: ArtifactsBySlot
      count: number
      ub: number
      exclude4pc?: ArtifactSetKey[]
    }[] = []

    for (const childArts of rawChildren) {
      const childExcl = filterActiveExclude4pc(childArts, nextExclude)
      const count = countEffectiveBuilds(childArts, childExcl)
      if (!count) continue
      const { feasible, ub } = this.checkRangesFeasible(nodes, childArts)
      if (!feasible) {
        this.recordSkipped(count)
        continue
      }
      scoredChildren.push({
        arts: childArts,
        count,
        ub,
        exclude4pc: childExcl,
      })
    }

    // Push lowest upper-bound first so LIFO `this.filters.pop()` explores highest upper-bound first (Best-First BNB)
    scoredChildren.sort((a, b) => a.ub - b.ub || b.count - a.count)

    for (const child of scoredChildren) {
      this.filters.push({
        nodes,
        arts: child.arts,
        maxConts: [],
        lins: [],
        approxs: [],
        count: child.count,
        exclude4pc: child.exclude4pc,
      })
    }
  }

  /** *Precondition*: `this.filters` must not be empty */
  getApproxFilter(): Filter {
    this.calculateFilter(this.filters.length - 1)
    if (this.firstUncalculated > this.filters.length)
      this.firstUncalculated = this.filters.length
    return this.filters.pop()!
  }

  private recordSkipped(delta: number) {
    if (delta <= 0) return
    if (this.interim) this.interim.skipped += delta
    else
      this.interim = {
        resultType: 'interim',
        buildValues: undefined,
        tested: 0,
        failed: 0,
        skipped: delta,
      }
  }

  /** Update calculate on filter at index `i` if not done so already */
  calculateFilter(i: number): void {
    const current = this.filters[i]
    let { nodes, arts, maxConts, lins, approxs, exclude4pc } = current
    const {
      count: oldCount,
      calculated,
      thresholdChecked,
      needsReaffine,
    } = current
    if (oldCount === 0) return

    if (calculated) {
      if (thresholdChecked === this.min[0] || approxs.length === 0) return

      // 1. O(1) linearUB subtree check against updated `this.min[0]`
      const lc0 = Object.values(maxConts[0]).reduce(
        (accu, val) => accu + val,
        approxs[0].base - this.min[0]
      )
      if (lc0 < 0) {
        const emptyValues = objMap(arts.values, () => [] as ArtifactBuildData[])
        this.recordSkipped(oldCount)
        this.filters[i] = {
          nodes,
          arts: { base: arts.base, values: emptyValues },
          maxConts,
          lins,
          approxs,
          count: 0,
          calculated: true,
          thresholdChecked: this.min[0],
        }
        return
      }

      // 2. O(1) exact interval / step-threshold subtree check against `this.min[0]`
      const { feasible } = this.checkRangesFeasible(nodes, arts)
      if (!feasible) {
        const emptyValues = objMap(arts.values, () => [] as ArtifactBuildData[])
        this.recordSkipped(oldCount)
        this.filters[i] = {
          nodes,
          arts: { base: arts.base, values: emptyValues },
          maxConts,
          lins,
          approxs,
          count: 0,
          calculated: true,
          thresholdChecked: this.min[0],
        }
        return
      }

      // 3. Check whether the higher threshold eliminates any artifact via linearUB
      let anyRemoved = false
      const shrunkValues = objMap(arts.values, (slotArts, slot) => {
        const req0 = maxConts[0][slot] - lc0
        const filtered = slotArts.filter(
          ({ id }) => approxs[0].conts[id] >= req0
        )
        if (filtered.length !== slotArts.length) anyRemoved = true
        return filtered
      })

      if (!anyRemoved) {
        current.thresholdChecked = this.min[0]
        return
      }

      arts = { base: arts.base, values: shrunkValues }
      exclude4pc = filterActiveExclude4pc(arts, exclude4pc)
      const shrunkCount = countEffectiveBuilds(arts, exclude4pc)
      if (shrunkCount === 0) {
        this.recordSkipped(oldCount)
        this.filters[i] = {
          nodes,
          arts,
          maxConts,
          lins,
          approxs,
          count: 0,
          calculated: true,
          thresholdChecked: this.min[0],
        }
        return
      }
    }

    const exclusionRule: ArtSetExclusion = exclude4pc?.length
      ? Object.fromEntries(exclude4pc.map((s) => [s, [4]]))
      : {}
    ;({ nodes, arts } = pruneAll(
      nodes,
      this.min,
      arts,
      this.topN,
      exclusionRule,
      needsReaffine
        ? {
            reaffine: true,
            pruneOrder: true,
            pruneNodeRange: true,
            pruneArtRange: true,
          }
        : { pruneNodeRange: true, pruneArtRange: true }
    ))
    nodes = optimize(nodes, {}, (_) => false)
    if (Object.values(arts.values).every((x) => x.length)) {
      const data = approximation(nodes, arts)
      lins = data.lins
      approxs = data.approxs
      maxConts = approxs.map((approx) =>
        objMap(arts.values, (val) => maxContribution(val, approx))
      )
    } else {
      lins = []
      approxs = []
      maxConts = []
    }
    // Removing artifacts that doesn't meet the required opt target contributions.
    const leadingConts = maxConts.map((cont, idx) =>
      Object.values(cont).reduce(
        (accu, val) => accu + val,
        approxs[idx].base - this.min[idx]
      )
    )
    const newValues = objMap(arts.values, (slotArts, slot) => {
      const requiredConts = leadingConts.map(
        (lc, idx) => maxConts[idx][slot] - lc
      )
      return slotArts.filter(({ id }) =>
        approxs.every(({ conts }, idx) => conts[id] >= requiredConts[idx])
      )
    })
    arts = { base: arts.base, values: newValues }
    exclude4pc = filterActiveExclude4pc(arts, exclude4pc)
    const newCount = countEffectiveBuilds(arts, exclude4pc)
    this.recordSkipped(oldCount - newCount)
    this.filters[i] = {
      nodes,
      arts,
      maxConts,
      lins,
      approxs,
      count: newCount,
      calculated: true,
      thresholdChecked: this.min[0],
      exclude4pc,
    }
  }
}

function maxContribution(
  arts: ArtifactBuildData[],
  approximation: Approximation
): number {
  let mx = Number.NEGATIVE_INFINITY
  for (let i = 0; i < arts.length; i++) {
    const v = approximation.conts[arts[i].id]!
    if (v > mx) mx = v
  }
  return mx
}

function approximation(
  nodes: OptNode[],
  arts: ArtifactsBySlot
): { lins: Linear[]; approxs: Approximation[] } {
  const lins = linearUB(nodes, arts)
  return {
    lins,
    approxs: lins.map((weight) => {
      const wKeys: string[] = []
      const wVals: number[] = []
      for (const [k, v] of Object.entries(weight)) {
        if (k !== '$c' && v !== 0) {
          wKeys.push(k)
          wVals.push(v)
        }
      }
      const wLen = wKeys.length
      const conts: Record<string, number> = {}
      for (let s = 0; s < 5; s++) {
        const list = arts.values[allArtifactSlotKeys[s]]
        for (let i = 0; i < list.length; i++) {
          const data = list[i]
          const vals = data.values
          let sum = 0
          for (let j = 0; j < wLen; j++) {
            sum += wVals[j] * (vals[wKeys[j]] ?? 0)
          }
          conts[data.id] = sum
        }
      }
      let baseSum = weight.$c
      for (let j = 0; j < wLen; j++) {
        baseSum += wVals[j] * (arts.base[wKeys[j]] ?? 0)
      }
      return {
        base: baseSum,
        conts,
      }
    }),
  }
}
