import { assertUnreachable } from '@genshin-optimizer/common/util'
import type { OptNode } from '@genshin-optimizer/gi/wr/opt'
import { forEachNodes } from '@genshin-optimizer/gi/wr/opt'

export const WGSL_WORKGROUP_SIZE = 256
export const WGSL_ITEMS_PER_THREAD = 4
export const WGSL_ITEMS_PER_WORKGROUP =
  WGSL_WORKGROUP_SIZE * WGSL_ITEMS_PER_THREAD

export interface CompiledWgslProgram {
  /** Canonical WGSL source code (independent of concrete `const` values for cross-weapon pipeline caching) */
  wgslCode: string
  /** Concrete constant values extracted in topological post-order */
  constValues: Float32Array
  /** Number of constraints emitted */
  numConstraints: number
  /** Effective stat stride (>= 1) */
  strideKeys: number
  /** Whether plotBins (@binding(3)) is declared and active */
  hasPlot: boolean
}

/**
 * Compiles `OptNode` constraint, target, and optional plot ASTs into a parameterized,
 * branchless WebGPU Compute Shader (WGSL).
 *
 * Numeric constants are stored in `packedStats[params.offConsts + cIdx]` rather than
 * hardcoded literals so different weapons sharing the same AST structure reuse the
 * exact same compiled `GPUComputePipeline` from cache.
 */
export function compileOptNodesToWgsl(
  constraintNodes: OptNode[],
  targetNode: OptNode,
  plotNode: OptNode | undefined,
  keyToIndex: Map<string, number>,
  numKeys: number
): CompiledWgslProgram {
  const hasPlot = Boolean(plotNode)
  const strideKeys = Math.max(1, numKeys)
  const constList: number[] = []
  const nodeExprs = new Map<OptNode, string>()
  const bodyLines: string[] = []
  let nextVarId = 1

  const emitRoots = (roots: OptNode[]) => {
    forEachNodes(
      roots,
      () => {},
      (f) => {
        if (nodeExprs.has(f)) return
        const { operation, operands } = f
        if (operation === 'const') {
          const cIdx = constList.length
          constList.push(f.value)
          const vName = `c_${cIdx}`
          bodyLines.push(
            `        let ${vName}: f32 = packedStats[params.offConsts + ${cIdx}u];`
          )
          nodeExprs.set(f, vName)
          return
        }

        const vName = `x_${nextVarId++}`
        nodeExprs.set(f, vName)

        switch (operation) {
          case 'read': {
            const kIdx = keyToIndex.get(f.path[1])!
            bodyLines.push(`        let ${vName}: f32 = st_${kIdx};`)
            break
          }
          case 'add': {
            if (operands.length === 0) {
              bodyLines.push(`        let ${vName}: f32 = 0.0;`)
            } else {
              const expr = operands.map((op) => nodeExprs.get(op)!).join(' + ')
              bodyLines.push(`        let ${vName}: f32 = ${expr};`)
            }
            break
          }
          case 'mul': {
            if (operands.length === 0) {
              bodyLines.push(`        let ${vName}: f32 = 1.0;`)
            } else {
              const expr = operands.map((op) => nodeExprs.get(op)!).join(' * ')
              bodyLines.push(`        let ${vName}: f32 = ${expr};`)
            }
            break
          }
          case 'min':
          case 'max': {
            // WGSL `min(a, b)` and `max(a, b)` are strictly binary
            const opNames = operands.map((op) => nodeExprs.get(op)!)
            const expr =
              opNames.length === 1
                ? opNames[0]
                : opNames.reduce((acc, cur) => `${operation}(${acc}, ${cur})`)
            bodyLines.push(`        let ${vName}: f32 = ${expr};`)
            break
          }
          case 'threshold': {
            // WGSL `select(falseVal, trueVal, cond)` takes false branch first, true branch second!
            const [v, t, p, fl] = operands.map((op) => nodeExprs.get(op)!)
            bodyLines.push(
              `        let ${vName}: f32 = select(${fl}, ${p}, ${v} >= ${t});`
            )
            break
          }
          case 'res': {
            const op0 = nodeExprs.get(operands[0])!
            bodyLines.push(`        let ${vName}: f32 = eval_res(${op0});`)
            break
          }
          case 'sum_frac': {
            const [x, c] = operands.map((op) => nodeExprs.get(op)!)
            bodyLines.push(
              `        let ${vName}: f32 = (${x}) / ((${x}) + (${c}));`
            )
            break
          }
          default:
            assertUnreachable(operation)
        }
      }
    )
  }

  for (let c = 0; c < constraintNodes.length; c++) {
    emitRoots([constraintNodes[c]])
    const cExpr = nodeExprs.get(constraintNodes[c])!
    bodyLines.push(
      `        if (!(${cExpr} >= packedStats[params.offMins + ${c}u])) { localFailed = localFailed + 1u; continue; }`
    )
  }

  if (!plotNode) {
    emitRoots([targetNode])
    const tExpr = nodeExprs.get(targetNode)!
    bodyLines.push(`        if (${tExpr} >= params.safeThreshold) {`)
    bodyLines.push('          let hIdx: u32 = atomicAdd(&outBuf.hitCount, 1u);')
    bodyLines.push('          if (hIdx < params.maxHits) {')
    bodyLines.push('            outBuf.hitGids[hIdx] = gid;')
    bodyLines.push('          }')
    bodyLines.push('        }')
  } else {
    emitRoots([targetNode, plotNode])
    const tExpr = nodeExprs.get(targetNode)!
    const pExpr = nodeExprs.get(plotNode)!
    bodyLines.push('        let numBins: u32 = params.plotFlags & 0xffffu;')
    bodyLines.push('        let capturePass: u32 = params.plotFlags >> 16u;')
    bodyLines.push(
      `        var shouldRecord: bool = (${tExpr} >= params.safeThreshold) && (capturePass == 0u);`
    )
    bodyLines.push('        if (numBins > 0u) {')
    bodyLines.push(
      `          let rawBin: f32 = floor((${pExpr} - params.plotMin) * params.invPlotScale + 0.5);`
    )
    bodyLines.push(
      '          let binIdx: u32 = u32(clamp(rawBin, 0.0, f32(numBins - 1u)));'
    )
    bodyLines.push(
      `          let sortScore: u32 = float_to_sortable_u32(${tExpr});`
    )
    bodyLines.push('          if (capturePass == 0u) {')
    bodyLines.push(
      '            let prevScore: u32 = atomicMax(&plotBins[binIdx], sortScore);'
    )
    bodyLines.push(
      '            if (sortScore > prevScore) { shouldRecord = true; }'
    )
    bodyLines.push('          } else {')
    bodyLines.push(
      '            let winScore: u32 = atomicLoad(&plotBins[binIdx]);'
    )
    bodyLines.push(
      '            if (winScore > 0u && sortScore >= winScore) { shouldRecord = true; }'
    )
    bodyLines.push('          }')
    bodyLines.push('        }')
    bodyLines.push('        if (shouldRecord) {')
    bodyLines.push('          let hIdx: u32 = atomicAdd(&outBuf.hitCount, 1u);')
    bodyLines.push('          if (hIdx < params.maxHits) {')
    bodyLines.push('            outBuf.hitGids[hIdx] = gid;')
    bodyLines.push('          }')
    bodyLines.push('        }')
  }

  let statSumLines = ''
  for (let k = 0; k < numKeys; k++) {
    statSumLines += `        let st_${k}: f32 = packedStats[${k}u] + packedStats[o0 + ${k}u] + packedStats[o1 + ${k}u] + packedStats[o2 + ${k}u] + packedStats[o3 + ${k}u] + packedStats[o4 + ${k}u];\n`
  }

  const plotBindingDecl = hasPlot
    ? '@group(0) @binding(3) var<storage, read_write> plotBins: array<atomic<u32>>;\n'
    : ''
  const keepAlivePlot = hasPlot ? 'atomicAdd(&plotBins[0], 0u);' : ''

  const wgslCode = `struct Params {
  n0: u32,
  n1: u32,
  n2: u32,
  n3: u32,
  n4: u32,
  off0: u32,
  off1: u32,
  off2: u32,
  off3: u32,
  off4: u32,
  offConsts: u32,
  offMins: u32,
  batchOffset: u32,
  batchCount: u32,
  gridStrideWgX: u32,
  maxHits: u32,
  safeThreshold: f32,
  plotMin: f32,
  invPlotScale: f32,
  plotFlags: u32,
}

struct OutBuffer {
  hitCount: atomic<u32>,
  failedCount: atomic<u32>,
  pad0: u32,
  pad1: u32,
  hitGids: array<u32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> packedStats: array<f32>;
@group(0) @binding(2) var<storage, read_write> outBuf: OutBuffer;
${plotBindingDecl}
var<workgroup> wgFailed: atomic<u32>;

fn eval_res(r: f32) -> f32 {
  if (r < 0.0) { return 1.0 - r * 0.5; }
  if (r >= 0.75) { return 1.0 / (r * 4.0 + 1.0); }
  return 1.0 - r;
}

fn float_to_sortable_u32(val: f32) -> u32 {
  let bits: u32 = bitcast<u32>(val);
  let mask: u32 = select(0x80000000u, 0xffffffffu, (bits & 0x80000000u) != 0u);
  return bits ^ mask;
}

@compute @workgroup_size(${WGSL_WORKGROUP_SIZE})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) lid_vec: vec3<u32>
) {
  let lid: u32 = lid_vec.x;
  if (lid == 0u) {
    atomicStore(&wgFailed, 0u);
    if (params.batchCount == 0u && wg_id.x == 0u && wg_id.y == 0u) {
      let _keep: f32 = packedStats[0];
      if (_keep > 1e38) { atomicAdd(&outBuf.hitCount, 0u); }
      ${keepAlivePlot}
    }
  }
  workgroupBarrier();

  let wgLinear: u32 = wg_id.y * params.gridStrideWgX + wg_id.x;
  let startRel: u32 = (wgLinear * ${WGSL_WORKGROUP_SIZE}u + lid) * ${WGSL_ITEMS_PER_THREAD}u;
  var localFailed: u32 = 0u;

  for (var step: u32 = 0u; step < ${WGSL_ITEMS_PER_THREAD}u; step = step + 1u) {
    let relIdx: u32 = startRel + step;
    if (relIdx < params.batchCount) {
      let gid: u32 = params.batchOffset + relIdx;
      let i4: u32 = gid % params.n4;
      let q3: u32 = gid / params.n4;
      let i3: u32 = q3 % params.n3;
      let q2: u32 = q3 / params.n3;
      let i2: u32 = q2 % params.n2;
      let q1: u32 = q2 / params.n2;
      let i1: u32 = q1 % params.n1;
      let i0: u32 = q1 / params.n1;

      let o0: u32 = params.off0 + i0 * ${strideKeys}u;
      let o1: u32 = params.off1 + i1 * ${strideKeys}u;
      let o2: u32 = params.off2 + i2 * ${strideKeys}u;
      let o3: u32 = params.off3 + i3 * ${strideKeys}u;
      let o4: u32 = params.off4 + i4 * ${strideKeys}u;

${statSumLines}${bodyLines.join('\n')}
    }
  }

  if (localFailed > 0u) {
    atomicAdd(&wgFailed, localFailed);
  }
  workgroupBarrier();

  if (lid == 0u) {
    let wf: u32 = atomicLoad(&wgFailed);
    if (wf > 0u) {
      atomicAdd(&outBuf.failedCount, wf);
    }
  }
}
`

  return {
    wgslCode,
    constValues: Float32Array.from(constList.length ? constList : [0]),
    numConstraints: constraintNodes.length,
    strideKeys,
    hasPlot,
  }
}
