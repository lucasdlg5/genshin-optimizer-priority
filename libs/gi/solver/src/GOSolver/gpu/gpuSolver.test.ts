import {
  customRead,
  frac,
  max,
  min,
  precompute,
  prod,
  res,
  sum,
  threshold,
} from '@genshin-optimizer/gi/wr/opt'
import { afterEach, describe, expect, it } from 'vitest'
import type { ArtifactsBySlot } from '../../common.js'
import { GOSolver } from '../GOSolver.js'
import {
  getSolverGpuContext,
  resetSolverGpuContext,
  setMockGpuNavigator,
} from './gpuDevice.js'
import { solveWithWebGPU } from './gpuSolver.js'
import type {
  GPUBindGroupEntryLike,
  GPUBufferLike,
  GPUComputePipelineLike,
  GPUDeviceLike,
  GPUNavigatorLike,
} from './webgpu.types.js'
import {
  compileOptNodesToWgsl,
  WGSL_ITEMS_PER_THREAD,
  WGSL_WORKGROUP_SIZE,
} from './wgslCompiler.js'

/**
 * Spec-faithful in-memory WebGPU emulator that transpiles our generated WGSL shader body
 * and executes it against the actual `ArrayBuffer` uniform/storage bindings.
 */
function createSoftwareWebGpuMock(): {
  gpu: GPUNavigatorLike
  stats: { shaderCompiles: number; dispatches: number }
} {
  const stats = { shaderCompiles: 0, dispatches: 0 }

  class MockBuffer implements GPUBufferLike {
    raw: ArrayBuffer
    size: number
    constructor(size: number) {
      this.size = size
      this.raw = new ArrayBuffer(size)
    }
    async mapAsync(): Promise<void> {}
    getMappedRange(offset = 0, size?: number): ArrayBuffer {
      if (offset === 0 && (size === undefined || size === this.size)) {
        return this.raw
      }
      return this.raw.slice(offset, size ? offset + size : undefined)
    }
    unmap(): void {}
    destroy(): void {}
  }

  function compileWgslToJsSimulator(wgsl: string) {
    // Extract the inner body inside `if (relIdx < params.batchCount) { ... }`
    const marker = 'let gid: u32 = params.batchOffset + relIdx;'
    const startIdx = wgsl.indexOf(marker)
    if (startIdx < 0) throw new Error('WGSL missing gid marker')
    // Find matching closing brace of `if (relIdx < params.batchCount) {`
    let depth = 1
    let pos = startIdx
    while (pos < wgsl.length && depth > 0) {
      if (wgsl[pos] === '{') depth++
      else if (wgsl[pos] === '}') depth--
      pos++
    }
    let body = wgsl.slice(startIdx, pos - 1)

    // Transpile WGSL constructs to exact JS f32/u32 equivalents
    body = body
      .replace(
        /let\s+([a-zA-Z0-9_]+)\s*:\s*(?:u32|f32|bool)\s*=/g,
        'const $1 ='
      )
      .replace(/var\s+([a-zA-Z0-9_]+)\s*:\s*(?:u32|f32|bool)\s*=/g, 'let $1 =')
      .replace(/\b0xffffu\b/g, '0xffff')
      .replace(/(\b\d+)u\b/g, '$1')
      .replace(/atomicAdd\(&outBuf\.hitCount,\s*1\)/g, '(outU32[0]++)')
      .replace(/outBuf\.hitGids\[([^\]]+)\]/g, 'outU32[4 + ($1)]')
      .replace(
        /atomicMax\(&plotBins\[([^\]]+)\],\s*([^)]+)\)/g,
        'atomicMaxPlot($1, $2)'
      )
      .replace(/atomicLoad\(&plotBins\[([^\]]+)\]\)/g, 'plotU32[$1]')
      .replace(/const (q[123]|i0) = ([^;]+);/g, 'const $1 = Math.trunc($2);')

    const jsSrc = `"use strict";
const min = Math.min;
const max = Math.max;
const floor = Math.floor;
const u32 = (x) => Math.trunc(x) >>> 0;
const f32 = (x) => Math.fround(x);
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
function eval_res(r) {
  if (r < 0.0) return Math.fround(1.0 - r * 0.5);
  if (r >= 0.75) return Math.fround(1.0 / (r * 4.0 + 1.0));
  return Math.fround(1.0 - r);
}
function select(falseVal, trueVal, cond) {
  return cond ? trueVal : falseVal;
}
const tmpF32 = new Float32Array(1);
const tmpU32 = new Uint32Array(tmpF32.buffer);
function float_to_sortable_u32(val) {
  tmpF32[0] = val;
  const bits = tmpU32[0];
  const mask = (bits & 0x80000000) !== 0 ? 0xffffffff : 0x80000000;
  return (bits ^ mask) >>> 0;
}
function atomicMaxPlot(idx, score) {
  const prev = plotU32[idx] >>> 0;
  const s = score >>> 0;
  if (s > prev) plotU32[idx] = s;
  return prev;
}
let localFailed = 0;
for (let relIdx = 0; relIdx < params.batchCount; relIdx++) {
  ${body}
}
outU32[1] = (outU32[1] + localFailed) >>> 0;
`
    return new Function(
      'params',
      'packedStats',
      'outU32',
      'plotU32',
      jsSrc
    ) as (
      params: Record<string, number>,
      packedStats: Float32Array,
      outU32: Uint32Array,
      plotU32: Uint32Array
    ) => void
  }

  const device: GPUDeviceLike = {
    limits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
      maxComputeWorkgroupStorageSize: 16384,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupsPerDimension: 65535,
    },
    lost: new Promise(() => {}),
    queue: {
      writeBuffer(buf, bufOffset, data, dataOffset, size) {
        const dst = new Uint8Array((buf as MockBuffer).raw)
        let srcBytes: Uint8Array
        if (ArrayBuffer.isView(data)) {
          const elemBytes =
            (data as unknown as { BYTES_PER_ELEMENT?: number })
              .BYTES_PER_ELEMENT ?? 1
          const byteOff =
            data.byteOffset +
            (dataOffset !== undefined ? dataOffset * elemBytes : 0)
          const byteLen =
            size !== undefined
              ? size * elemBytes
              : data.byteLength -
                (dataOffset !== undefined ? dataOffset * elemBytes : 0)
          srcBytes = new Uint8Array(data.buffer, byteOff, byteLen)
        } else {
          srcBytes = new Uint8Array(data, dataOffset ?? 0, size)
        }
        dst.set(srcBytes, bufOffset)
      },
      submit(cmds) {
        for (const cmd of cmds as unknown as Array<{
          ops: Array<() => void>
        }>) {
          for (const op of cmd.ops) op()
        }
      },
    },
    createBuffer(desc) {
      return new MockBuffer(desc.size)
    },
    createShaderModule(desc) {
      return { label: desc.label, code: desc.code } as any
    },
    async createComputePipelineAsync(desc) {
      stats.shaderCompiles++
      const code = (desc.compute.module as unknown as { code: string }).code
      const sim = compileWgslToJsSimulator(code)
      return {
        sim,
        getBindGroupLayout() {
          return {}
        },
      } as unknown as GPUComputePipelineLike
    },
    createBindGroup(desc) {
      return { entries: desc.entries } as any
    },
    createCommandEncoder() {
      const ops: Array<() => void> = []
      return {
        clearBuffer(buf, offset = 0, size) {
          ops.push(() => {
            const u8 = new Uint8Array((buf as MockBuffer).raw)
            u8.fill(0, offset, size !== undefined ? offset + size : u8.length)
          })
        },
        copyBufferToBuffer(src, srcOff, dst, dstOff, size) {
          ops.push(() => {
            const s = new Uint8Array((src as MockBuffer).raw, srcOff, size)
            const d = new Uint8Array((dst as MockBuffer).raw)
            d.set(s, dstOff)
          })
        },
        beginComputePass() {
          let curPipeline: any
          let curEntries: GPUBindGroupEntryLike[] = []
          return {
            setPipeline(p) {
              curPipeline = p
            },
            setBindGroup(_idx, bg) {
              curEntries = (
                bg as unknown as { entries: GPUBindGroupEntryLike[] }
              ).entries
            },
            dispatchWorkgroups(wgX, wgY = 1) {
              const pRef = curPipeline
              const eRef = curEntries
              ops.push(() => {
                stats.dispatches++
                const getBuf = (b: number) =>
                  eRef.find((e) => e.binding === b)?.resource.buffer as
                    | MockBuffer
                    | undefined
                const pRaw = getBuf(0)!.raw
                const pU32 = new Uint32Array(pRaw)
                const pF32 = new Float32Array(pRaw)
                const paramsObj = {
                  n0: pU32[0],
                  n1: pU32[1],
                  n2: pU32[2],
                  n3: pU32[3],
                  n4: pU32[4],
                  off0: pU32[5],
                  off1: pU32[6],
                  off2: pU32[7],
                  off3: pU32[8],
                  off4: pU32[9],
                  offConsts: pU32[10],
                  offMins: pU32[11],
                  batchOffset: pU32[12],
                  batchCount: pU32[13],
                  gridStrideWgX: pU32[14],
                  maxHits: pU32[15],
                  safeThreshold: pF32[16],
                  plotMin: pF32[17],
                  invPlotScale: pF32[18],
                  plotFlags: pU32[19],
                }
                expect(
                  wgX * wgY * WGSL_WORKGROUP_SIZE * WGSL_ITEMS_PER_THREAD
                ).toBeGreaterThanOrEqual(paramsObj.batchCount)
                const packedStats = new Float32Array(getBuf(1)!.raw)
                const outU32 = new Uint32Array(getBuf(2)!.raw)
                const plotBuf = getBuf(3)
                const plotU32 = plotBuf
                  ? new Uint32Array(plotBuf.raw)
                  : new Uint32Array(1)
                pRef.sim(paramsObj, packedStats, outU32, plotU32)
              })
            },
            end() {},
          }
        },
        finish() {
          return { ops } as any
        },
      }
    },
    destroy() {},
  }

  return {
    gpu: {
      async requestAdapter() {
        return {
          limits: device.limits,
          async requestDevice() {
            return device
          },
        }
      },
    },
    stats,
  }
}

function makeTestArts(perSlot: number): ArtifactsBySlot {
  const sets = [
    'GoldenTroupe',
    'MarechausseeHunter',
    'GladiatorsFinale',
  ] as const
  const makeSlot = (p: string, sIdx: number) =>
    Array.from({ length: perSlot }, (_, i) => {
      const set = sets[(i + sIdx) % sets.length]
      return {
        id: `${p}_${i}`,
        set,
        values: {
          [set]: 1,
          atk_: 0.05 + ((i * 3 + sIdx) % 7) * 0.045,
          critRate_: 0.03 + ((i * 5 + sIdx) % 8) * 0.035,
          critDMG_: 0.06 + ((i * 7 + sIdx) % 9) * 0.055,
          eleMas: 20 + ((i * 11 + sIdx) % 6) * 25,
          enerRech_: 0.05 + ((i * 2 + sIdx) % 7) * 0.045,
        },
      }
    })
  return {
    base: {
      atk_: 0.25,
      critRate_: 0.05,
      critDMG_: 0.5,
      eleMas: 40,
      enerRech_: 1.0,
      enemyRes_: 0.1,
    },
    values: {
      flower: makeSlot('f', 0),
      plume: makeSlot('p', 1),
      sands: makeSlot('s', 2),
      goblet: makeSlot('g', 3),
      circlet: makeSlot('c', 4),
    },
  }
}

describe('WebGPU WGSL Compiler & Hybrid GPU Solver', () => {
  afterEach(() => {
    setMockGpuNavigator(undefined)
    resetSolverGpuContext()
  })

  it('generates parameterized WGSL that reuses the exact same shader across different weapons', () => {
    const keyMap = new Map([
      ['atk_', 0],
      ['critRate_', 1],
      ['critDMG_', 2],
      ['eleMas', 3],
      ['GoldenTroupe', 4],
      ['enemyRes_', 5],
    ])

    const buildWeaponAst = (baseAtk: number, weapCd: number, weapDmg: number) =>
      prod(
        sum(baseAtk, prod(baseAtk, customRead(['dyn', 'atk_']))),
        sum(
          1,
          prod(
            min(1, max(0, sum(customRead(['dyn', 'critRate_']), 0.05, 0.1))),
            sum(customRead(['dyn', 'critDMG_']), weapCd)
          )
        ),
        sum(
          1,
          weapDmg,
          threshold(customRead(['dyn', 'GoldenTroupe']), 4, 0.7, 0)
        ),
        sum(1.5, prod(2.78, frac(customRead(['dyn', 'eleMas']), 1400))),
        res(customRead(['dyn', 'enemyRes_']))
      )

    const progWeaponA = compileOptNodesToWgsl(
      [],
      buildWeaponAst(950, 0.441, 0.4),
      undefined,
      keyMap,
      keyMap.size
    )
    const progWeaponB = compileOptNodesToWgsl(
      [],
      buildWeaponAst(790, 0.882, 0.24),
      undefined,
      keyMap,
      keyMap.size
    )

    // Identical WGSL source guarantees 100% GPUComputePipeline cache hit across weapons!
    expect(progWeaponA.wgslCode).toBe(progWeaponB.wgslCode)
    expect(progWeaponA.constValues).not.toEqual(progWeaponB.constValues)
    expect(progWeaponA.hasPlot).toBe(false)
    expect(progWeaponA.wgslCode).not.toContain('@binding(3)')
    // Ensure WGSL binary min/max compliance (no 3-argument min/max calls)
    expect(progWeaponA.wgslCode).not.toMatch(/\b(min|max)\([^(),]+,[^(),]+,/)
  })

  it('matches exact f64 brute-force Top-5 builds and PlotData on >200k-build chunks via WebGPU', async () => {
    const { gpu, stats } = createSoftwareWebGpuMock()
    setMockGpuNavigator(gpu)
    const ctx = await getSolverGpuContext()
    expect(ctx).not.toBeNull()

    // 12^5 = 248,832 builds (> CPU_LEAF_FASTPATH_LIMIT = 131,072 so GPU dispatch runs!)
    const arts = makeTestArts(12)
    const erNode = customRead(['dyn', 'enerRech_'])
    const buildTarget = (baseAtk: number) =>
      prod(
        sum(baseAtk, prod(baseAtk, customRead(['dyn', 'atk_']))),
        sum(
          1,
          prod(
            min(1, customRead(['dyn', 'critRate_'])),
            customRead(['dyn', 'critDMG_'])
          )
        ),
        sum(
          1,
          threshold(customRead(['dyn', 'GoldenTroupe']), 2, 0.2, 0),
          threshold(customRead(['dyn', 'GoldenTroupe']), 4, 0.5, 0)
        ),
        sum(1.5, prod(2.78, frac(customRead(['dyn', 'eleMas']), 1400)))
      )

    const targetA = buildTarget(900)
    const refEval = precompute(
      [erNode, targetA],
      arts.base,
      (f) => f.path[1],
      5
    )
    const bruteScores: number[] = []
    for (const f of arts.values.flower)
      for (const p of arts.values.plume)
        for (const s of arts.values.sands)
          for (const g of arts.values.goblet)
            for (const c of arts.values.circlet) {
              const [er, dmg] = refEval([f, p, s, g, c])
              if (er >= 1.2) bruteScores.push(dmg)
            }
    bruteScores.sort((a, b) => b - a)
    const expectedTop5 = bruteScores.slice(0, 5)

    // 1. Solve Top-5 via WebGPU (using plotBase on pass 2 and unpruned 12^5 box on pass 1)
    const setupA = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: targetA,
      constraints: [{ value: erNode, min: 1.2 }],
      exclusion: {},
      topN: 5,
    })
    const statusA = {
      tested: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testedPerSecond: 0,
      skippedPerSecond: 0,
    }
    const resA = await solveWithWebGPU(ctx!, setupA, {}, statusA, () => {})
    expect(resA[0].builds.length).toBe(5)
    for (let i = 0; i < 5; i++) {
      expect(resA[0].builds[i].value).toBeCloseTo(expectedTop5[i], 5)
    }

    // 2. Solve PlotBase mode on GPU (forces full 248,832-build GPU dispatch + plotBins atomicMax!)
    const setupPlot = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: targetA,
      constraints: [{ value: erNode, min: 1.2 }],
      exclusion: {},
      topN: 3,
      plotBase: erNode,
    })
    const statusPlot = {
      tested: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      testedPerSecond: 0,
      skippedPerSecond: 0,
    }
    const resPlot = await solveWithWebGPU(
      ctx!,
      setupPlot,
      {},
      statusPlot,
      () => {}
    )
    expect(stats.dispatches).toBeGreaterThan(0)
    expect(resPlot[0].builds[0].value).toBeCloseTo(expectedTop5[0], 5)
    expect(Object.keys(resPlot[0].plotData ?? {}).length).toBeGreaterThan(5)

    // 3. Second weapon with same AST structure reuses cached GPUComputePipeline without recompiling!
    const compilesBeforeSecondWeapon = stats.shaderCompiles
    const setupPlotWeaponB = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: buildTarget(780),
      constraints: [{ value: erNode, min: 1.2 }],
      exclusion: {},
      topN: 3,
      plotBase: erNode,
    })
    await solveWithWebGPU(ctx!, setupPlotWeaponB, {}, statusPlot, () => {})
    expect(stats.shaderCompiles).toBe(compilesBeforeSecondWeapon)
  })
})
