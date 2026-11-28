import type { BuildTc } from '@genshin-optimizer/gi/db'
import type { NumNode, OptNode } from '@genshin-optimizer/gi/wr/opt'
import { optimizeTcUsingNodesAsync } from './optimizeTc.js'

type WorkerData = {
  nodes: OptNode[]
  valueFilter: Array<{ value: NumNode; minimum: number }>
  buildTc: BuildTc
  useGpu?: boolean
}

onmessage = async (e: MessageEvent<WorkerData>) => {
  const { nodes, valueFilter, buildTc, useGpu } = e.data
  await optimizeTcUsingNodesAsync(
    nodes,
    valueFilter,
    buildTc,
    (r) => postMessage(r),
    useGpu ?? true
  )
}

export default {}
