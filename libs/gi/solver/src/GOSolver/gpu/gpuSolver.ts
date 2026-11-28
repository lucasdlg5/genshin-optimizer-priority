import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import type { ArtSetExclusion } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr/opt'
import {
  forEachNodes,
  optimize,
  precompute,
} from '@genshin-optimizer/gi/wr/opt'
import type {
  ArtifactsBySlot,
  PlotData,
  RequestFilter,
  SolverBuild,
} from '../../common.js'
import {
  artSetPerm,
  computeFullArtRange,
  computeNodeRange,
  countBuilds,
  filterArts,
  filterFeasiblePerm,
  mergePlot,
  pruneAll,
  pruneExclusion,
} from '../../common.js'
import type { FinalizeResult, Interim, Setup } from '../../type.js'
import type { SplitWorker } from '../BackgroundWorker.js'
import { BNBSplitWorker } from '../BNBSplitWorker/index.js'
import { ComputeWorker } from '../ComputeWorker.js'
import { DefaultSplitWorker } from '../DefaultSplitWorker.js'
import type { SolverGpuContext } from './gpuDevice.js'
import {
  ensureStatsBufferCapacity,
  GPU_MAX_HITS,
  GPU_OUT_META_U32S,
  GPU_PLOT_BINS,
  GPU_PLOT_BUFFER_BYTES,
} from './gpuDevice.js'
import { GPUMapModeFlags } from './webgpu.types.js'
import {
  compileOptNodesToWgsl,
  WGSL_ITEMS_PER_WORKGROUP,
} from './wgslCompiler.js'

const MAX_U32_SAFE_CHUNK = 240_000_000 // < 2^28 << 2^32 (zero u32 overflow)
const TOPN_GPU_CHUNK_SIZE = 64_000_000
const PLOT_GPU_CHUNK_SIZE = 200_000_000
const MAX_BUILDS_PER_DISPATCH = 33_554_432 // 32M builds/submit (~3-10ms, prevents Windows DX12 TDR)
const CPU_LEAF_FASTPATH_LIMIT = 131_072
const MAX_GRID_WG_X = 32768

function conservativeF32Min(val: number): number {
  if (!Number.isFinite(val)) return val
  return Math.fround(val - (Math.abs(val) * 5e-5 + 1e-5))
}

export interface GpuSolveStatus {
  tested: number
  failed: number
  skipped: number
  total: number
  testedPerSecond: number
  skippedPerSecond: number
}

export async function solveWithWebGPU(
  ctx: SolverGpuContext,
  setup: Setup,
  exclusion: ArtSetExclusion,
  status: GpuSolveStatus,
  checkCancelled: () => void
): Promise<FinalizeResult[]> {
  const { arts, topN, plotBase } = setup
  const allSets = new Set(
    Object.values(arts.values).flatMap((list) => list.map((x) => x.set!))
  )
  const perms = [...filterFeasiblePerm(artSetPerm(exclusion, allSets), arts)]

  let totalBuilds = 0
  for (const perm of perms) {
    totalBuilds += countBuilds(filterArts(arts, perm))
  }
  status.total = totalBuilds
  if (totalBuilds === 0) {
    return [
      {
        resultType: 'finalize',
        builds: [],
        plotData: plotBase ? {} : undefined,
      },
    ]
  }

  let currentThreshold = plotBase
    ? Number.NEGATIVE_INFINITY
    : (setup.initialThreshold ?? Number.NEGATIVE_INFINITY)

  const topBuilds: SolverBuild[] = []
  const seenBuildKeys = new Set<string>()
  let plotData: PlotData | undefined = plotBase ? {} : undefined

  const recordCandidateBuild = (
    artifactIds: string[],
    exactVal: number,
    exactPlotVal?: number
  ) => {
    if (plotData && exactPlotVal !== undefined) {
      const existingPlot = plotData[exactPlotVal]
      if (!existingPlot || existingPlot.value < exactVal) {
        plotData[exactPlotVal] = {
          value: exactVal,
          plot: exactPlotVal,
          artifactIds,
        }
      }
    }

    if (exactVal < currentThreshold && topBuilds.length >= topN) return
    const key = artifactIds.join('|')
    if (seenBuildKeys.has(key)) return
    seenBuildKeys.add(key)
    topBuilds.push({ value: exactVal, artifactIds })
    if (topBuilds.length >= Math.max(16, topN * 2)) {
      compactTopBuilds()
    }
  }

  const compactTopBuilds = () => {
    topBuilds.sort((a, b) => b.value - a.value)
    if (topBuilds.length > topN) {
      for (let i = topN; i < topBuilds.length; i++) {
        seenBuildKeys.delete(topBuilds[i].artifactIds.join('|'))
      }
      topBuilds.length = topN
    }
    if (!plotBase && topBuilds.length >= topN) {
      const nth = topBuilds[topN - 1].value
      if (nth > currentThreshold) currentThreshold = nth
    }
  }

  const onSplitInterim = (r: Interim) => {
    status.tested += r.tested
    status.failed += r.failed
    status.skipped += r.skipped
  }

  let sw: SplitWorker
  if (plotBase) {
    sw = new DefaultSplitWorker(setup, onSplitInterim)
  } else {
    try {
      sw = new BNBSplitWorker(setup, onSplitInterim)
    } catch {
      sw = new DefaultSplitWorker(setup, onSplitInterim)
    }
  }

  const cpuLeafWorker = new ComputeWorker(setup, (r) => {
    status.tested += r.tested
    status.failed += r.failed
    status.skipped += r.skipped
  })

  const baseNodes = [
    ...setup.constraints.map((c) => c.value),
    setup.optTarget,
    ...(plotBase ? [plotBase] : []),
  ]
  const baseNodesOpt = optimize(baseNodes, {}, (_) => false)
  const constraintMins = setup.constraints.map((c) => c.min)
  const targetChunkSize = plotBase ? PLOT_GPU_CHUNK_SIZE : TOPN_GPU_CHUNK_SIZE

  const paramsBuf = new ArrayBuffer(80)
  const paramsU32 = new Uint32Array(paramsBuf)
  const paramsF32 = new Float32Array(paramsBuf)

  const evaluateChunkOnGpu = async (
    preArts: ArtifactsBySlot,
    nodes: OptNode[],
    exclude4pc: ArtifactSetKey[] | undefined
  ) => {
    // Sort slots ascending so slotArts[4] (innermost modulo) is largest for optimal GPU cache locality
    const slotArts = Object.values(preArts.values).sort(
      (a, b) => a.length - b.length
    )
    const n0 = slotArts[0].length
    const n1 = slotArts[1].length
    const n2 = slotArts[2].length
    const n3 = slotArts[3].length
    const n4 = slotArts[4].length
    const chunkTotal = n0 * n1 * n2 * n3 * n4
    if (chunkTotal === 0) return

    const numConstraints = constraintMins.length
    const constraintNodes = nodes.slice(0, numConstraints)
    const targetNode = nodes[numConstraints]
    const plotNode = plotBase ? nodes[numConstraints + 1] : undefined

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
    const program = compileOptNodesToWgsl(
      constraintNodes,
      targetNode,
      plotNode,
      keyToIndex,
      numKeys
    )
    const stride = program.strideKeys

    let pipeline = ctx.pipelineCache.get(program.wgslCode)
    if (!pipeline) {
      const module = ctx.device.createShaderModule({
        label: 'go-solver-wgsl',
        code: program.wgslCode,
      })
      pipeline = await ctx.device.createComputePipelineAsync({
        label: 'go-solver-pipeline',
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      })
      ctx.pipelineCache.set(program.wgslCode, pipeline)
    }

    // Pack [base | slot0 | slot1 | slot2 | slot3 | slot4 | consts | mins] into one Float32Array
    const off0 = stride
    const off1 = off0 + n0 * stride
    const off2 = off1 + n1 * stride
    const off3 = off2 + n2 * stride
    const off4 = off3 + n3 * stride
    const offConsts = off4 + n4 * stride
    const offMins = offConsts + program.constValues.length
    const totalFloats = offMins + Math.max(1, numConstraints)

    const packedStats = new Float32Array(totalFloats)
    for (let k = 0; k < numKeys; k++) {
      packedStats[k] = preArts.base[keys[k]] ?? 0
    }
    const slotOffsets = [off0, off1, off2, off3, off4]
    for (let s = 0; s < 5; s++) {
      const list = slotArts[s]
      const baseOff = slotOffsets[s]
      for (let i = 0; i < list.length; i++) {
        const vals = list[i].values
        const rowOff = baseOff + i * stride
        for (let k = 0; k < numKeys; k++) {
          packedStats[rowOff + k] = vals[keys[k]] ?? 0
        }
      }
    }
    packedStats.set(program.constValues, offConsts)
    for (let c = 0; c < numConstraints; c++) {
      packedStats[offMins + c] = conservativeF32Min(constraintMins[c])
    }

    const statsGpuBuf = ensureStatsBufferCapacity(ctx, packedStats.byteLength)
    ctx.device.queue.writeBuffer(statsGpuBuf, 0, packedStats)

    let plotMin = 0
    let invPlotScale = 1
    let activePlotBins = 0
    if (plotNode) {
      const pRange = computeNodeRange(
        [plotNode],
        computeFullArtRange(preArts)
      ).get(plotNode)
      plotMin = Number.isFinite(pRange?.min) ? pRange!.min : 0
      const plotMax = Number.isFinite(pRange?.max) ? pRange!.max : plotMin + 1
      const span = Math.max(1e-6, plotMax - plotMin)
      activePlotBins = GPU_PLOT_BINS
      invPlotScale = (activePlotBins - 1) / span

      const initEnc = ctx.device.createCommandEncoder()
      initEnc.clearBuffer(ctx.plotBuffer, 0, GPU_PLOT_BUFFER_BYTES)
      ctx.device.queue.submit([initEnc.finish()])
    }

    const bindEntries = [
      {
        binding: 0,
        resource: { buffer: ctx.paramsBuffer, offset: 0, size: 80 },
      },
      {
        binding: 1,
        resource: {
          buffer: statsGpuBuf,
          offset: 0,
          size: Math.ceil(packedStats.byteLength / 4) * 4,
        },
      },
      {
        binding: 2,
        resource: { buffer: ctx.outBuffer },
      },
      ...(program.hasPlot
        ? [
            {
              binding: 3,
              resource: {
                buffer: ctx.plotBuffer,
                offset: 0,
                size: GPU_PLOT_BUFFER_BYTES,
              },
            },
          ]
        : []),
    ]
    const bindGroup = ctx.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bindEntries,
    })

    // Exact IEEE-754 f64 re-evaluator for GPU candidate hits
    const evalExactF64 = precompute(nodes, preArts.base, (f) => f.path[1], 5)
    const exclude4pcSet = exclude4pc?.length
      ? new Set<ArtifactSetKey>(exclude4pc)
      : undefined

    const verifyAndRecordGid = (gid: number) => {
      const i4 = gid % n4
      const q3 = (gid - i4) / n4
      const i3 = q3 % n3
      const q2 = (q3 - i3) / n3
      const i2 = q2 % n2
      const q1 = (q2 - i2) / n2
      const i1 = q1 % n1
      const i0 = (q1 - i1) / n1
      if (i0 >= n0) return

      const a0 = slotArts[0][i0]
      const a1 = slotArts[1][i1]
      const a2 = slotArts[2][i2]
      const a3 = slotArts[3][i3]
      const a4 = slotArts[4][i4]

      if (exclude4pcSet) {
        const s0 = a0.set
        const s1 = a1.set
        const s2 = a2.set
        const s3 = a3.set
        const s4 = a4.set
        if (s0 && exclude4pcSet.has(s0)) {
          const cnt =
            1 +
            (s1 === s0 ? 1 : 0) +
            (s2 === s0 ? 1 : 0) +
            (s3 === s0 ? 1 : 0) +
            (s4 === s0 ? 1 : 0)
          if (cnt >= 4) return
        }
        if (
          s1 &&
          s1 !== s0 &&
          exclude4pcSet.has(s1) &&
          s2 === s1 &&
          s3 === s1 &&
          s4 === s1
        ) {
          return
        }
      }

      const exactRes = evalExactF64([a0, a1, a2, a3, a4])
      for (let c = 0; c < numConstraints; c++) {
        if (!(exactRes[c] >= constraintMins[c])) return
      }
      const exactVal = exactRes[numConstraints]
      const exactPlot = plotNode ? exactRes[numConstraints + 1] : undefined
      const ids: string[] = []
      if (a0.id) ids.push(a0.id)
      if (a1.id) ids.push(a1.id)
      if (a2.id) ids.push(a2.id)
      if (a3.id) ids.push(a3.id)
      if (a4.id) ids.push(a4.id)
      recordCandidateBuild(ids, exactVal, exactPlot)
    }

    const runSliceDispatch = async (
      sliceOffset: number,
      sliceCount: number,
      capturePass: 0 | 1
    ): Promise<{ hitCount: number; failedCount: number }> => {
      const totalWg = Math.ceil(sliceCount / WGSL_ITEMS_PER_WORKGROUP)
      const wgX = Math.min(totalWg, MAX_GRID_WG_X)
      const wgY = Math.ceil(totalWg / wgX)

      paramsU32[0] = n0
      paramsU32[1] = n1
      paramsU32[2] = n2
      paramsU32[3] = n3
      paramsU32[4] = n4
      paramsU32[5] = off0
      paramsU32[6] = off1
      paramsU32[7] = off2
      paramsU32[8] = off3
      paramsU32[9] = off4
      paramsU32[10] = offConsts
      paramsU32[11] = offMins
      paramsU32[12] = sliceOffset
      paramsU32[13] = sliceCount
      paramsU32[14] = wgX
      paramsU32[15] = GPU_MAX_HITS
      paramsF32[16] = conservativeF32Min(currentThreshold)
      paramsF32[17] = Math.fround(plotMin)
      paramsF32[18] = Math.fround(invPlotScale)
      paramsU32[19] = (activePlotBins & 0xffff) | (capturePass << 16)

      ctx.device.queue.writeBuffer(ctx.paramsBuffer, 0, paramsBuf)

      const encoder = ctx.device.createCommandEncoder()
      encoder.clearBuffer(ctx.outBuffer, 0, GPU_OUT_META_U32S * 4)
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipeline!)
      pass.setBindGroup(0, bindGroup)
      pass.dispatchWorkgroups(wgX, wgY, 1)
      pass.end()

      encoder.copyBufferToBuffer(
        ctx.outBuffer,
        0,
        ctx.stagingBuffer,
        0,
        ctx.outBuffer.size
      )
      ctx.device.queue.submit([encoder.finish()])

      await ctx.stagingBuffer.mapAsync(GPUMapModeFlags.READ)
      let hitCount = 0
      let failedCount = 0
      try {
        const mapped = new Uint32Array(ctx.stagingBuffer.getMappedRange())
        hitCount = mapped[0]
        failedCount = mapped[1]
        const take = Math.min(hitCount, GPU_MAX_HITS)
        for (let h = 0; h < take; h++) {
          verifyAndRecordGid(mapped[GPU_OUT_META_U32S + h])
        }
      } finally {
        ctx.stagingBuffer.unmap()
      }
      compactTopBuilds()
      return { hitCount, failedCount }
    }

    let anyPlotSliceOverflowed = false
    for (
      let offset = 0;
      offset < chunkTotal;
      offset += MAX_BUILDS_PER_DISPATCH
    ) {
      checkCancelled()
      const sliceCount = Math.min(MAX_BUILDS_PER_DISPATCH, chunkTotal - offset)
      const threshBefore = currentThreshold
      const { hitCount, failedCount } = await runSliceDispatch(
        offset,
        sliceCount,
        0
      )
      status.tested += sliceCount
      status.failed += failedCount

      if (
        !plotNode &&
        hitCount > GPU_MAX_HITS &&
        currentThreshold > threshBefore
      ) {
        // Re-scan slice once with the raised threshold so zero top-N candidates beyond 65,536 are missed
        checkCancelled()
        await runSliceDispatch(offset, sliceCount, 0)
      } else if (plotNode && hitCount > GPU_MAX_HITS) {
        anyPlotSliceOverflowed = true
      }
    }

    if (plotNode && anyPlotSliceOverflowed) {
      for (
        let offset = 0;
        offset < chunkTotal;
        offset += MAX_BUILDS_PER_DISPATCH
      ) {
        checkCancelled()
        const sliceCount = Math.min(
          MAX_BUILDS_PER_DISPATCH,
          chunkTotal - offset
        )
        await runSliceDispatch(offset, sliceCount, 1)
      }
    }

    if (plotData && Object.keys(plotData).length >= 50_000) {
      plotData = mergePlot([plotData])
    }
  }

  const processFilterChunk = async (chunkFilter: RequestFilter) => {
    checkCancelled()
    let preArts = filterArts(arts, chunkFilter)
    const exclude4pc = chunkFilter.exclude4pc
    const exclusionRule: ArtSetExclusion = exclude4pc?.length
      ? Object.fromEntries(exclude4pc.map((s) => [s, [4]]))
      : {}
    const rawCount = countBuilds(preArts)
    if (rawCount === 0) return

    const safeThresh = Number.isFinite(currentThreshold)
      ? currentThreshold - (Math.abs(currentThreshold) * 1e-12 + 1e-12)
      : currentThreshold
    const pruneMins = plotBase
      ? constraintMins
      : [...constraintMins, safeThresh]

    let nodes = exclude4pc?.length
      ? optimize(pruneExclusion(baseNodesOpt, exclusionRule), {}, (_) => false)
      : baseNodesOpt
    const maxSlotCount = Math.max(
      preArts.values.flower.length,
      preArts.values.plume.length,
      preArts.values.sands.length,
      preArts.values.goblet.length,
      preArts.values.circlet.length
    )
    ;({ nodes, arts: preArts } = pruneAll(
      nodes,
      pruneMins,
      preArts,
      topN,
      exclusionRule,
      {
        pruneOrder: !plotBase && maxSlotCount <= 48,
        pruneArtRange: true,
        pruneNodeRange: true,
      }
    ))

    const remCount = countBuilds(preArts)
    const prunedCount = rawCount - remCount
    if (prunedCount > 0) status.skipped += prunedCount
    if (remCount === 0) return

    // Tiny leaf fast-path on CPU (<0.1ms, avoids async GPU readback latency)
    if (!plotBase && remCount <= CPU_LEAF_FASTPATH_LIMIT) {
      cpuLeafWorker.setThreshold(currentThreshold)
      const subFilter: RequestFilter = {
        flower: {
          kind: 'id',
          ids: new Set(preArts.values.flower.map((a) => a.id)),
        },
        plume: {
          kind: 'id',
          ids: new Set(preArts.values.plume.map((a) => a.id)),
        },
        sands: {
          kind: 'id',
          ids: new Set(preArts.values.sands.map((a) => a.id)),
        },
        goblet: {
          kind: 'id',
          ids: new Set(preArts.values.goblet.map((a) => a.id)),
        },
        circlet: {
          kind: 'id',
          ids: new Set(preArts.values.circlet.map((a) => a.id)),
        },
        ...(exclude4pc?.length ? { exclude4pc } : {}),
      }
      cpuLeafWorker.compute(subFilter)
      cpuLeafWorker.refresh(true)
      for (const b of cpuLeafWorker.builds) {
        recordCandidateBuild(b.artifactIds, b.value)
      }
      compactTopBuilds()
      sw.setThreshold(currentThreshold)
      return
    }

    // Ensure u32 index safety (< 2.4e8 builds per GPU chunk)
    if (remCount > MAX_U32_SAFE_CHUNK) {
      const subSplitter = new DefaultSplitWorker(
        { ...setup, arts: preArts },
        () => {}
      )
      const allIdsFilter: RequestFilter = {
        flower: {
          kind: 'id',
          ids: new Set(preArts.values.flower.map((a) => a.id)),
        },
        plume: {
          kind: 'id',
          ids: new Set(preArts.values.plume.map((a) => a.id)),
        },
        sands: {
          kind: 'id',
          ids: new Set(preArts.values.sands.map((a) => a.id)),
        },
        goblet: {
          kind: 'id',
          ids: new Set(preArts.values.goblet.map((a) => a.id)),
        },
        circlet: {
          kind: 'id',
          ids: new Set(preArts.values.circlet.map((a) => a.id)),
        },
      }
      for (const sub of subSplitter.split(allIdsFilter, MAX_U32_SAFE_CHUNK)) {
        if (exclude4pc?.length) sub.exclude4pc = exclude4pc
        const subArts = filterArts(preArts, sub)
        await evaluateChunkOnGpu(subArts, nodes, exclude4pc)
        sw.setThreshold(currentThreshold)
      }
      return
    }

    await evaluateChunkOnGpu(preArts, nodes, exclude4pc)
    sw.setThreshold(currentThreshold)
  }

  for (const perm of perms) {
    checkCancelled()
    for (const chunkFilter of sw.split(perm, targetChunkSize)) {
      await processFilterChunk(chunkFilter)
    }
  }

  compactTopBuilds()
  if (plotData) {
    plotData = mergePlot([plotData])
  }

  return [
    {
      resultType: 'finalize',
      builds: topBuilds,
      plotData,
    },
  ]
}
