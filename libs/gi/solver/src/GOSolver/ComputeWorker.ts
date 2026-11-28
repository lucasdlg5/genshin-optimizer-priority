import { assertUnreachable } from '@genshin-optimizer/common/util'
import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import type { ArtSetExclusion } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr/opt'
import {
  forEachNodes,
  optimize,
  precompute,
} from '@genshin-optimizer/gi/wr/opt'
import type {
  ArtifactBuildData,
  ArtifactsBySlot,
  PlotData,
  RequestFilter,
  SolverBuild,
} from '../common.js'
import {
  countBuilds,
  filterArts,
  mergePlot,
  pruneAll,
  pruneExclusion,
} from '../common.js'
import type { Interim, Setup } from '../type.js'

type Compiled5SlotKernel = (
  base: Float64Array,
  v0: Float64Array,
  v1: Float64Array,
  v2: Float64Array,
  v3: Float64Array,
  v4: Float64Array,
  suffixMax: Float64Array,
  n0: number,
  n1: number,
  n2: number,
  n3: number,
  n4: number,
  mins: Float64Array,
  initialThreshold: number,
  onHit: (
    i0: number,
    i1: number,
    i2: number,
    i3: number,
    i4: number,
    val: number
  ) => number,
  onPlotHit: (
    i0: number,
    i1: number,
    i2: number,
    i3: number,
    i4: number,
    val: number,
    plotVal: number,
    curThreshold: number
  ) => number,
  onInterim: (
    testedDelta: number,
    failedDelta: number,
    skippedDelta: number
  ) => number
) => [number, number, number]

const MAX_KERNEL_CACHE = 256
const kernelCache = new Map<string, Compiled5SlotKernel>()

function evalResScalar(r: number): number {
  if (r < 0) return 1 - r / 2
  if (r >= 0.75) return 1 / (r * 4 + 1)
  return 1 - r
}

/**
 * Sound compile-time monotonicity analysis over `[fullMin, fullMax]`.
 * Tracks both non-decreasing (`isInc`) and non-increasing (`isDec`) subexpressions
 * (so e.g. `res(threshold(VV, 4, -0.4, 0))` = `dec(dec)` is recognized as `isInc`!).
 */
function analyzeNonDecreasing(
  roots: OptNode[],
  keyToIndex: Map<string, number>,
  fullMin: Float64Array,
  fullMax: Float64Array
): Map<OptNode, boolean> {
  const minVal = new Map<OptNode, number>()
  const maxVal = new Map<OptNode, number>()
  const isInc = new Map<OptNode, boolean>()
  const isDec = new Map<OptNode, boolean>()

  forEachNodes(
    roots,
    () => {},
    (f) => {
      const { operation, operands } = f
      switch (operation) {
        case 'const': {
          const fin = Number.isFinite(f.value)
          minVal.set(f, f.value)
          maxVal.set(f, f.value)
          isInc.set(f, fin)
          isDec.set(f, fin)
          break
        }
        case 'read': {
          const idx = keyToIndex.get(f.path[1])!
          minVal.set(f, fullMin[idx])
          maxVal.set(f, fullMax[idx])
          isInc.set(f, true)
          isDec.set(f, fullMin[idx] === fullMax[idx])
          break
        }
        case 'add': {
          let mn = 0
          let mx = 0
          let inc = true
          let dec = true
          for (const op of operands) {
            mn += minVal.get(op)!
            mx += maxVal.get(op)!
            if (!isInc.get(op)) inc = false
            if (!isDec.get(op)) dec = false
          }
          const fin = Number.isFinite(mn) && Number.isFinite(mx)
          minVal.set(f, mn)
          maxVal.set(f, mx)
          isInc.set(f, inc && fin)
          isDec.set(f, dec && fin)
          break
        }
        case 'min': {
          let mn = Number.POSITIVE_INFINITY
          let mx = Number.POSITIVE_INFINITY
          let inc = true
          let dec = true
          for (const op of operands) {
            mn = Math.min(mn, minVal.get(op)!)
            mx = Math.min(mx, maxVal.get(op)!)
            if (!isInc.get(op)) inc = false
            if (!isDec.get(op)) dec = false
          }
          const fin = Number.isFinite(mn) && Number.isFinite(mx)
          minVal.set(f, mn)
          maxVal.set(f, mx)
          isInc.set(f, inc && fin)
          isDec.set(f, dec && fin)
          break
        }
        case 'max': {
          let mn = Number.NEGATIVE_INFINITY
          let mx = Number.NEGATIVE_INFINITY
          let inc = true
          let dec = true
          for (const op of operands) {
            mn = Math.max(mn, minVal.get(op)!)
            mx = Math.max(mx, maxVal.get(op)!)
            if (!isInc.get(op)) inc = false
            if (!isDec.get(op)) dec = false
          }
          const fin = Number.isFinite(mn) && Number.isFinite(mx)
          minVal.set(f, mn)
          maxVal.set(f, mx)
          isInc.set(f, inc && fin)
          isDec.set(f, dec && fin)
          break
        }
        case 'mul': {
          // Handle negative constant scaling (e.g., `-0.4 * x`) cleanly
          let constSign = 1
          let nonConstCount = 0
          let singleNonConst: OptNode | undefined
          for (const op of operands) {
            if (op.operation === 'const') constSign *= Math.sign(op.value)
            else {
              nonConstCount++
              singleNonConst = op
            }
          }

          let mn = minVal.get(operands[0])!
          let mx = maxVal.get(operands[0])!
          let allNonNegInc = Boolean(isInc.get(operands[0])) && mn >= 0
          for (let i = 1; i < operands.length; i++) {
            const cmn = minVal.get(operands[i])!
            const cmx = maxVal.get(operands[i])!
            if (!isInc.get(operands[i]) || cmn < 0) allNonNegInc = false
            const p1 = mn * cmn
            const p2 = mn * cmx
            const p3 = mx * cmn
            const p4 = mx * cmx
            mn = Math.min(p1, p2, p3, p4)
            mx = Math.max(p1, p2, p3, p4)
          }
          const fin = Number.isFinite(mn) && Number.isFinite(mx)
          minVal.set(f, mn)
          maxVal.set(f, mx)

          if (nonConstCount === 0) {
            isInc.set(f, fin)
            isDec.set(f, fin)
          } else if (nonConstCount === 1 && singleNonConst) {
            const subInc = Boolean(isInc.get(singleNonConst))
            const subDec = Boolean(isDec.get(singleNonConst))
            isInc.set(
              f,
              fin && (constSign >= 0 ? subInc : constSign < 0 ? subDec : true)
            )
            isDec.set(
              f,
              fin && (constSign >= 0 ? subDec : constSign < 0 ? subInc : true)
            )
          } else {
            isInc.set(f, fin && allNonNegInc)
            isDec.set(f, false)
          }
          break
        }
        case 'sum_frac': {
          const [x, c] = operands
          const xmn = minVal.get(x)!
          const xmx = maxVal.get(x)!
          const cmn = minVal.get(c)!
          const cmx = maxVal.get(c)!
          const validConstC =
            c.operation === 'const' && c.value > 0 && xmn + c.value > 0
          if (xmn + cmn > 0 && xmx + cmx > 0) {
            const q1 = xmn / (xmn + cmx)
            const q2 = xmx / (xmx + cmn)
            minVal.set(f, Math.min(q1, q2))
            maxVal.set(f, Math.max(q1, q2))
          } else {
            minVal.set(f, Number.NEGATIVE_INFINITY)
            maxVal.set(f, Number.POSITIVE_INFINITY)
          }
          isInc.set(f, validConstC && Boolean(isInc.get(x)))
          isDec.set(f, validConstC && Boolean(isDec.get(x)))
          break
        }
        case 'threshold': {
          const [v, t, p, fl] = operands
          const pmn = minVal.get(p)!
          const pmx = maxVal.get(p)!
          const fmn = minVal.get(fl)!
          const fmx = maxVal.get(fl)!
          minVal.set(f, Math.min(pmn, fmn))
          maxVal.set(f, Math.max(pmx, fmx))
          const vInc = Boolean(isInc.get(v)) && t.operation === 'const'
          isInc.set(
            f,
            vInc &&
              Boolean(isInc.get(p)) &&
              Boolean(isInc.get(fl)) &&
              pmn >= fmx
          )
          isDec.set(
            f,
            vInc &&
              Boolean(isDec.get(p)) &&
              Boolean(isDec.get(fl)) &&
              pmx <= fmn
          )
          break
        }
        case 'res': {
          const o = operands[0]
          const omn = minVal.get(o)!
          const omx = maxVal.get(o)!
          minVal.set(f, evalResScalar(omx))
          maxVal.set(f, evalResScalar(omn))
          const fin = Number.isFinite(omn) && Number.isFinite(omx)
          // `res` is monotonically decreasing, so `res(dec)` is `inc` and `res(inc)` is `dec`!
          isInc.set(f, fin && Boolean(isDec.get(o)))
          isDec.set(f, fin && Boolean(isInc.get(o)))
          break
        }
        default:
          assertUnreachable(operation)
      }
    }
  )
  return isInc
}

function compile5SlotKernel(
  constraintNodes: OptNode[],
  targetNode: OptNode,
  plotNode: OptNode | undefined,
  keyToIndex: Map<string, number>,
  numKeys: number,
  monoConstraints: boolean[],
  monoTarget: boolean
): Compiled5SlotKernel {
  const useDepthPruning =
    !plotNode && (monoTarget || monoConstraints.some(Boolean))

  let body = `"use strict";
function res(r) {
  if (r < 0) return 1 - r / 2;
  if (r >= 0.75) return 1 / (r * 4 + 1);
  return 1 - r;
}
function calcSafe(t) {
  return Number.isFinite(t) ? t - (Math.abs(t) * 1e-12 + 1e-12) : t;
}
let threshold = initialThreshold;
let safeThresh = calcSafe(threshold);
let tested = 0;
let failed = 0;
let skipped = 0;
const rem2 = n3 * n4;
const rem1 = n2 * rem2;
const rem0 = n1 * rem1;
`

  for (let k = 0; k < numKeys; k++) {
    body += `const b_${k} = base[${k}];\n`
  }
  if (useDepthPruning) {
    for (let d = 0; d <= 3; d++) {
      const baseOff = d * numKeys
      for (let k = 0; k < numKeys; k++) {
        body += `const mx${d}_${k} = suffixMax[${baseOff + k}];\n`
      }
    }
  }
  for (let c = 0; c < constraintNodes.length; c++) {
    body += `const m_${c} = mins[${c}];\n`
    if (useDepthPruning && monoConstraints[c]) {
      body += `const ms_${c} = m_${c} - (Math.abs(m_${c}) * 1e-12 + 1e-12);\n`
    }
  }

  let nextVarId = 1

  const emitExprGroup = (
    roots: OptNode[],
    readExprForKey: (kIdx: number) => string,
    namesMap: Map<OptNode, string>
  ) => {
    forEachNodes(
      roots,
      () => {},
      (f) => {
        if (namesMap.has(f)) return
        const { operation, operands } = f
        if (operation === 'const') {
          namesMap.set(f, `(${f.value})`)
          return
        }
        const name = `x${nextVarId++}`
        namesMap.set(f, name)
        switch (operation) {
          case 'read': {
            const kIdx = keyToIndex.get(f.path[1])!
            body += `const ${name} = ${readExprForKey(kIdx)};\n`
            break
          }
          case 'add':
          case 'mul': {
            const opNames = operands.map((op) => namesMap.get(op)!)
            body += `const ${name} = ${opNames.join(
              operation === 'add' ? '+' : '*'
            )};\n`
            break
          }
          case 'min':
          case 'max': {
            const opNames = operands.map((op) => namesMap.get(op)!)
            body += `const ${name} = Math.${operation}(${opNames.join(',')});\n`
            break
          }
          case 'threshold': {
            const [v, t, p, fl] = operands.map((op) => namesMap.get(op)!)
            body += `const ${name} = (${v} >= ${t}) ? ${p} : ${fl};\n`
            break
          }
          case 'res': {
            const op0 = namesMap.get(operands[0])!
            body += `const ${name} = res(${op0});\n`
            break
          }
          case 'sum_frac': {
            const [x, c] = operands.map((op) => namesMap.get(op)!)
            body += `const ${name} = ${x} / (${x} + ${c});\n`
            break
          }
          default:
            assertUnreachable(operation)
        }
      }
    )
  }

  for (let s = 0; s < 4; s++) {
    body += `for (let i${s} = 0, o${s} = 0; i${s} < n${s}; i${s}++, o${s} += ${numKeys}) {\n`
    for (let k = 0; k < numKeys; k++) {
      const prev = s === 0 ? `b_${k}` : `s${s - 1}_${k}`
      body += `const s${s}_${k} = ${prev} + v${s}[o${s} + ${k}];\n`
    }

    // Monotone suffix-max pruning at ALL outer depths s = 0, 1, 2, 3
    if (useDepthPruning) {
      const remExpr =
        s === 0 ? 'rem0' : s === 1 ? 'rem1' : s === 2 ? 'rem2' : 'n4'
      const depthNames = new Map<OptNode, string>()
      const readAtDepth = (kIdx: number) => `s${s}_${kIdx} + mx${s}_${kIdx}`

      for (let c = 0; c < constraintNodes.length; c++) {
        if (!monoConstraints[c]) continue
        emitExprGroup([constraintNodes[c]], readAtDepth, depthNames)
        const cName = depthNames.get(constraintNodes[c])!
        body += `if (!(${cName} >= ms_${c})) { failed += ${remExpr}; tested += ${remExpr}; continue; }\n`
      }
      if (monoTarget) {
        emitExprGroup([targetNode], readAtDepth, depthNames)
        const tName = depthNames.get(targetNode)!
        body += `if (!(${tName} >= safeThresh)) { skipped += ${remExpr}; continue; }\n`
      }
    }
  }

  body += `for (let i4 = 0, o4 = 0; i4 < n4; i4++, o4 += ${numKeys}) {\n`

  const leafNames = new Map<OptNode, string>()
  const readLeaf = (kIdx: number) => `s3_${kIdx} + v4[o4 + ${kIdx}]`

  // Short-circuit each constraint in order BEFORE computing target damage
  for (let c = 0; c < constraintNodes.length; c++) {
    emitExprGroup([constraintNodes[c]], readLeaf, leafNames)
    const cName = leafNames.get(constraintNodes[c])!
    body += `if (!(${cName} >= m_${c})) { failed++; continue; }\n`
  }

  if (!plotNode) {
    emitExprGroup([targetNode], readLeaf, leafNames)
    const tName = leafNames.get(targetNode)!
    body += `if (${tName} >= threshold) { threshold = onHit(i0, i1, i2, i3, i4, ${tName}); safeThresh = calcSafe(threshold); }\n`
  } else {
    emitExprGroup([targetNode, plotNode], readLeaf, leafNames)
    const tName = leafNames.get(targetNode)!
    const pName = leafNames.get(plotNode)!
    body += `threshold = onPlotHit(i0, i1, i2, i3, i4, ${tName}, ${pName}, threshold);\n`
  }

  body += '}\n' // end i4
  body +=
    'tested += n4;\nif (tested + skipped > 65536) {\n  threshold = onInterim(tested, failed, skipped);\n  safeThresh = calcSafe(threshold);\n  tested = 0;\n  failed = 0;\n  skipped = 0;\n}\n'

  for (let s = 3; s >= 0; s--) {
    body += '}\n'
  }
  body += 'return [tested, failed, skipped];\n'

  const cached = kernelCache.get(body)
  if (cached) return cached

  const compiled = new Function(
    'base',
    'v0',
    'v1',
    'v2',
    'v3',
    'v4',
    'suffixMax',
    'n0',
    'n1',
    'n2',
    'n3',
    'n4',
    'mins',
    'initialThreshold',
    'onHit',
    'onPlotHit',
    'onInterim',
    body
  ) as Compiled5SlotKernel

  if (kernelCache.size >= MAX_KERNEL_CACHE) {
    kernelCache.clear()
  }
  kernelCache.set(body, compiled)
  return compiled
}

export class ComputeWorker {
  builds: SolverBuild[] = []
  buildValues: number[] | undefined = undefined
  plotData: PlotData | undefined
  threshold = Number.NEGATIVE_INFINITY
  topN: number
  min: number[]
  private dirtyTopBuilds = false

  arts: ArtifactsBySlot
  nodes: OptNode[]

  callback: (interim: Interim) => void

  constructor(
    { arts, optTarget, constraints, plotBase, topN, initialThreshold }: Setup,
    callback: (interim: Interim) => void
  ) {
    this.arts = arts
    this.min = constraints.map((x) => x.min)
    this.topN = topN
    this.threshold = initialThreshold ?? Number.NEGATIVE_INFINITY
    this.callback = callback
    this.nodes = constraints.map((x) => x.value)
    this.nodes.push(optTarget)
    if (plotBase) {
      this.plotData = {}
      this.nodes.push(plotBase)
    }
    this.nodes = optimize(this.nodes, {}, (_) => false)
  }

  setThreshold(newThreshold: number) {
    if (newThreshold > this.threshold) this.threshold = newThreshold
  }

  compute(filter: RequestFilter) {
    const { min } = this
    let preArts = filterArts(this.arts, filter)
    const exclude4pc = filter.exclude4pc
    const exclusionRule: ArtSetExclusion = exclude4pc?.length
      ? Object.fromEntries(exclude4pc.map((s) => [s, [4]]))
      : {}
    const totalCount = countBuilds(preArts),
      oldMaxBuildCount = this.builds.length

    const safeThresh = Number.isFinite(this.threshold)
      ? this.threshold - (Math.abs(this.threshold) * 1e-12 + 1e-12)
      : this.threshold
    const pruneMins = this.plotData ? min : [...min, safeThresh]
    const maxSlotCount = Math.max(
      preArts.values.flower.length,
      preArts.values.plume.length,
      preArts.values.sands.length,
      preArts.values.goblet.length,
      preArts.values.circlet.length
    )

    let nodes = exclude4pc?.length
      ? optimize(pruneExclusion(this.nodes, exclusionRule), {}, (_) => false)
      : this.nodes
    ;({ nodes, arts: preArts } = pruneAll(
      nodes,
      pruneMins,
      preArts,
      this.topN,
      exclusionRule,
      {
        pruneOrder: !this.plotData && maxSlotCount <= 48,
        pruneArtRange: true,
        pruneNodeRange: true,
      }
    ))

    const remainingCount = countBuilds(preArts)
    const initialSkipped = totalCount - remainingCount
    if (remainingCount === 0) {
      if (initialSkipped > 0) {
        this.interimReport(
          { tested: 0, failed: 0, skipped: initialSkipped },
          false
        )
      }
      return
    }

    // Sort ascending so slotArts[0] is shortest (outermost) and slotArts[4] is longest (innermost)
    const slotArts = Object.values(preArts.values).sort(
      (a, b) => a.length - b.length
    )

    if (slotArts.length === 5) {
      const constraintNodes = nodes.slice(0, min.length)
      const targetNode = nodes[min.length]
      const plotNode = this.plotData ? nodes[min.length + 1] : undefined

      const keyToIndex = new Map<string, number>()
      const keys: string[] = []
      forEachNodes(
        nodes,
        (f) => {
          if (f.operation === 'read') {
            const k = f.path[1]
            if (!keyToIndex.has(k)) {
              keyToIndex.set(k, keys.length)
              keys.push(k)
            }
          }
        },
        () => {}
      )
      const numKeys = keys.length
      const baseBuf = new Float64Array(numKeys)
      for (let k = 0; k < numKeys; k++) {
        baseBuf[k] = preArts.base[keys[k]] ?? 0
      }

      const slotMin = Array.from({ length: 5 }, () => new Float64Array(numKeys))
      const slotMax = Array.from({ length: 5 }, () => new Float64Array(numKeys))
      const slotBufs = slotArts.map((list, s) => {
        const buf = new Float64Array(list.length * numKeys)
        const sMin = slotMin[s]
        const sMax = slotMax[s]
        sMin.fill(Number.POSITIVE_INFINITY)
        sMax.fill(Number.NEGATIVE_INFINITY)
        for (let i = 0; i < list.length; i++) {
          const vals = list[i].values
          const off = i * numKeys
          for (let k = 0; k < numKeys; k++) {
            const v = vals[keys[k]] ?? 0
            buf[off + k] = v
            if (v < sMin[k]) sMin[k] = v
            if (v > sMax[k]) sMax[k] = v
          }
        }
        return buf
      })

      const fullMin = new Float64Array(numKeys)
      const fullMax = new Float64Array(numKeys)
      const suffixMax = new Float64Array(4 * numKeys)
      for (let k = 0; k < numKeys; k++) {
        const mx4 = slotMax[4][k]
        const mx34 = slotMax[3][k] + mx4
        const mx234 = slotMax[2][k] + mx34
        const mx1234 = slotMax[1][k] + mx234
        suffixMax[k] = mx1234
        suffixMax[numKeys + k] = mx234
        suffixMax[2 * numKeys + k] = mx34
        suffixMax[3 * numKeys + k] = mx4
        fullMin[k] =
          baseBuf[k] +
          slotMin[0][k] +
          slotMin[1][k] +
          slotMin[2][k] +
          slotMin[3][k] +
          slotMin[4][k]
        fullMax[k] = baseBuf[k] + slotMax[0][k] + mx1234
      }

      let monoConstraints: boolean[] = constraintNodes.map(() => false)
      let monoTarget = false
      if (!plotNode && remainingCount >= 256) {
        const isInc = analyzeNonDecreasing(
          [...constraintNodes, targetNode],
          keyToIndex,
          fullMin,
          fullMax
        )
        monoConstraints = constraintNodes.map((n) => Boolean(isInc.get(n)))
        monoTarget = Boolean(isInc.get(targetNode))
      }

      const minsBuf = Float64Array.from(min)

      const kernel = compile5SlotKernel(
        constraintNodes,
        targetNode,
        plotNode,
        keyToIndex,
        numKeys,
        monoConstraints,
        monoTarget
      )

      const exclude4pcSet = exclude4pc?.length
        ? new Set<ArtifactSetKey>(exclude4pc)
        : undefined
      const isExcluded4pcBuild = (
        i0: number,
        i1: number,
        i2: number,
        i3: number,
        i4: number
      ): boolean => {
        if (!exclude4pcSet) return false
        const s0 = slotArts[0][i0].set
        const s1 = slotArts[1][i1].set
        const s2 = slotArts[2][i2].set
        const s3 = slotArts[3][i3].set
        const s4 = slotArts[4][i4].set
        // With 5 slots, a set has >= 4 pieces iff either s0 or s1 is that set and appears >= 4 times
        if (s0 && exclude4pcSet.has(s0)) {
          const c =
            1 +
            (s1 === s0 ? 1 : 0) +
            (s2 === s0 ? 1 : 0) +
            (s3 === s0 ? 1 : 0) +
            (s4 === s0 ? 1 : 0)
          if (c >= 4) return true
        }
        if (s1 && s1 !== s0 && exclude4pcSet.has(s1)) {
          if (s2 === s1 && s3 === s1 && s4 === s1) return true
        }
        return false
      }

      const buildArtifactIds = (
        i0: number,
        i1: number,
        i2: number,
        i3: number,
        i4: number
      ): string[] => {
        const ids: string[] = []
        const id0 = slotArts[0][i0].id
        const id1 = slotArts[1][i1].id
        const id2 = slotArts[2][i2].id
        const id3 = slotArts[3][i3].id
        const id4 = slotArts[4][i4].id
        if (id0) ids.push(id0)
        if (id1) ids.push(id1)
        if (id2) ids.push(id2)
        if (id3) ids.push(id3)
        if (id4) ids.push(id4)
        return ids
      }

      let pendingSkipped = initialSkipped
      const compactLimit = Math.max(8, this.topN * 2)

      const onHit = (
        i0: number,
        i1: number,
        i2: number,
        i3: number,
        i4: number,
        value: number
      ): number => {
        if (isExcluded4pcBuild(i0, i1, i2, i3, i4)) return this.threshold
        const artifactIds = buildArtifactIds(i0, i1, i2, i3, i4)
        if (this.topN === 1) {
          if (this.builds.length === 0 || value >= this.builds[0].value) {
            this.builds[0] = { value, artifactIds }
            this.threshold = value
            this.dirtyTopBuilds = true
          }
          return this.threshold
        }
        this.builds.push({ value, artifactIds })
        this.dirtyTopBuilds = true
        if (this.builds.length >= compactLimit) {
          this.builds.sort((a, b) => b.value - a.value)
          this.builds.length = this.topN
          const nth =
            this.builds[this.topN - 1]?.value ?? Number.NEGATIVE_INFINITY
          if (nth > this.threshold) this.threshold = nth
        }
        return this.threshold
      }

      const onPlotHit = (
        i0: number,
        i1: number,
        i2: number,
        i3: number,
        i4: number,
        value: number,
        plotX: number,
        _curThreshold: number
      ): number => {
        const plotData = this.plotData!
        let build: SolverBuild | undefined
        if (value >= this.threshold) {
          build = { value, artifactIds: buildArtifactIds(i0, i1, i2, i3, i4) }
          this.builds.push(build)
          this.dirtyTopBuilds = true
          if (this.builds.length >= 256) {
            this.builds.sort((a, b) => b.value - a.value)
            this.builds.length = this.topN
            const nth =
              this.builds[this.topN - 1]?.value ?? Number.NEGATIVE_INFINITY
            if (nth > this.threshold) this.threshold = nth
          }
        }
        const existingPlot = plotData[plotX]
        if (!existingPlot || existingPlot.value < value) {
          if (!build) {
            build = {
              value,
              artifactIds: buildArtifactIds(i0, i1, i2, i3, i4),
            }
          }
          build.plot = plotX
          plotData[plotX] = build
        }
        return this.threshold
      }

      const onInterim = (
        testedDelta: number,
        failedDelta: number,
        skippedDelta: number
      ): number => {
        const countObj = {
          tested: testedDelta,
          failed: failedDelta,
          skipped: pendingSkipped + skippedDelta,
        }
        pendingSkipped = 0
        this.interimReport(countObj, this.dirtyTopBuilds)
        return this.threshold
      }

      const [remTested, remFailed, remSkipped] = kernel(
        baseBuf,
        slotBufs[0],
        slotBufs[1],
        slotBufs[2],
        slotBufs[3],
        slotBufs[4],
        suffixMax,
        slotArts[0].length,
        slotArts[1].length,
        slotArts[2].length,
        slotArts[3].length,
        slotArts[4].length,
        minsBuf,
        this.threshold,
        onHit,
        onPlotHit,
        onInterim
      )

      this.interimReport(
        {
          tested: remTested,
          failed: remFailed,
          skipped: pendingSkipped + remSkipped,
        },
        this.dirtyTopBuilds || this.builds.length > oldMaxBuildCount
      )
      return
    }

    // Fallback for non-5-slot synthetic tests
    const compute = precompute(
      nodes,
      preArts.base,
      (f) => f.path[1],
      slotArts.length
    )

    const buffer = Array<ArtifactBuildData>(slotArts.length)
    const count = {
      tested: 0,
      failed: 0,
      skipped: initialSkipped,
    }

    const permute = (i: number) => {
      if (i < 0) {
        const result = compute(buffer)
        if (min.every((m, idx) => m <= result[idx])) {
          const value = result[min.length],
            { builds, plotData } = this
          let build: SolverBuild | undefined
          if (value >= this.threshold) {
            build = {
              value,
              artifactIds: buffer.map((x) => x.id).filter((id) => id),
            }
            builds.push(build)
            this.dirtyTopBuilds = true
          }
          if (plotData) {
            const x = result[min.length + 1]
            if (!plotData[x] || plotData[x]!.value < value) {
              if (!build)
                build = {
                  value,
                  artifactIds: buffer.map((x) => x.id).filter((id) => id),
                }
              build.plot = x
              plotData[x] = build
            }
          }
        } else count.failed += 1
        return
      }
      slotArts[i].forEach((art) => {
        buffer[i] = art
        permute(i - 1)
      })
      if (i === 0) {
        count.tested += slotArts[0].length
        if (count.tested > 1 << 16)
          this.interimReport(count, this.dirtyTopBuilds)
      }
    }

    permute(slotArts.length - 1)
    this.interimReport(
      count,
      this.dirtyTopBuilds || this.builds.length > oldMaxBuildCount
    )
  }

  refresh(force: boolean): void {
    const { topN } = this
    if (Object.keys(this.plotData ?? {}).length >= 100000)
      this.plotData = mergePlot([this.plotData!])

    if (this.builds.length >= 1000 || force) {
      this.builds = this.builds.sort((a, b) => b.value - a.value).slice(0, topN)
      this.buildValues = this.builds.map((x) => x.value)
      this.threshold = Math.max(
        this.threshold,
        this.buildValues[topN - 1] ?? Number.NEGATIVE_INFINITY
      )
      this.dirtyTopBuilds = false
    }
  }
  interimReport(
    count: { tested: number; failed: number; skipped: number },
    forced = false
  ) {
    this.refresh(forced)
    this.callback({
      resultType: 'interim',
      buildValues: this.buildValues,
      ...count,
    })
    this.buildValues = undefined
    count.tested = 0
    count.failed = 0
    count.skipped = 0
  }
}
