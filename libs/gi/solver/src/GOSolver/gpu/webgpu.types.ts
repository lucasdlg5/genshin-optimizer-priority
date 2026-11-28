/**
 * Self-contained WebGPU TypeScript interfaces & bitflag constants so the solver
 * compiles cleanly in TypeScript/Vite/Node without external `@webgpu/types` packages.
 */

export const GPUBufferUsageFlags = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const

export const GPUMapModeFlags = {
  READ: 0x0001,
  WRITE: 0x0002,
} as const

export interface GPUSupportedLimitsLike {
  readonly maxStorageBufferBindingSize: number
  readonly maxBufferSize: number
  readonly maxComputeWorkgroupStorageSize: number
  readonly maxComputeInvocationsPerWorkgroup: number
  readonly maxComputeWorkgroupSizeX: number
  readonly maxComputeWorkgroupsPerDimension: number
}

export interface GPUBufferDescriptorLike {
  label?: string
  size: number
  usage: number
  mappedAtCreation?: boolean
}

export interface GPUBufferLike {
  readonly size: number
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>
  getMappedRange(offset?: number, size?: number): ArrayBuffer
  unmap(): void
  destroy(): void
}

export interface GPUShaderModuleLike {
  readonly label?: string
}

export interface GPUBindGroupLayoutLike {
  readonly label?: string
}

export interface GPUComputePipelineLike {
  getBindGroupLayout(index: number): GPUBindGroupLayoutLike
}

export interface GPUBindGroupEntryLike {
  binding: number
  resource: {
    buffer: GPUBufferLike
    offset?: number
    size?: number
  }
}

export interface GPUBindGroupLike {
  readonly label?: string
}

export interface GPUComputePassEncoderLike {
  setPipeline(pipeline: GPUComputePipelineLike): void
  setBindGroup(index: number, bindGroup: GPUBindGroupLike): void
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number
  ): void
  end(): void
}

export interface GPUCommandBufferLike {
  readonly label?: string
}

export interface GPUCommandEncoderLike {
  beginComputePass(descriptor?: { label?: string }): GPUComputePassEncoderLike
  copyBufferToBuffer(
    source: GPUBufferLike,
    sourceOffset: number,
    destination: GPUBufferLike,
    destinationOffset: number,
    size: number
  ): void
  clearBuffer(buffer: GPUBufferLike, offset?: number, size?: number): void
  finish(): GPUCommandBufferLike
}

export interface GPUQueueLike {
  writeBuffer(
    buffer: GPUBufferLike,
    bufferOffset: number,
    data: ArrayBufferView | ArrayBuffer,
    dataOffset?: number,
    size?: number
  ): void
  submit(commandBuffers: GPUCommandBufferLike[]): void
}

export interface GPUDeviceLostInfoLike {
  readonly reason: string
  readonly message: string
}

export interface GPUDeviceLike {
  readonly limits: GPUSupportedLimitsLike
  readonly queue: GPUQueueLike
  readonly lost: Promise<GPUDeviceLostInfoLike>
  createBuffer(descriptor: GPUBufferDescriptorLike): GPUBufferLike
  createShaderModule(descriptor: {
    label?: string
    code: string
  }): GPUShaderModuleLike
  createComputePipelineAsync(descriptor: {
    label?: string
    layout: 'auto'
    compute: {
      module: GPUShaderModuleLike
      entryPoint: string
    }
  }): Promise<GPUComputePipelineLike>
  createBindGroup(descriptor: {
    label?: string
    layout: GPUBindGroupLayoutLike
    entries: GPUBindGroupEntryLike[]
  }): GPUBindGroupLike
  createCommandEncoder(descriptor?: { label?: string }): GPUCommandEncoderLike
  destroy(): void
}

export interface GPUAdapterLike {
  readonly limits: GPUSupportedLimitsLike
  requestDevice(descriptor?: {
    requiredLimits?: Partial<Record<keyof GPUSupportedLimitsLike, number>>
  }): Promise<GPUDeviceLike>
}

export interface GPUNavigatorLike {
  requestAdapter(options?: {
    powerPreference?: 'low-power' | 'high-performance'
  }): Promise<GPUAdapterLike | null>
}
