import {
  assertUnreachable,
  notEmpty,
  objKeyMap,
  objMap,
  range,
} from '@genshin-optimizer/common/util'
import {
  type ArtifactSetKey,
  type ArtifactSlotKey,
  allArtifactSlotKeys,
} from '@genshin-optimizer/gi/consts'
import type {
  ArtSetExclusion,
  ArtSetExclusionKey,
} from '@genshin-optimizer/gi/db'
import type { ConstantNode, OptNode } from '@genshin-optimizer/gi/wr/opt'
import {
  allOperations,
  constant,
  constantFold,
  dynRead,
  forEachNodes,
  mapFormulas,
  max,
  min,
  precompute,
  sum,
  threshold,
} from '@genshin-optimizer/gi/wr/opt'

type MicropassOperation =
  | 'reaffine'
  | 'pruneArtRange'
  | 'pruneNodeRange'
  | 'pruneOrder'
export function pruneAll(
  nodes: OptNode[],
  minimum: number[],
  arts: ArtifactsBySlot,
  numTop: number,
  exclusion: ArtSetExclusion,
  forced: Partial<Record<MicropassOperation, boolean>>
): { nodes: OptNode[]; arts: ArtifactsBySlot } {
  let should = forced
  /** If `key` makes progress, all operations in `value` should be performed */
  const deps: Record<
    MicropassOperation,
    Partial<Record<MicropassOperation, true>>
  > = {
    pruneOrder: { pruneNodeRange: true },
    pruneArtRange: { pruneNodeRange: true },
    pruneNodeRange: { reaffine: true },
    reaffine: { pruneOrder: true, pruneArtRange: true, pruneNodeRange: true },
  }
  let count = 0
  while (Object.values(should).some((x) => x) && count++ < 20) {
    if (should.pruneOrder) {
      delete should.pruneOrder
      const newArts = pruneOrder(arts, numTop, exclusion)
      if (arts !== newArts) {
        arts = newArts
        should = { ...should, ...deps.pruneOrder }
      }
    }
    if (should.pruneArtRange) {
      delete should.pruneArtRange
      const newArts = pruneArtRange(nodes, arts, minimum)
      if (arts !== newArts) {
        arts = newArts
        should = { ...should, ...deps.pruneArtRange }
      }
    }
    if (should.pruneNodeRange) {
      delete should.pruneNodeRange
      const newNodes = pruneNodeRange(nodes, arts)
      if (nodes !== newNodes) {
        nodes = newNodes
        should = { ...should, ...deps.pruneNodeRange }
      }
    }
    if (should.reaffine) {
      delete should.reaffine
      const { nodes: newNodes, arts: newArts } = reaffine(nodes, arts)
      if (nodes !== newNodes || arts !== newArts) {
        nodes = newNodes
        arts = newArts
        should = { ...should, ...deps.reaffine }
      }
    }
  }
  return { nodes, arts }
}

export function pruneExclusion(
  nodes: OptNode[],
  exclusion: ArtSetExclusion
): OptNode[] {
  const maxValues: Partial<Record<keyof typeof exclusion, number>> = {}
  for (const [key, e] of Object.entries(exclusion)) {
    if (!e.includes(4)) continue
    maxValues[key] = e.includes(2) ? 1 : 3
  }
  return mapFormulas(
    nodes,
    (f) => f,
    (f) => {
      if (f.operation !== 'threshold') return f

      const [v, t, pass, fail] = f.operands
      if (v.operation === 'read' && t.operation === 'const') {
        const key = v.path[v.path.length - 1],
          thres = t.value
        if (key in maxValues) {
          const max: number = maxValues[key as keyof typeof maxValues] ?? 0
          if (max < thres) return fail
          if (
            thres === 2 &&
            (exclusion[key as keyof typeof exclusion] ?? []).includes(2)
          )
            return threshold(v, 4, pass, fail)
        }
      }
      return f
    }
  )
}

function reaffine(
  nodes: OptNode[],
  arts: ArtifactsBySlot,
  forceRename = false
): { nodes: OptNode[]; arts: ArtifactsBySlot } {
  const affineNodes = new Set<OptNode>(),
    topLevelAffine = new Set<OptNode>()

  function visit(node: OptNode, isAffine: boolean): OptNode {
    if (isAffine) affineNodes.add(node)
    else
      node.operands.forEach(
        (op) => affineNodes.has(op) && topLevelAffine.add(op)
      )
    return node
  }

  const dynKeys = new Set<string>()

  nodes = mapFormulas(
    nodes,
    (_) => _,
    (f) => {
      const { operation } = f
      switch (operation) {
        case 'read':
          dynKeys.add(f.path[1])
          return visit(f, true)
        case 'add': {
          const affineOps = f.operands.filter((op) => affineNodes.has(op))
          const nonAffineOps = f.operands.filter((op) => !affineNodes.has(op))
          if (nonAffineOps.length === 0) return visit(f, true)
          if (affineOps.length <= 1) return visit(f, false)
          const affine = visit(sum(...affineOps), true)
          return visit(sum(affine, ...nonAffineOps), false)
        }
        case 'mul': {
          const nonConst = f.operands.filter((op) => op.operation !== 'const')
          return visit(
            f,
            nonConst.length === 0 ||
              (nonConst.length === 1 && affineNodes.has(nonConst[0]))
          )
        }
        case 'const':
          return visit(f, true)
        case 'res':
        case 'threshold':
        case 'sum_frac':
        case 'max':
        case 'min':
          return visit(f, false)
        default:
          assertUnreachable(operation)
      }
    }
  )

  nodes
    .filter((node) => affineNodes.has(node))
    .forEach((node) => topLevelAffine.add(node))
  if (
    [...topLevelAffine].every(
      ({ operation }) => operation === 'read' || operation === 'const'
    ) &&
    Object.keys(arts.base).length === dynKeys.size
  )
    return { nodes, arts }

  let current = -1
  function nextDynKey(): string {
    while (dynKeys.has(`${++current}`));
    return `${current}`
  }

  const affine = [...topLevelAffine].filter((f) => f.operation !== 'const')
  const affineMap = new Map(
    affine.map((node) => [
      node as OptNode,
      !forceRename && node.operation === 'read' && node.path[0] === 'dyn'
        ? node
        : dynRead(nextDynKey()),
    ])
  )
  nodes = mapFormulas(
    nodes,
    (f) => affineMap.get(f) ?? f,
    (f) => f
  )

  const affineNodesList = [...affineMap.keys()]
  const targetKeys = [...affineMap.values()].map((v) => v.path[1])
  let hasNonFiniteConst = false
  forEachNodes(
    affineNodesList,
    (f) => {
      if (f.operation === 'const' && !Number.isFinite(f.value)) {
        hasNonFiniteConst = true
      }
    },
    () => {}
  )

  if (hasNonFiniteConst) {
    function reaffineArtFallback(stat: DynStat): DynStat {
      const values = constantFold(
        affineNodesList,
        {
          dyn: objMap(stat, (value) => constant(value)),
        } as any,
        (_) => true
      )
      return Object.fromEntries(
        targetKeys.map((k, i) => [k, (values[i] as ConstantNode<number>).value])
      )
    }
    const result = {
      nodes,
      arts: {
        base: reaffineArtFallback(arts.base),
        values: objKeyMap(allArtifactSlotKeys, (slot) =>
          arts.values[slot].map(({ id, set, values }) => ({
            id,
            set,
            values: reaffineArtFallback(values),
          }))
        ),
      },
    }
    const offsets = Object.entries(reaffineArtFallback({}))
    for (const slotArts of Object.values(result.arts.values))
      for (const { values } of slotArts)
        for (const [key, baseValue] of offsets) values[key] -= baseValue
    return result
  }

  const evalAffine = precompute(affineNodesList, {}, (f) => f.path[1], 1)
  const zeroOffsets = evalAffine([{ values: {} }])
  const numTargets = targetKeys.length

  const baseEval = evalAffine([{ values: arts.base }])
  const newBase: DynStat = {}
  for (let i = 0; i < numTargets; i++) {
    newBase[targetKeys[i]] = baseEval[i]
  }

  const singleSlotArg = [{ values: {} as DynStat }] as const
  const newValues = objKeyMap(allArtifactSlotKeys, (slot) =>
    arts.values[slot].map(({ id, set, values }) => {
      ;(singleSlotArg as unknown as [{ values: DynStat }])[0].values = values
      const evaluated = evalAffine(singleSlotArg)
      const out: DynStat = {}
      for (let i = 0; i < numTargets; i++) {
        out[targetKeys[i]] = evaluated[i] - zeroOffsets[i]
      }
      return { id, set, values: out }
    })
  )

  return {
    nodes,
    arts: {
      base: newBase,
      values: newValues,
    },
  }
}
/** Remove artifacts that cannot be in top `numTop` builds */
function pruneOrder(
  arts: ArtifactsBySlot,
  numTop: number,
  exclusion: ArtSetExclusion
): ArtifactsBySlot {
  let progress = false
  /**
   * Note:
   * This function assumes that every base (reaffined) stats are monotonically increasing. That is, artifacts
   * with higher stats are better. This remains true as long as the main and substats are in increasing. Set
   * effects that decrease enemy resistance (which is monotonically decreasing) does not violate this assumption
   * as set effects are not handled here.
   */
  const allowRainbow = !exclusion.rainbow?.length,
    keys = Object.keys(arts.base),
    numKeys = keys.length
  const noSwitchIn = new Set(
    Object.entries(exclusion)
      .filter(([_, v]) => v.length)
      .map(([k]) => k) as ArtifactSetKey[]
  )
  const noSwitchOut = new Set(
    Object.entries(exclusion)
      .filter(([_, v]) => v.includes(2) && !v.includes(4))
      .map(([k]) => k) as ArtifactSetKey[]
  )
  const values = objKeyMap(allArtifactSlotKeys, (slot) => {
    const list = arts.values[slot]
    const n = list.length
    if (n <= numTop) return list

    // Pack stat values into a flat contiguous Float64Array for fast cache-local dominance checks
    const matrix = new Float64Array(n * numKeys)
    const canSwitchInArr = new Uint8Array(n)
    const canSwitchOutArr = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const art = list[i]
      const baseOff = i * numKeys
      for (let k = 0; k < numKeys; k++) {
        matrix[baseOff + k] = art.values[keys[k]] ?? 0
      }
      canSwitchInArr[i] = allowRainbow && !noSwitchIn.has(art.set!) ? 1 : 0
      canSwitchOutArr[i] = allowRainbow && !noSwitchOut.has(art.set!) ? 1 : 0
    }

    const newList: ArtifactBuildData[] = []
    for (let i = 0; i < n; i++) {
      const art = list[i]
      const artOff = i * numKeys
      const artSwitchOut = canSwitchOutArr[i]
      let dominatedCount = 0
      let keep = true

      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const other = list[j]
        const canSwitch =
          (artSwitchOut && canSwitchInArr[j]) || art.set === other.set
        if (!canSwitch) continue

        const otherOff = j * numKeys
        let betterEqual = true
        let strictlyBetter = false
        for (let k = 0; k < numKeys; k++) {
          const ov = matrix[otherOff + k]
          const av = matrix[artOff + k]
          if (ov < av) {
            betterEqual = false
            break
          }
          if (ov > av) strictlyBetter = true
        }
        if (betterEqual && (strictlyBetter || other.id > art.id)) {
          dominatedCount++
          if (dominatedCount >= numTop) {
            keep = false
            break
          }
        }
      }

      if (keep) newList.push(art)
    }

    if (newList.length !== n) progress = true
    return newList
  })
  return progress ? { base: arts.base, values } : arts
}
function evalResScalar(r: number): number {
  if (r < 0) return 1 - r / 2
  if (r >= 0.75) return 1 / (r * 4 + 1)
  return 1 - r
}

/** Remove artifacts that cannot reach `minimum` in any build */
function pruneArtRange(
  nodes: OptNode[],
  arts: ArtifactsBySlot,
  minimum: number[]
): ArtifactsBySlot {
  let hasPotentialZeroDiv = false
  forEachNodes(
    nodes,
    (f) => {
      if (f.operation === 'sum_frac') {
        const denom = f.operands[1]
        if (denom.operation !== 'const' || denom.value <= 0) {
          hasPotentialZeroDiv = true
        }
      }
    },
    () => {}
  )

  const activeNodes: OptNode[] = []
  const activeMins: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    const m = minimum[i] ?? Number.NEGATIVE_INFINITY
    if (hasPotentialZeroDiv || m > Number.NEGATIVE_INFINITY) {
      activeNodes.push(nodes[i])
      activeMins.push(m)
    }
  }
  if (activeNodes.length === 0) return arts

  for (let s = 0; s < 5; s++) {
    if (arts.values[allArtifactSlotKeys[s]].length === 0) {
      return {
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

  // Index ONLY `dyn` keys actually read by `activeNodes`
  const keyToIdx = new Map<string, number>()
  const keys: string[] = []
  const ensureKey = (k: string): number => {
    let idx = keyToIdx.get(k)
    if (idx === undefined) {
      idx = keys.length
      keyToIdx.set(k, idx)
      keys.push(k)
    }
    return idx
  }

  // Flatten `activeNodes` into post-order integer bytecode
  const topo: OptNode[] = []
  const nodeToIdx = new Map<OptNode, number>()
  forEachNodes(
    activeNodes,
    () => {},
    (f) => {
      if (f.operation === 'read') {
        if (f.path[0] !== 'dyn')
          throw new Error(`Found non-dyn path ${f.path} while computing range`)
        ensureKey(f.path[1])
      }
      nodeToIdx.set(f, topo.length)
      topo.push(f)
    }
  )

  const K = keys.length
  const M = topo.length
  const opCodes = new Uint8Array(M)
  const opAux = new Int32Array(M)
  const opLen = new Int32Array(M)
  const constVals = new Float64Array(M)
  const flatOperandsList: number[] = []

  // OpCodes: 0=read, 1=const, 2=add, 3=min, 4=max, 5=res, 6=mul, 7=threshold, 8=sum_frac
  for (let i = 0; i < M; i++) {
    const f = topo[i]
    switch (f.operation) {
      case 'read':
        opCodes[i] = 0
        opAux[i] = keyToIdx.get(f.path[1])!
        break
      case 'const':
        opCodes[i] = 1
        constVals[i] = f.value
        break
      case 'add':
      case 'min':
      case 'max':
      case 'res':
      case 'mul':
      case 'threshold':
      case 'sum_frac': {
        opCodes[i] =
          f.operation === 'add'
            ? 2
            : f.operation === 'min'
              ? 3
              : f.operation === 'max'
                ? 4
                : f.operation === 'res'
                  ? 5
                  : f.operation === 'mul'
                    ? 6
                    : f.operation === 'threshold'
                      ? 7
                      : 8
        opAux[i] = flatOperandsList.length
        opLen[i] = f.operands.length
        for (let j = 0; j < f.operands.length; j++) {
          flatOperandsList.push(nodeToIdx.get(f.operands[j])!)
        }
        break
      }
      default:
        assertUnreachable(f.operation)
    }
  }
  const flatOps = Int32Array.from(flatOperandsList)
  const rootIndices = Int32Array.from(activeNodes.map((n) => nodeToIdx.get(n)!))
  const rootMins = Float64Array.from(activeMins)
  const numRoots = rootIndices.length

  const nMin = new Float64Array(M)
  const nMax = new Float64Array(M)

  const checkBoxFeasible = (
    kMin: Float64Array,
    kMax: Float64Array
  ): boolean => {
    for (let i = 0; i < M; i++) {
      switch (opCodes[i]) {
        case 0: {
          const rk = opAux[i]
          nMin[i] = kMin[rk]
          nMax[i] = kMax[rk]
          break
        }
        case 1: {
          const cv = constVals[i]
          nMin[i] = cv
          nMax[i] = cv
          break
        }
        case 2: {
          const start = opAux[i]
          const end = start + opLen[i]
          let mn = 0
          let mx = 0
          for (let j = start; j < end; j++) {
            const o = flatOps[j]
            mn += nMin[o]
            mx += nMax[o]
          }
          nMin[i] = mn
          nMax[i] = mx
          break
        }
        case 3: {
          const start = opAux[i]
          const end = start + opLen[i]
          let mn = Number.POSITIVE_INFINITY
          let mx = Number.POSITIVE_INFINITY
          for (let j = start; j < end; j++) {
            const o = flatOps[j]
            const omn = nMin[o]
            const omx = nMax[o]
            mn = omn < mn || Number.isNaN(omn) ? omn : mn
            mx = omx < mx || Number.isNaN(omx) ? omx : mx
          }
          nMin[i] = mn
          nMax[i] = mx
          break
        }
        case 4: {
          const start = opAux[i]
          const end = start + opLen[i]
          let mn = Number.NEGATIVE_INFINITY
          let mx = Number.NEGATIVE_INFINITY
          for (let j = start; j < end; j++) {
            const o = flatOps[j]
            const omn = nMin[o]
            const omx = nMax[o]
            mn = omn > mn || Number.isNaN(omn) ? omn : mn
            mx = omx > mx || Number.isNaN(omx) ? omx : mx
          }
          nMin[i] = mn
          nMax[i] = mx
          break
        }
        case 5: {
          const o = flatOps[opAux[i]]
          nMin[i] = evalResScalar(nMax[o])
          nMax[i] = evalResScalar(nMin[o])
          break
        }
        case 6: {
          const start = opAux[i]
          const end = start + opLen[i]
          const o0 = flatOps[start]
          let mn = nMin[o0]
          let mx = nMax[o0]
          for (let j = start + 1; j < end; j++) {
            const o = flatOps[j]
            const cmn = nMin[o]
            const cmx = nMax[o]
            const p1 = mn * cmn
            const p2 = mn * cmx
            const p3 = mx * cmn
            const p4 = mx * cmx
            mn = Math.min(p1, p2, p3, p4)
            mx = Math.max(p1, p2, p3, p4)
          }
          nMin[i] = mn
          nMax[i] = mx
          break
        }
        case 7: {
          const start = opAux[i]
          const v = flatOps[start]
          const t = flatOps[start + 1]
          const p = flatOps[start + 2]
          const fl = flatOps[start + 3]
          if (nMin[v] >= nMax[t]) {
            nMin[i] = nMin[p]
            nMax[i] = nMax[p]
          } else if (nMax[v] < nMin[t]) {
            nMin[i] = nMin[fl]
            nMax[i] = nMax[fl]
          } else {
            nMin[i] = Math.min(nMin[p], nMin[fl])
            nMax[i] = Math.max(nMax[p], nMax[fl])
          }
          break
        }
        case 8: {
          const start = opAux[i]
          const x = flatOps[start]
          const c = flatOps[start + 1]
          const xmn = nMin[x]
          const xmx = nMax[x]
          const smn = xmn + nMin[c]
          const smx = xmx + nMax[c]
          if (smn <= 0 && smx >= 0) {
            if (xmn <= 0 && xmx >= 0) {
              nMin[i] = Number.NaN
              nMax[i] = Number.NaN
            } else {
              nMin[i] = Number.NEGATIVE_INFINITY
              nMax[i] = Number.POSITIVE_INFINITY
            }
          } else {
            const q1 = xmn / smn
            const q2 = xmn / smx
            const q3 = xmx / smn
            const q4 = xmx / smx
            nMin[i] = Math.min(q1, q2, q3, q4)
            nMax[i] = Math.max(q1, q2, q3, q4)
          }
          break
        }
      }
    }

    for (let r = 0; r < numRoots; r++) {
      if (!(nMax[rootIndices[r]] >= rootMins[r])) return false
    }
    return true
  }

  const baseVec = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    baseVec[k] = arts.base[keys[k]] ?? 0
  }

  // Pre-pack per-slot artifact vectors once
  let slotArts = allArtifactSlotKeys.map((s) => arts.values[s])
  let slotMats = slotArts.map((list) => {
    const mat = new Float64Array(list.length * K)
    for (let i = 0; i < list.length; i++) {
      const vals = list[i].values
      const off = i * K
      for (let k = 0; k < K; k++) {
        mat[off + k] = vals[keys[k]] ?? 0
      }
    }
    return mat
  })

  const slotMin = new Float64Array(5 * K)
  const slotMax = new Float64Array(5 * K)
  const fullMin = new Float64Array(K)
  const fullMax = new Float64Array(K)
  const otherMin = new Float64Array(K)
  const otherMax = new Float64Array(K)
  const curMin = new Float64Array(K)
  const curMax = new Float64Array(K)

  let anyChanged = false
  while (true) {
    for (let s = 0; s < 5; s++) {
      const n = slotArts[s].length
      if (n === 0) {
        return {
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
      const mat = slotMats[s]
      const sOff = s * K
      for (let k = 0; k < K; k++) {
        slotMin[sOff + k] = mat[k]
        slotMax[sOff + k] = mat[k]
      }
      for (let i = 1; i < n; i++) {
        const off = i * K
        for (let k = 0; k < K; k++) {
          const v = mat[off + k]
          if (v < slotMin[sOff + k]) slotMin[sOff + k] = v
          if (v > slotMax[sOff + k]) slotMax[sOff + k] = v
        }
      }
    }

    for (let k = 0; k < K; k++) {
      fullMin[k] =
        baseVec[k] +
        slotMin[k] +
        slotMin[K + k] +
        slotMin[2 * K + k] +
        slotMin[3 * K + k] +
        slotMin[4 * K + k]
      fullMax[k] =
        baseVec[k] +
        slotMax[k] +
        slotMax[K + k] +
        slotMax[2 * K + k] +
        slotMax[3 * K + k] +
        slotMax[4 * K + k]
    }

    // O(1) whole-box early exit before per-artifact scans
    if (!checkBoxFeasible(fullMin, fullMax)) {
      return {
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

    let progress = false
    const nextSlotArts: typeof slotArts = [[], [], [], [], []]
    const nextSlotMats: Float64Array[] = []

    for (let s = 0; s < 5; s++) {
      for (let k = 0; k < K; k++) {
        let omn = baseVec[k]
        let omx = baseVec[k]
        for (let s2 = 0; s2 < 5; s2++) {
          if (s2 !== s) {
            omn += slotMin[s2 * K + k]
            omx += slotMax[s2 * K + k]
          }
        }
        otherMin[k] = omn
        otherMax[k] = omx
      }

      const list = slotArts[s]
      const mat = slotMats[s]
      const n = list.length
      const keptIdx: number[] = []

      for (let i = 0; i < n; i++) {
        const off = i * K
        for (let k = 0; k < K; k++) {
          const v = mat[off + k]
          curMin[k] = otherMin[k] + v
          curMax[k] = otherMax[k] + v
        }
        if (checkBoxFeasible(curMin, curMax)) {
          keptIdx.push(i)
        }
      }

      if (keptIdx.length === n) {
        nextSlotArts[s] = list
        nextSlotMats.push(mat)
      } else {
        progress = true
        anyChanged = true
        if (keptIdx.length === 0) {
          return {
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
        const newList = new Array<ArtifactBuildData>(keptIdx.length)
        const newMat = new Float64Array(keptIdx.length * K)
        for (let j = 0; j < keptIdx.length; j++) {
          const srcIdx = keptIdx[j]
          newList[j] = list[srcIdx]
          newMat.set(mat.subarray(srcIdx * K, (srcIdx + 1) * K), j * K)
        }
        nextSlotArts[s] = newList
        nextSlotMats.push(newMat)
      }
    }

    if (!progress) break
    slotArts = nextSlotArts
    slotMats = nextSlotMats
  }

  if (!anyChanged) return arts
  return {
    base: arts.base,
    values: {
      flower: slotArts[0],
      plume: slotArts[1],
      sands: slotArts[2],
      goblet: slotArts[3],
      circlet: slotArts[4],
    },
  }
}
function pruneNodeRange(nodes: OptNode[], arts: ArtifactsBySlot): OptNode[] {
  const baseRange = Object.fromEntries(
    Object.entries(arts.base).map(([key, x]) => [key, { min: x, max: x }])
  )
  const reads = addArtRange([
    baseRange,
    ...Object.values(arts.values).map((values) => computeArtRange(values)),
  ])
  const nodeRange = computeNodeRange(nodes, reads)

  return mapFormulas(
    nodes,
    (f) => {
      {
        const { min, max } = nodeRange.get(f)!
        if (min === max) return constant(min)
      }
      const { operation } = f
      const operandRanges = f.operands.map((x) => nodeRange.get(x)!)
      switch (operation) {
        case 'threshold': {
          const [value, threshold, pass, fail] = operandRanges
          if (value.min >= threshold.max) return f.operands[2]
          else if (value.max < threshold.min) return f.operands[3]
          if (
            pass.max === pass.min &&
            fail.max === fail.min &&
            pass.min === fail.min &&
            Number.isFinite(pass.min)
          )
            return constant(pass.max)
          break
        }
        case 'min': {
          const newOperands = f.operands.filter((_, i) => {
            const op1 = operandRanges[i]
            return operandRanges.every((op2) => op1.min <= op2.max)
          })
          if (newOperands.length < operandRanges.length)
            return min(...newOperands)
          break
        }
        case 'max': {
          const newOperands = f.operands.filter((_, i) => {
            const op1 = operandRanges[i]
            return operandRanges.every((op2) => op1.max >= op2.min)
          })
          if (newOperands.length < operandRanges.length)
            return max(...newOperands)
          break
        }
      }
      return f
    },
    (f) => f
  )
}
function addArtRange(ranges: DynMinMax[]): DynMinMax {
  const result: DynMinMax = {}
  ranges.forEach((range) => {
    Object.entries(range).forEach(([key, value]) => {
      if (result[key]) {
        result[key].min += value.min
        result[key].max += value.max
      } else result[key] = { ...value }
    })
  })
  return result
}
function computeArtRange(arts: ArtifactBuildData[]): DynMinMax {
  const result: DynMinMax = {}
  if (arts.length) {
    Object.keys(arts[0].values)
      .filter((key) => arts.every((art) => art.values[key]))
      .forEach(
        (key) =>
          (result[key] = { min: arts[0].values[key], max: arts[0].values[key] })
      )
    arts.forEach(({ values }) => {
      for (const [key, value] of Object.entries(values)) {
        if (!result[key]) result[key] = { min: 0, max: value }
        else {
          if (result[key].max < value) result[key].max = value
          if (result[key].min > value) result[key].min = value
        }
      }
    })
  }
  return result
}
export function computeFullArtRange(arts: ArtifactsBySlot): DynMinMax {
  const baseRange = Object.fromEntries(
    Object.entries(arts.base).map(([key, x]) => [key, { min: x, max: x }])
  )
  return addArtRange([
    baseRange,
    ...Object.values(arts.values).map((values) => computeArtRange(values)),
  ])
}
export function computeNodeRange(
  nodes: OptNode[],
  reads: DynMinMax
): Map<OptNode, MinMax> {
  const range = new Map<OptNode, MinMax>()

  forEachNodes(
    nodes,
    (_) => {},
    (f) => {
      const { operation } = f
      const operands = f.operands.map((op) => range.get(op)!)
      let current: MinMax
      switch (operation) {
        case 'read':
          if (f.path[0] !== 'dyn')
            throw new Error(
              `Found non-dyn path ${f.path} while computing range`
            )
          current = reads[f.path[1]] ?? { min: 0, max: 0 }
          break
        case 'const':
          current = computeMinMax([f.value])
          break
        case 'add':
        case 'min':
        case 'max':
          current = {
            min: allOperations[operation](operands.map((x) => x.min)),
            max: allOperations[operation](operands.map((x) => x.max)),
          }
          break
        case 'res':
          current = {
            min: allOperations[operation]([operands[0].max]),
            max: allOperations[operation]([operands[0].min]),
          }
          break
        case 'mul':
          current = operands.reduce((accu, current) =>
            computeMinMax([
              accu.min * current.min,
              accu.min * current.max,
              accu.max * current.min,
              accu.max * current.max,
            ])
          )
          break
        case 'threshold':
          if (operands[0].min >= operands[1].max) current = operands[2]
          else if (operands[0].max < operands[1].min) current = operands[3]
          else current = computeMinMax([], [operands[2], operands[3]])
          break
        case 'sum_frac': {
          const [x, c] = operands,
            sum = { min: x.min + c.min, max: x.max + c.max }
          if (sum.min <= 0 && sum.max >= 0)
            current =
              x.min <= 0 && x.max >= 0
                ? { min: Number.NaN, max: Number.NaN }
                : {
                    min: Number.NEGATIVE_INFINITY,
                    max: Number.POSITIVE_INFINITY,
                  }
          // TODO: Check this
          else
            current = computeMinMax([
              x.min / sum.min,
              x.min / sum.max,
              x.max / sum.min,
              x.max / sum.max,
            ])
          break
        }
        default:
          assertUnreachable(operation)
      }
      range.set(f, current)
    }
  )
  return range
}
function computeMinMax(
  values: readonly number[],
  minMaxes: readonly MinMax[] = []
): MinMax {
  const max = Math.max(...values, ...minMaxes.map((x) => x.max))
  const min = Math.min(...values, ...minMaxes.map((x) => x.min))
  return { min, max }
}

export function filterArts(
  arts: ArtifactsBySlot,
  filters: RequestFilter
): ArtifactsBySlot {
  return {
    base: arts.base,
    values: objKeyMap(allArtifactSlotKeys, (slot) => {
      const filter = filters[slot]
      switch (filter.kind) {
        case 'id':
          return arts.values[slot].filter((art) => filter.ids.has(art.id))
        case 'exclude':
          return arts.values[slot].filter((art) => !filter.sets.has(art.set!))
        case 'required':
          return arts.values[slot].filter((art) => filter.sets.has(art.set!))
      }
    }),
  }
}

export function mergeBuilds(
  builds: SolverBuild[][],
  maxNum: number
): SolverBuild[] {
  return builds
    .flat()
    .sort((a, b) => b.value - a.value)
    .slice(0, maxNum)
}
export function mergePlot(plots: PlotData[]): PlotData {
  let scale = 0.01
  const reductionScaling = 2,
    maxCount = 1500
  let keys = new Set(
    plots.flatMap((x) =>
      Object.values(x).map((v) => v && Math.round(v.plot! / scale))
    )
  )
  while (keys.size > maxCount) {
    scale *= reductionScaling
    keys = new Set(
      [...keys]
        .filter(notEmpty)
        .map((key) => Math.round(key / reductionScaling))
    )
  }
  const result: PlotData = {}
  for (const plot of plots)
    for (const build of Object.values(plot)) {
      if (!build) continue
      const x = Math.round(build.plot! / scale) * scale
      if (!result[x] || result[x]!.value < build.value) result[x] = build
    }
  return result
}

export function countBuilds(arts: ArtifactsBySlot): number {
  return allArtifactSlotKeys.reduce(
    (_count, slot) => _count * arts.values[slot].length,
    1
  )
}

export function* filterFeasiblePerm(
  filters: Iterable<RequestFilter>,
  _artSets: ArtifactsBySlot
): Iterable<RequestFilter> {
  const artSets = objMap(
    _artSets.values,
    (values) => new Set(values.map((v) => v.set))
  )
  filter_loop: for (const filter of filters) {
    for (const [slot, f] of Object.entries(filter)) {
      const available = artSets[slot]!
      switch (f.kind) {
        case 'required':
          if ([...f.sets].every((s) => !available.has(s))) continue filter_loop
          break
        case 'exclude':
          if ([...available].every((s) => f.sets.has(s!))) continue filter_loop
          break
        case 'id':
          break
      }
    }
    yield filter
  }
}
export function exclusionToAllowed(
  exclusion: number[] | undefined
): Set<number> {
  return new Set(
    exclusion?.includes(2)
      ? exclusion.includes(4)
        ? [0, 1]
        : [0, 1, 4, 5]
      : exclusion?.includes(4)
        ? [0, 1, 2, 3]
        : [0, 1, 2, 3, 4, 5]
  )
}
/** A *disjoint* set of `RequestFilter` satisfying the exclusion rules */
export function* artSetPerm(
  exclusion: ArtSetExclusion,
  artSets: Set<ArtifactSetKey>
): Iterable<RequestFilter> {
  /**
   * This generation algorithm is separated into two parts:
   * - "Shape" generation
   *   - It first generates all build "shapes", e.g., AABBC, ABBCD
   *   - It then filters the generated shapes according to the rainbow exclusion, e.g., removes ABBCD if excluding 3 rainbows
   *   - It then merges the remaining shapes into wildcards, e.g. AABAA + AABAB + AABAC => AABA*
   * - Shape filling
   *   - From the given shapes, it tries to fill in all non-rainbow slots, e.g., slots A and B of AABBC, with actual artifacts
   *   - It then fills the rainbow slots, e.g., slot C of AABBC while ensuring the exclusion rule of each sets
   */
  const allowedRainbows = exclusionToAllowed(exclusion.rainbow)
  let shapes: number[][] = []
  function populateShapes(
    current: number[],
    list: Set<number>,
    rainbows: number[]
  ) {
    if (current.length === 5) {
      if (allowedRainbows.has(rainbows.length)) shapes.push(current)
      return
    }
    for (const i of list)
      populateShapes(
        [...current, i],
        list,
        rainbows.filter((j) => j !== i)
      )
    populateShapes(
      [...current, current.length],
      new Set([...list, current.length]),
      [...rainbows, current.length]
    )
  }
  populateShapes([0], new Set([0]), [0])
  function indexOfShape(shape: number[], replacing: number) {
    if (range(replacing + 1, 4).some((i) => shape[i] !== 5)) return undefined
    shape = [...shape]
    shape[replacing] = 5
    return shape.reduce((a, b) => a * 6 + b, 0)
  }
  for (let replacing = 4; replacing >= 0; replacing--) {
    const required: Map<number, number> = new Map()
    for (const shape of shapes) {
      const id = indexOfShape(shape, replacing)
      if (id === undefined) continue
      required.set(
        id,
        (required.get(id) ?? new Set(shape.slice(0, replacing)).size + 1) - 1
      )
    }
    for (const [id, remaining] of required.entries()) {
      if (remaining === 0) {
        const shape = [
          ...shapes.find((shape) => indexOfShape(shape, replacing) === id)!,
        ]
        shape[replacing] = 5
        shapes = shapes.filter((shape) => indexOfShape(shape, replacing) !== id)
        shapes.push(shape)
      }
    }
  }

  // Shapes are now calculated and merged, proceed to fill in the sets

  const noFilter = { kind: 'exclude' as const, sets: new Set<ArtifactSetKey>() }
  const result: RequestFilter = objKeyMap(allArtifactSlotKeys, (_) => noFilter)

  const counts = {
    ...objMap(exclusion as Record<ArtSetExclusionKey, (2 | 4)[]>, (_) => 0),
    ...objKeyMap([...artSets], () => 0),
  }
  const allowedCounts = objMap(
    exclusion as Record<ArtSetExclusionKey, (2 | 4)[]>,
    exclusionToAllowed
  )

  function* check(shape: number[]) {
    const used: Set<ArtifactSetKey> = new Set(),
      rainbows: number[] = []
    let groupped: number[][] = []
    for (const i of shape) {
      groupped.push([])
      if (i === 5) rainbows.push(groupped.length - 1)
      else groupped[i].push(groupped.length - 1)
    }
    groupped = groupped
      .filter((v) => v.length)
      .sort((a, b) => b.length - a.length)
    let usableRainbows = rainbows.length

    // Inception.. because js doesn't like functions inside a for-loop
    function* check(i: number): IterableIterator<RequestFilter> {
      if (i === groupped.length) return yield* check_free(0)

      for (const set of artSets) {
        if (used.has(set)) continue
        const length = groupped[i].length,
          allowedSet = allowedCounts[set as ArtSetExclusionKey]
        let requiredRainbows = 0

        if (allowedSet && !allowedSet.has(length)) {
          // Look ahead and see if we have enough rainbows to fill to the next `allowedSet` if we use the current set
          requiredRainbows =
            (range(length + 1, 5).find((l) => allowedSet.has(l)) ?? 6) - length
          if (requiredRainbows > usableRainbows) continue // Not enough rainbows. Next..
        }

        used.add(set)
        counts[set] = groupped[i].length
        groupped[i].forEach(
          (j) =>
            (result[allArtifactSlotKeys[j]] = {
              kind: 'required',
              sets: new Set([set]),
            })
        )
        usableRainbows -= requiredRainbows

        yield* check(i + 1)

        usableRainbows += requiredRainbows
        counts[set] = 0
        used.delete(set)
      }
    }
    // We separate filling rainbow slots from groupped slots because it has an entirely
    // different set of rules regarding what can be filled and what states to be kept.
    function* check_free(i: number): IterableIterator<RequestFilter> {
      const remaining = rainbows.length - i,
        isolated: ArtifactSetKey[] = [],
        missing: ArtifactSetKey[] = [],
        rejected: ArtifactSetKey[] = []
      let required = 0
      for (const set of artSets) {
        const allowedSet = allowedCounts[set as ArtSetExclusionKey],
          count = counts[set]
        if (!allowedSet) continue
        if (range(1, remaining).every((j) => !allowedSet.has(count + j)))
          rejected.push(set)
        else if (!allowedSet.has(count)) {
          required += [...allowedSet].find((x) => x > count)! - count
          missing.push(set)
        } else if (range(0, remaining).some((j) => !allowedSet.has(count + j)))
          isolated.push(set)
      }
      if (required > remaining) return
      if (i === rainbows.length) {
        yield { ...result }
        return
      }
      if (required === remaining) {
        for (const set of missing) {
          counts[set]++
          result[allArtifactSlotKeys[rainbows[i]]] = {
            kind: 'required',
            sets: new Set([set]),
          }
          yield* check_free(i + 1)
          counts[set]--
        }
        return
      }
      for (const set of [...isolated, ...missing]) {
        counts[set]++
        result[allArtifactSlotKeys[rainbows[i]]] = {
          kind: 'required',
          sets: new Set([set]),
        }
        yield* check_free(i + 1)
        counts[set]--
      }
      result[allArtifactSlotKeys[rainbows[i]]] = {
        kind: 'exclude',
        sets: new Set([...missing, ...rejected, ...isolated]),
      }
      yield* check_free(i + 1)
    }
    yield* check(0)
  }
  for (const shape of shapes) yield* check(shape)
}

export type RequestFilter = Record<
  ArtifactSlotKey,
  | { kind: 'required'; sets: Set<ArtifactSetKey> }
  | { kind: 'exclude'; sets: Set<ArtifactSetKey> }
  | { kind: 'id'; ids: Set<string> }
> & {
  exclude4pc?: ArtifactSetKey[]
}

export type DynStat = { [key in string]: number }
export type ArtifactBuildData = {
  id: string
  set?: ArtifactSetKey
  values: DynStat
}
export type ArtifactsBySlot = {
  base: DynStat
  values: Record<ArtifactSlotKey, ArtifactBuildData[]>
}

export type PlotData = Partial<Record<number, SolverBuild>>
export interface SolverBuild {
  value: number
  plot?: number
  artifactIds: string[]
}

export type DynMinMax = { [key in string]: MinMax }
export type MinMax = { min: number; max: number }
