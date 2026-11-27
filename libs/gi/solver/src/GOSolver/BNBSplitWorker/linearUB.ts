import type { OptNode } from '@genshin-optimizer/gi/wr/opt'
import type { ArtifactsBySlot } from '../../common.js'
import { computeFullArtRange } from '../../common.js'
import type { Linear } from './linbound.js'
import { linbound } from './linbound.js'
import { polyUB } from './polyUB.js'

export { type Linear, linbound }

export function linearUB(nodes: OptNode[], arts: ArtifactsBySlot): Linear[] {
  const polys = polyUB(nodes, arts)
  const minMax = computeFullArtRange(arts)

  return polys.map((poly) => {
    const result: Linear = { $c: 0 }
    for (let mIdx = 0; mIdx < poly.length; mIdx++) {
      const mon = poly[mIdx]
      const weight = mon.$k
      if (weight === 0) continue
      const bounds = mon.terms.map((key) => minMax[key])
      const { w, $c } = linbound(bounds, weight >= 0 ? 'upper' : 'lower')
      result.$c += weight * $c
      for (let i = 0; i < mon.terms.length; i++) {
        const key = mon.terms[i]
        result[key] = (result[key] ?? 0) + weight * w[i]
      }
    }
    return result
  })
}
