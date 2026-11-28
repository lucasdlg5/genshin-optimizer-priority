import type { ArtifactSlotKey } from '@genshin-optimizer/gi/consts'
import {
  allArtifactSetKeys,
  allArtifactSlotKeys,
} from '@genshin-optimizer/gi/consts'
import type { ArtifactBuildData, ArtifactsBySlot } from '../../common.js'
import type { Linear } from './linearUB.js'

const artifactSetLookup = new Set<string>(allArtifactSetKeys)

/**
 * Binary Branch-and-Bound splitter: selects the single `(slot, stat, threshold)` split
 * that achieves the largest build-weighted reduction in `linearUB` squared approximation error:
 *   \Delta = w^2 * ( (max - min)^2 - [ (nLow/n)*(lowMax - min)^2 + (nHigh/n)*(max - highMin)^2 ] )
 *
 * - Isolates slot mainstats (Goblet DMG%, Circlet CRIT, Sands ATK%/ER/EM) in 1 exact step (`newErr = 0`).
 * - Avoids degenerate `1 vs N-1` outlier chipping on continuous substats by weighting error by `nLow/n` and `nHigh/n`
 *   and testing quantile + midpoint cutoffs.
 */
export function splitBestSingleSlot(
  appxs: Linear[],
  arts: ArtifactsBySlot
): ArtifactsBySlot[] {
  const keyWeightsSq = new Map<string, number>()
  for (let i = 0; i < appxs.length; i++) {
    const lin = appxs[i]
    for (const [k, w] of Object.entries(lin)) {
      if (k === '$c' || w === 0) continue
      keyWeightsSq.set(k, (keyWeightsSq.get(k) ?? 0) + w * w)
    }
  }

  let bestSlot: ArtifactSlotKey | undefined
  let bestPred: ((art: ArtifactBuildData) => boolean) | undefined
  let bestScore = -1

  for (let s = 0; s < 5; s++) {
    const slot = allArtifactSlotKeys[s]
    const list = arts.values[slot]
    const n = list.length
    if (n < 2) continue

    const sortedBuf = new Float64Array(n)

    for (const [stat, wSq] of keyWeightsSq.entries()) {
      let minv = Number.POSITIVE_INFINITY
      let maxv = Number.NEGATIVE_INFINITY
      let onSetCount = 0
      for (let i = 0; i < n; i++) {
        const v = list[i].values[stat] ?? 0
        sortedBuf[i] = v
        if (v < minv) minv = v
        if (v > maxv) maxv = v
        if (v > 0.5) onSetCount++
      }
      if (!(maxv > minv)) continue

      const oldErr = (maxv - minv) * (maxv - minv)
      if (wSq * oldErr <= bestScore) continue

      if (artifactSetLookup.has(stat)) {
        if (onSetCount > 0 && onSetCount < n) {
          // Binary split on indicator {0, 1} reduces range to 0 on BOTH children (`newErr = 0`)
          const score = wSq * oldErr
          if (score > bestScore) {
            bestScore = score
            bestSlot = slot
            bestPred = (art) =>
              art.set === stat || (art.values[stat] ?? 0) > 0.5
          }
        }
        continue
      }

      sortedBuf.sort()
      // Evaluate midpoint + 7 quantiles (12.5%, 25%, 37.5%, 50%, 62.5%, 75%, 87.5%) in O(log n) binary search
      const midVal = (minv + maxv) * 0.5
      let bestCutIdx = -1
      let minWeightedErr = Number.POSITIVE_INFINITY

      const testSplitIdx = (idx: number) => {
        // Lower = sortedBuf[0 .. idx-1], Upper = sortedBuf[idx .. n-1]
        if (idx <= 0 || idx >= n) return
        // Advance/retreat `idx` to a strict value boundary `sortedBuf[idx - 1] < sortedBuf[idx]`
        let splitIdx = idx
        if (sortedBuf[splitIdx - 1] === sortedBuf[splitIdx]) {
          // Try moving right first
          let r = splitIdx + 1
          while (r < n && sortedBuf[r] === sortedBuf[splitIdx]) r++
          if (r < n) {
            splitIdx = r
          } else {
            let l = splitIdx - 1
            while (l > 0 && sortedBuf[l - 1] === sortedBuf[splitIdx]) l--
            if (l <= 0) return
            splitIdx = l
          }
        }
        const rLow = sortedBuf[splitIdx - 1] - minv
        const rHigh = maxv - sortedBuf[splitIdx]
        const weightedErr =
          (splitIdx * rLow * rLow + (n - splitIdx) * rHigh * rHigh) / n
        if (weightedErr < minWeightedErr) {
          minWeightedErr = weightedErr
          bestCutIdx = splitIdx
        }
      }

      // Binary search for `midVal`
      let lo = 0
      let hi = n
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (sortedBuf[m] <= midVal) lo = m + 1
        else hi = m
      }
      testSplitIdx(lo)
      for (let q = 1; q <= 7; q++) {
        testSplitIdx((n * q) >> 3)
      }

      if (bestCutIdx > 0 && bestCutIdx < n) {
        const cutThreshold = sortedBuf[bestCutIdx]
        const score = wSq * (oldErr - minWeightedErr)
        if (score > bestScore) {
          bestScore = score
          bestSlot = slot
          bestPred = (art) => (art.values[stat] ?? 0) >= cutThreshold
        }
      }
    }
  }

  if (bestSlot && bestPred) {
    const list = arts.values[bestSlot]
    const upper: ArtifactBuildData[] = []
    const lower: ArtifactBuildData[] = []
    for (let i = 0; i < list.length; i++) {
      if (bestPred(list[i])) upper.push(list[i])
      else lower.push(list[i])
    }
    if (upper.length > 0 && lower.length > 0) {
      return [
        { base: arts.base, values: { ...arts.values, [bestSlot]: upper } },
        { base: arts.base, values: { ...arts.values, [bestSlot]: lower } },
      ]
    }
  }

  // Fallback: bisect the slot with the most artifacts
  let largestSlot: ArtifactSlotKey = 'flower'
  for (let s = 1; s < 5; s++) {
    const slot = allArtifactSlotKeys[s]
    if (arts.values[slot].length > arts.values[largestSlot].length) {
      largestSlot = slot
    }
  }
  const list = arts.values[largestSlot]
  if (list.length < 2) return []
  const half = list.length >> 1
  return [
    {
      base: arts.base,
      values: { ...arts.values, [largestSlot]: list.slice(0, half) },
    },
    {
      base: arts.base,
      values: { ...arts.values, [largestSlot]: list.slice(half) },
    },
  ]
}
