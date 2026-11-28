import type {
  GPUBufferLike,
  GPUComputePipelineLike,
  GPUDeviceLike,
  GPUNavigatorLike,
} from './webgpu.types.js'
import { GPUBufferUsageFlags } from './webgpu.types.js'

const GPU_PREF_STORAGE_KEY = 'go_webgpu_accel_enabled'
const prefListeners = new Set<() => void>()

let mockGpuProvider: GPUNavigatorLike | null | undefined

/** Test hook allowing Node/Vitest unit tests to inject a deterministic WebGPU mock */
export function setMockGpuNavigator(
  mock: GPUNavigatorLike | null | undefined
): void {
  mockGpuProvider = mock
  resetSolverGpuContext()
}

function getRawGpuNavigator(): GPUNavigatorLike | undefined {
  if (mockGpuProvider !== undefined) return mockGpuProvider ?? undefined
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return (navigator as unknown as { gpu?: GPUNavigatorLike }).gpu
  }
  return undefined
}

export function isWebGPUSupported(): boolean {
  return Boolean(getRawGpuNavigator())
}

export function getGpuAccelerationEnabled(): boolean {
  if (!isWebGPUSupported()) return false
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(GPU_PREF_STORAGE_KEY)
      if (raw !== null) return raw === 'true'
    }
  } catch {
    // Ignore storage access errors in sandboxed/worker contexts
  }
  // Enabled by default whenever WebGPU is available
  return true
}

export function setGpuAccelerationEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GPU_PREF_STORAGE_KEY, enabled ? 'true' : 'false')
    }
  } catch {
    // Ignore storage access errors
  }
  for (const listener of prefListeners) listener()
}

export function subscribeGpuAcceleration(listener: () => void): () => void {
  prefListeners.add(listener)
  return () => {
    prefListeners.delete(listener)
  }
}

export interface SolverGpuContext {
  device: GPUDeviceLike
  pipelineCache: Map<string, GPUComputePipelineLike>
  paramsBuffer: GPUBufferLike
  statsBuffer: GPUBufferLike
  outBuffer: GPUBufferLike
  stagingBuffer: GPUBufferLike
  plotBuffer: GPUBufferLike
  plotStagingBuffer: GPUBufferLike
}

export const GPU_MAX_HITS = 65536
export const GPU_OUT_META_U32S = 4 // [hitCount, failedCount, pad0, pad1]
export const GPU_OUT_BUFFER_BYTES = (GPU_OUT_META_U32S + GPU_MAX_HITS) * 4
export const GPU_PARAMS_BYTES = 80 // 20 x 4-byte scalars (16-byte aligned)
export const GPU_PLOT_BINS = 4096
export const GPU_PLOT_BUFFER_BYTES = GPU_PLOT_BINS * 4

let cachedContextPromise: Promise<SolverGpuContext | null> | null = null
let activeContext: SolverGpuContext | null = null

export function resetSolverGpuContext(): void {
  if (activeContext) {
    try {
      activeContext.paramsBuffer.destroy()
      activeContext.statsBuffer.destroy()
      activeContext.outBuffer.destroy()
      activeContext.stagingBuffer.destroy()
      activeContext.plotBuffer.destroy()
      activeContext.plotStagingBuffer.destroy()
      activeContext.device.destroy()
    } catch {
      // Ignore cleanup errors on lost devices
    }
    activeContext = null
  }
  cachedContextPromise = null
}

export function ensureStatsBufferCapacity(
  ctx: SolverGpuContext,
  requiredBytes: number
): GPUBufferLike {
  const aligned = Math.max(4096, Math.ceil(requiredBytes / 256) * 256)
  if (ctx.statsBuffer.size >= aligned) return ctx.statsBuffer
  const nextSize = Math.max(aligned, ctx.statsBuffer.size * 2)
  ctx.statsBuffer.destroy()
  ctx.statsBuffer = ctx.device.createBuffer({
    label: 'go-solver-packed-stats',
    size: nextSize,
    usage: GPUBufferUsageFlags.STORAGE | GPUBufferUsageFlags.COPY_DST,
  })
  return ctx.statsBuffer
}

export function getSolverGpuContext(): Promise<SolverGpuContext | null> {
  if (!isWebGPUSupported()) return Promise.resolve(null)
  if (cachedContextPromise) return cachedContextPromise

  cachedContextPromise = (async () => {
    try {
      const gpu = getRawGpuNavigator()
      if (!gpu) return null
      const adapter = await gpu.requestAdapter({
        powerPreference: 'high-performance',
      })
      if (!adapter) return null

      const maxStorage = Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        256 * 1024 * 1024
      )
      const maxBuf = Math.min(adapter.limits.maxBufferSize, 256 * 1024 * 1024)

      const device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: maxStorage,
          maxBufferSize: maxBuf,
        },
      })

      const paramsBuffer = device.createBuffer({
        label: 'go-solver-params',
        size: GPU_PARAMS_BYTES,
        usage: GPUBufferUsageFlags.UNIFORM | GPUBufferUsageFlags.COPY_DST,
      })
      const statsBuffer = device.createBuffer({
        label: 'go-solver-packed-stats',
        size: 256 * 1024,
        usage: GPUBufferUsageFlags.STORAGE | GPUBufferUsageFlags.COPY_DST,
      })
      const outBuffer = device.createBuffer({
        label: 'go-solver-out-hits',
        size: GPU_OUT_BUFFER_BYTES,
        usage:
          GPUBufferUsageFlags.STORAGE |
          GPUBufferUsageFlags.COPY_SRC |
          GPUBufferUsageFlags.COPY_DST,
      })
      const stagingBuffer = device.createBuffer({
        label: 'go-solver-staging-hits',
        size: GPU_OUT_BUFFER_BYTES,
        usage: GPUBufferUsageFlags.MAP_READ | GPUBufferUsageFlags.COPY_DST,
      })
      const plotBuffer = device.createBuffer({
        label: 'go-solver-plot-bins',
        size: GPU_PLOT_BUFFER_BYTES,
        usage:
          GPUBufferUsageFlags.STORAGE |
          GPUBufferUsageFlags.COPY_SRC |
          GPUBufferUsageFlags.COPY_DST,
      })
      const plotStagingBuffer = device.createBuffer({
        label: 'go-solver-plot-staging',
        size: GPU_PLOT_BUFFER_BYTES,
        usage: GPUBufferUsageFlags.MAP_READ | GPUBufferUsageFlags.COPY_DST,
      })

      const ctx: SolverGpuContext = {
        device,
        pipelineCache: new Map(),
        paramsBuffer,
        statsBuffer,
        outBuffer,
        stagingBuffer,
        plotBuffer,
        plotStagingBuffer,
      }
      activeContext = ctx

      device.lost.then(() => {
        if (activeContext === ctx) {
          activeContext = null
          cachedContextPromise = null
        }
      })

      return ctx
    } catch {
      cachedContextPromise = null
      return null
    }
  })()

  return cachedContextPromise
}
