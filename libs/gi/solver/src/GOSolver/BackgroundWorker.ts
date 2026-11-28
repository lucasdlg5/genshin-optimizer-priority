import { assertUnreachable } from '@genshin-optimizer/common/util'
import type { RequestFilter } from '../common.js'
import {
  artSetPerm,
  countBuilds,
  filterArts,
  filterFeasiblePerm,
} from '../common.js'
import type { Setup, WorkerCommand, WorkerResult } from '../type.js'
import { BNBSplitWorker } from './BNBSplitWorker/index.js'
import { ComputeWorker } from './ComputeWorker.js'
import { DefaultSplitWorker } from './DefaultSplitWorker.js'

declare function postMessage(command: WorkerCommand | WorkerResult): void

let setupData: Setup | undefined
let splitWorker: SplitWorker | undefined
let computeWorker: ComputeWorker | undefined
let latestThreshold = Number.NEGATIVE_INFINITY

function getOrCreateSplitWorker(): SplitWorker {
  if (!splitWorker) {
    if (!setupData) throw new Error('Worker not initialized with setup')
    try {
      splitWorker = new BNBSplitWorker(setupData, (x) => postMessage(x))
    } catch {
      splitWorker = new DefaultSplitWorker(setupData, (x) => postMessage(x))
    }
    if (latestThreshold > Number.NEGATIVE_INFINITY) {
      splitWorker.setThreshold(latestThreshold)
    }
  }
  return splitWorker
}

let pendingYieldResolve: (() => void) | undefined
const yieldChannel =
  typeof MessageChannel !== 'undefined' ? new MessageChannel() : undefined
if (yieldChannel) {
  yieldChannel.port1.onmessage = () => {
    const r = pendingYieldResolve
    pendingYieldResolve = undefined
    r?.()
  }
}

function yieldToEventLoop(): Promise<void> {
  if (yieldChannel && !pendingYieldResolve) {
    return new Promise((resolve) => {
      pendingYieldResolve = resolve
      yieldChannel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function handleEvent(e: MessageEvent<WorkerCommand>): Promise<void> {
  const { data } = e,
    { command } = data
  switch (command) {
    case 'split': {
      const sw = getOrCreateSplitWorker()
      for (const filter of sw.split(data.filter, data.maxIterateSize)) {
        postMessage({ command: 'iterate', filter })
        // Yield via MessageChannel macrotask (avoiding 4ms HTML5 setTimeout clamping)
        // so incoming `threshold` messages are processed immediately.
        await yieldToEventLoop()
      }
      break
    }
    case 'iterate':
      computeWorker!.compute(data.filter)
      break
    case 'threshold': {
      if (data.threshold > latestThreshold) {
        latestThreshold = data.threshold
      }
      splitWorker?.setThreshold(data.threshold)
      computeWorker?.setThreshold(data.threshold)
      return // This is a fire-and-forget command
    }
    case 'finalize': {
      computeWorker!.refresh(true)
      const { builds, plotData } = computeWorker!
      postMessage({ resultType: 'finalize', builds, plotData })
      // Immediately drop problem references inside worker so GC can reclaim memory between passes
      setupData = undefined
      splitWorker = undefined
      computeWorker = undefined
      latestThreshold = Number.NEGATIVE_INFINITY
      break
    }
    case 'count': {
      const { exclusion, maxIterateSize } = data,
        arts = computeWorker!.arts
      const perms = filterFeasiblePerm(
        artSetPerm(
          exclusion,
          new Set(
            Object.values(arts.values).flatMap((x) => x.map((x) => x.set!))
          )
        ),
        arts
      )
      let count = 0
      for (const filter of perms) {
        postMessage({ command: 'split', filter, maxIterateSize })
        count += countBuilds(filterArts(arts, filter))
      }
      postMessage({ resultType: 'count', count })
      break
    }
    case 'setup':
      setupData = data
      splitWorker = undefined
      computeWorker = undefined
      latestThreshold = data.initialThreshold ?? Number.NEGATIVE_INFINITY
      computeWorker = new ComputeWorker(data, (x) => postMessage(x))
      break
    default:
      assertUnreachable(command)
  }
  postMessage({ resultType: 'done' })
}
onmessage = async (e: MessageEvent<WorkerCommand>) => {
  try {
    await handleEvent(e)
  } catch (e) {
    postMessage({ resultType: 'err', message: (e as any).message })
  }
}

export interface SplitWorker {
  split(filter: RequestFilter, minCount: number): Iterable<RequestFilter>
  setThreshold(newThreshold: number): void
}
