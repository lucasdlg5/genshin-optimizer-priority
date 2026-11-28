import { objMap } from '@genshin-optimizer/common/util'
import type { SubstatKey } from '@genshin-optimizer/gi/consts'
import {
  allSubstatKeys,
  artSubstatRollData,
} from '@genshin-optimizer/gi/consts'
import type { BuildTc } from '@genshin-optimizer/gi/db'
import {
  compileOptNodesToWgsl,
  ensureStatsBufferCapacity,
  GPU_MAX_HITS,
  GPU_OUT_META_U32S,
  GPUMapModeFlags,
  getSolverGpuContext,
  isWebGPUSupported,
  WGSL_ITEMS_PER_WORKGROUP,
} from '@genshin-optimizer/gi/solver/gpu'
import { getSubstatValue } from '@genshin-optimizer/gi/util'
import type { NumNode, OptNode } from '@genshin-optimizer/gi/wr/opt'
import { forEachNodes, precompute } from '@genshin-optimizer/gi/wr/opt'

export type TCWorkerResult = TotalResult | CountResult | FinalizeResult

export interface TotalResult {
  resultType: 'total'
  total: number
}
export interface CountResult {
  resultType: 'count'
  tested: number // tested, including `failed`
  failed: number // tested but fail the filter criteria, e.g., not enough EM
  skipped: number // failed feasibility check
}

export interface FinalizeResult {
  resultType: 'finalize'
  found: boolean // whether any substat distribution satisfied every constraint
  maxBuffer: Partial<Record<SubstatKey, number>>
  maxBufferRolls: Partial<Record<SubstatKey, number>>
  distributed: number
  tested: number
  failed: number
  skipped: number
}

export function getMinSubAndOtherRolls(charTC: BuildTc) {
  const {
    artifact: {
      slots,
      substats: { stats: substats, type: substatsType, rarity },
    },
  } = charTC
  const existingRolls = objMap(substats, (_v, k) =>
    Math.ceil(substats[k] / getSubstatValue(k, rarity, substatsType))
  )
  const mainStatsCount = getMainStatsCount(slots)
  const minSubLines = getMinSubLines(slots)
  return {
    minSubLines,
    minOtherRolls: getMinOtherRolls(
      Object.entries(existingRolls) as Array<[SubstatKey, number]>,
      mainStatsCount,
      minSubLines
    ),
  }
}

export function optimizeTcUsingNodes(
  nodes: OptNode[],
  valueFilter: Array<{ value: NumNode; minimum: number }>,
  charTC: BuildTc,
  callback: (r: TCWorkerResult) => void,
  debug = false
) {
  const startTime = performance.now()
  const {
    artifact: {
      slots,
      substats: { stats: substats, type: substatsType, rarity },
    },
    optimization: { distributedSubstats, maxSubstats },
  } = charTC

  const scalesWith = new Set<string>()
  const compute = precompute(
    nodes,
    {},
    (f) => {
      const val = f.path[1]
      scalesWith.add(val)
      return val
    },
    1
  )

  const scalesWithSub = [...scalesWith].filter((k) =>
    allSubstatKeys.includes(k as SubstatKey)
  ) as SubstatKey[]

  const existingRolls = objMap(substats, (_v, k) =>
    Math.ceil(substats[k] / getSubstatValue(k, rarity, substatsType))
  )
  const maxSubsAssignable = objMap(maxSubstats, (v, k) => v - existingRolls[k])
  const mainStatsCount = getMainStatsCount(slots)
  const minSubLines = getMinSubLines(slots)

  const alreadyFeasible =
    getMinOtherRolls(
      Object.entries(existingRolls) as Array<[SubstatKey, number]>,
      mainStatsCount,
      minSubLines
    ) <= 0

  const varKeys: Array<SubstatKey | 'other'> = [...scalesWithSub, 'other']
  const numVars = varKeys.length
  const varMax = new Int32Array(numVars)
  const unitVals = new Float64Array(numVars)
  for (let idx = 0; idx < numVars; idx++) {
    const k = varKeys[idx]
    if (k === 'other') {
      varMax[idx] = distributedSubstats
      unitVals[idx] = 0
    } else {
      varMax[idx] = Math.max(0, maxSubsAssignable[k])
      unitVals[idx] = getSubstatValue(k, rarity, substatsType, false)
    }
  }

  // Suffix sums of max assignable rolls eliminate dead recursion subtrees immediately
  const suffixMax = new Int32Array(numVars + 1)
  for (let idx = numVars - 1; idx >= 0; idx--) {
    suffixMax[idx] = suffixMax[idx + 1] + varMax[idx]
  }

  // Precompute constant feasibility contribution of non-scaling substats
  const scalingSet = new Set<string>(scalesWithSub)
  let fixedSubSlots = 0
  for (const k of allSubstatKeys) {
    if (!scalingSet.has(k)) {
      const cap = 5 - (mainStatsCount[k] ?? 0)
      fixedSubSlots += Math.min(existingRolls[k] ?? 0, cap)
    }
  }
  const scalingExisting = new Int32Array(scalesWithSub.length)
  const scalingSlotCap = new Int32Array(scalesWithSub.length)
  for (let idx = 0; idx < scalesWithSub.length; idx++) {
    const k = scalesWithSub[idx]
    scalingExisting[idx] = existingRolls[k] ?? 0
    scalingSlotCap[idx] = 5 - (mainStatsCount[k] ?? 0)
  }

  const total = countPerms(distributedSubstats, Array.from(varMax))
  callback({
    resultType: 'total',
    total,
  })

  const filterMins = Float64Array.from(valueFilter.map((f) => f.minimum))
  const numFilters = filterMins.length

  let max = Number.NEGATIVE_INFINITY
  const buffer: Record<string, number> = {}
  const assignedRolls = new Int32Array(numVars)
  let maxBuffer: Partial<Record<SubstatKey, number>> = {}
  let maxBufferRolls: Partial<Record<SubstatKey | 'other', number>> = {
    other: 0,
  }

  let tested = 0
  let failed = 0
  let skipped = 0
  const evalArg = [{ values: buffer }] as const

  const permute = (depth: number, toAssign: number) => {
    if (depth === numVars - 1) {
      if (toAssign > varMax[depth] || toAssign < 0) return
      tested++
      if (!(tested % 100_000)) {
        callback({
          resultType: 'count',
          tested,
          failed,
          skipped,
        })
      }
      assignedRolls[depth] = toAssign
      const results = compute(evalArg)
      const result = results[0]
      if (result <= max) return

      for (let fIdx = 0; fIdx < numFilters; fIdx++) {
        if (results[fIdx + 1] < filterMins[fIdx]) {
          failed++
          return
        }
      }

      if (!alreadyFeasible) {
        let subSlots = fixedSubSlots
        for (let sIdx = 0; sIdx < scalesWithSub.length; sIdx++) {
          const tot = scalingExisting[sIdx] + assignedRolls[sIdx]
          const cap = scalingSlotCap[sIdx]
          subSlots += tot < cap ? tot : cap
        }
        const minOtherRolls = minSubLines - subSlots
        if (toAssign < minOtherRolls) {
          skipped++
          return
        }
      }

      max = result
      const nextBuf: Partial<Record<SubstatKey, number>> = {}
      const nextRolls: Partial<Record<SubstatKey | 'other', number>> = {}
      for (let j = 0; j < scalesWithSub.length; j++) {
        const k = scalesWithSub[j]
        nextBuf[k] = buffer[k]
        nextRolls[k] = assignedRolls[j]
      }
      nextRolls.other = toAssign
      maxBuffer = nextBuf
      maxBufferRolls = nextRolls
      return
    }

    const k = varKeys[depth] as SubstatKey
    const unit = unitVals[depth]
    const lo = Math.max(0, toAssign - suffixMax[depth + 1])
    const hi = Math.min(varMax[depth], toAssign)
    for (let r = lo; r <= hi; r++) {
      buffer[k] = r * unit
      assignedRolls[depth] = r
      permute(depth + 1, toAssign - r)
    }
  }

  if (distributedSubstats <= suffixMax[0]) {
    permute(0, distributedSubstats)
  }

  if (debug) {
    console.log(`Took ${performance.now() - startTime} ms`)
  }
  const distributed = Object.entries(maxBufferRolls).reduce(
    (accu, [k, v]) => accu + (k === 'other' ? 0 : (v ?? 0)),
    0
  )
  callback({
    resultType: 'finalize',
    found: max !== Number.NEGATIVE_INFINITY,
    distributed,
    maxBufferRolls,
    maxBuffer,
    tested,
    failed,
    skipped,
  })
}

const GPU_TC_MIN_TOTAL = 250_000
const GPU_TC_BATCH_VECTORS = 262_144

/**
 * WebGPU-accelerated Theorycraft substat optimizer for large roll spaces (`>= 250k` states),
 * with automatic fallback to the optimized CPU solver.
 */
export async function optimizeTcUsingNodesAsync(
  nodes: OptNode[],
  valueFilter: Array<{ value: NumNode; minimum: number }>,
  charTC: BuildTc,
  callback: (r: TCWorkerResult) => void,
  useGpu = true
): Promise<void> {
  if (!useGpu || !isWebGPUSupported()) {
    optimizeTcUsingNodes(nodes, valueFilter, charTC, callback)
    return
  }

  const {
    artifact: {
      slots,
      substats: { stats: substats, type: substatsType, rarity },
    },
    optimization: { distributedSubstats, maxSubstats },
  } = charTC

  const scalesWith = new Set<string>()
  const computeExact = precompute(
    nodes,
    {},
    (f) => {
      const val = f.path[1]
      scalesWith.add(val)
      return val
    },
    1
  )

  const scalesWithSub = [...scalesWith].filter((k) =>
    allSubstatKeys.includes(k as SubstatKey)
  ) as SubstatKey[]
  const existingRolls = objMap(substats, (_v, k) =>
    Math.ceil(substats[k] / getSubstatValue(k, rarity, substatsType))
  )
  const maxSubsAssignable = objMap(maxSubstats, (v, k) => v - existingRolls[k])
  const varKeys: Array<SubstatKey | 'other'> = [...scalesWithSub, 'other']
  const varMax = varKeys.map((k) =>
    k === 'other' ? distributedSubstats : Math.max(0, maxSubsAssignable[k])
  )
  const total = countPerms(distributedSubstats, varMax)

  if (total < GPU_TC_MIN_TOTAL || scalesWithSub.length === 0) {
    optimizeTcUsingNodes(nodes, valueFilter, charTC, callback)
    return
  }

  const ctx = await getSolverGpuContext()
  if (!ctx) {
    optimizeTcUsingNodes(nodes, valueFilter, charTC, callback)
    return
  }

  try {
    callback({ resultType: 'total', total })

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
    const targetNode = nodes[0]
    const constraintNodes = nodes.slice(1)
    const filterMins = valueFilter.map((f) => f.minimum)

    const program = compileOptNodesToWgsl(
      constraintNodes,
      targetNode,
      undefined,
      keyToIndex,
      numKeys
    )
    const stride = program.strideKeys

    let pipeline = ctx.pipelineCache.get(program.wgslCode)
    if (!pipeline) {
      const mod = ctx.device.createShaderModule({
        label: 'go-tc-wgsl',
        code: program.wgslCode,
      })
      pipeline = await ctx.device.createComputePipelineAsync({
        label: 'go-tc-pipeline',
        layout: 'auto',
        compute: { module: mod, entryPoint: 'main' },
      })
      ctx.pipelineCache.set(program.wgslCode, pipeline)
    }

    const mainStatsCount = getMainStatsCount(slots)
    const minSubLines = getMinSubLines(slots)
    const alreadyFeasible =
      getMinOtherRolls(
        Object.entries(existingRolls) as Array<[SubstatKey, number]>,
        mainStatsCount,
        minSubLines
      ) <= 0

    const scalingSet = new Set<string>(scalesWithSub)
    let fixedSubSlots = 0
    for (const k of allSubstatKeys) {
      if (!scalingSet.has(k)) {
        fixedSubSlots += Math.min(
          existingRolls[k] ?? 0,
          5 - (mainStatsCount[k] ?? 0)
        )
      }
    }
    const numSubs = scalesWithSub.length
    const subKeyIdxInShader = Int32Array.from(
      scalesWithSub.map((k) => keyToIndex.get(k) ?? -1)
    )
    const unitVals = Float64Array.from(
      scalesWithSub.map((k) => getSubstatValue(k, rarity, substatsType, false))
    )
    const scalingExisting = Int32Array.from(
      scalesWithSub.map((k) => existingRolls[k] ?? 0)
    )
    const scalingSlotCap = Int32Array.from(
      scalesWithSub.map((k) => 5 - (mainStatsCount[k] ?? 0))
    )
    const suffixMax = new Int32Array(varKeys.length + 1)
    for (let idx = varKeys.length - 1; idx >= 0; idx--) {
      suffixMax[idx] = suffixMax[idx + 1] + varMax[idx]
    }

    // Batch roll vectors into `slot0` (with slots 1..4 = single zero vector)
    const off0 = stride
    const batchFloatsCapacity =
      stride +
      GPU_TC_BATCH_VECTORS * stride +
      4 * stride +
      program.constValues.length +
      Math.max(1, filterMins.length)
    const packedStats = new Float32Array(batchFloatsCapacity)
    const batchRolls = new Int32Array(GPU_TC_BATCH_VECTORS * (numSubs + 1))

    let batchLen = 0
    let tested = 0
    let failed = 0
    let skipped = 0
    let bestMax = Number.NEGATIVE_INFINITY
    let maxBuffer: Partial<Record<SubstatKey, number>> = {}
    let maxBufferRolls: Partial<Record<SubstatKey | 'other', number>> = {
      other: 0,
    }

    const paramsBuf = new ArrayBuffer(80)
    const paramsU32 = new Uint32Array(paramsBuf)
    const paramsF32 = new Float32Array(paramsBuf)

    const flushGpuBatch = async () => {
      if (batchLen === 0) return
      const off1 = off0 + batchLen * stride
      const off2 = off1 + stride
      const off3 = off2 + stride
      const off4 = off3 + stride
      const offConsts = off4 + stride
      const offMins = offConsts + program.constValues.length
      const usedFloats = offMins + Math.max(1, filterMins.length)

      packedStats.fill(0, off1, offConsts)
      packedStats.set(program.constValues, offConsts)
      for (let c = 0; c < filterMins.length; c++) {
        const m = filterMins[c]
        packedStats[offMins + c] = Number.isFinite(m)
          ? Math.fround(m - (Math.abs(m) * 5e-5 + 1e-5))
          : m
      }

      const byteLen = usedFloats * 4
      const statsGpuBuf = ensureStatsBufferCapacity(ctx, byteLen)
      ctx.device.queue.writeBuffer(statsGpuBuf, 0, packedStats, 0, usedFloats)

      const totalWg = Math.ceil(batchLen / WGSL_ITEMS_PER_WORKGROUP)
      const wgX = Math.min(totalWg, 32768)
      const wgY = Math.ceil(totalWg / wgX)

      paramsU32[0] = batchLen
      paramsU32[1] = 1
      paramsU32[2] = 1
      paramsU32[3] = 1
      paramsU32[4] = 1
      paramsU32[5] = off0
      paramsU32[6] = off1
      paramsU32[7] = off2
      paramsU32[8] = off3
      paramsU32[9] = off4
      paramsU32[10] = offConsts
      paramsU32[11] = offMins
      paramsU32[12] = 0
      paramsU32[13] = batchLen
      paramsU32[14] = wgX
      paramsU32[15] = GPU_MAX_HITS
      paramsF32[16] = Number.isFinite(bestMax)
        ? Math.fround(bestMax - (Math.abs(bestMax) * 5e-5 + 1e-5))
        : bestMax
      paramsF32[17] = 0
      paramsF32[18] = 1
      paramsU32[19] = 0

      ctx.device.queue.writeBuffer(ctx.paramsBuffer, 0, paramsBuf)

      const bindGroup = ctx.device.createBindGroup({
        layout: pipeline!.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: ctx.paramsBuffer, offset: 0, size: 80 },
          },
          {
            binding: 1,
            resource: { buffer: statsGpuBuf, offset: 0, size: byteLen },
          },
          {
            binding: 2,
            resource: { buffer: ctx.outBuffer },
          },
        ],
      })

      const enc = ctx.device.createCommandEncoder()
      enc.clearBuffer(ctx.outBuffer, 0, GPU_OUT_META_U32S * 4)
      const pass = enc.beginComputePass()
      pass.setPipeline(pipeline!)
      pass.setBindGroup(0, bindGroup)
      pass.dispatchWorkgroups(wgX, wgY, 1)
      pass.end()
      enc.copyBufferToBuffer(
        ctx.outBuffer,
        0,
        ctx.stagingBuffer,
        0,
        ctx.outBuffer.size
      )
      ctx.device.queue.submit([enc.finish()])

      await ctx.stagingBuffer.mapAsync(GPUMapModeFlags.READ)
      try {
        const mapped = new Uint32Array(ctx.stagingBuffer.getMappedRange())
        const hitCount = mapped[0]
        failed += mapped[1]
        const take = Math.min(hitCount, GPU_MAX_HITS)
        const candBuf: Record<string, number> = {}
        for (let h = 0; h < take; h++) {
          const row = mapped[GPU_OUT_META_U32S + h]
          if (row >= batchLen) continue
          const rollBase = row * (numSubs + 1)
          for (let s = 0; s < numSubs; s++) {
            candBuf[scalesWithSub[s]] = batchRolls[rollBase + s] * unitVals[s]
          }
          const exactRes = computeExact([{ values: candBuf }] as const)
          if (exactRes[0] <= bestMax) continue
          let ok = true
          for (let c = 0; c < filterMins.length; c++) {
            if (exactRes[c + 1] < filterMins[c]) {
              ok = false
              break
            }
          }
          if (!ok) continue
          bestMax = exactRes[0]
          const nextBuf: Partial<Record<SubstatKey, number>> = {}
          const nextRolls: Partial<Record<SubstatKey | 'other', number>> = {}
          for (let s = 0; s < numSubs; s++) {
            const k = scalesWithSub[s]
            nextBuf[k] = candBuf[k]
            nextRolls[k] = batchRolls[rollBase + s]
          }
          nextRolls.other = batchRolls[rollBase + numSubs]
          maxBuffer = nextBuf
          maxBufferRolls = nextRolls
        }
      } finally {
        ctx.stagingBuffer.unmap()
      }

      batchLen = 0
      callback({ resultType: 'count', tested, failed, skipped })
    }

    const curRolls = new Int32Array(numSubs + 1)
    const enumerateAsync = async (
      depth: number,
      toAssign: number
    ): Promise<void> => {
      if (depth === numSubs) {
        if (toAssign > varMax[depth] || toAssign < 0) return
        tested++
        if (!alreadyFeasible) {
          let subSlots = fixedSubSlots
          for (let s = 0; s < numSubs; s++) {
            const tot = scalingExisting[s] + curRolls[s]
            const cap = scalingSlotCap[s]
            subSlots += tot < cap ? tot : cap
          }
          if (toAssign < minSubLines - subSlots) {
            skipped++
            return
          }
        }
        curRolls[numSubs] = toAssign
        const fOff = off0 + batchLen * stride
        for (let k = 0; k < stride; k++) packedStats[fOff + k] = 0
        const rOff = batchLen * (numSubs + 1)
        for (let s = 0; s < numSubs; s++) {
          const r = curRolls[s]
          batchRolls[rOff + s] = r
          const kIdx = subKeyIdxInShader[s]
          if (kIdx >= 0) packedStats[fOff + kIdx] = r * unitVals[s]
        }
        batchRolls[rOff + numSubs] = toAssign
        batchLen++
        if (batchLen >= GPU_TC_BATCH_VECTORS) {
          await flushGpuBatch()
        }
        return
      }

      const lo = Math.max(0, toAssign - suffixMax[depth + 1])
      const hi = Math.min(varMax[depth], toAssign)
      for (let r = lo; r <= hi; r++) {
        curRolls[depth] = r
        await enumerateAsync(depth + 1, toAssign - r)
      }
    }

    if (distributedSubstats <= suffixMax[0]) {
      await enumerateAsync(0, distributedSubstats)
    }
    await flushGpuBatch()

    const distributed = Object.entries(maxBufferRolls).reduce(
      (accu, [k, v]) => accu + (k === 'other' ? 0 : (v ?? 0)),
      0
    )
    callback({
      resultType: 'finalize',
      found: bestMax !== Number.NEGATIVE_INFINITY,
      distributed,
      maxBufferRolls,
      maxBuffer,
      tested,
      failed,
      skipped,
    })
  } catch {
    optimizeTcUsingNodes(nodes, valueFilter, charTC, callback)
  }
}

function getMinOtherRolls(
  subsRolls: Array<[SubstatKey, number]>,
  mainStatsCount: Partial<Record<SubstatKey, number>>,
  minSublines: number = 4 * 5
) {
  const maxSubSlots = subsRolls.reduce((accu, [k, v]) => {
    const maxStatSlot = 5 - (mainStatsCount[k] ?? 0)
    return accu + Math.min(v, maxStatSlot)
  }, 0)
  return minSublines - maxSubSlots
}

function getMinSubLines(slots: BuildTc['artifact']['slots']) {
  return Object.values(slots).reduce((minSubLines, { rarity, level }) => {
    const { high, low } = artSubstatRollData[rarity]
    return minSubLines + (level >= 4 ? high : low)
  }, 0)
}
function getMainStatsCount(slots: BuildTc['artifact']['slots']) {
  const mainStatsCount: Partial<Record<SubstatKey, number>> = {}

  Object.values(slots).forEach(({ statKey }) => {
    mainStatsCount[statKey as SubstatKey] =
      (mainStatsCount[statKey as SubstatKey] ?? 0) + 1
  }, 0)
  return mainStatsCount
}
function countPerms(sum: number, bounds: number[]): number {
  let counts = Array(sum + 1).fill(0)
  counts[0] = 1
  for (const bound of bounds) {
    const new_counts = Array(sum + 1).fill(0)
    for (let a_i = 0; a_i <= bound; a_i++) {
      for (let s = a_i; s <= sum; s++) {
        new_counts[s] += counts[s - a_i]
      }
    }
    counts = new_counts
  }
  return counts[sum]
}
