import { assertUnreachable, cartesian } from '@genshin-optimizer/common/util'
import type { DynStat, MinMax } from '../../common.js'
import { solveLP } from './solveLP.js'

export type Linear = DynStat & { $c: number }

const MAX_LP_CACHE_SIZE = 4096
const normalizedLpCache = new Map<string, number[]>()

/**
 * Constructs a linear upper/lower bound for a monomial on a bounded domain using an LP.
 *
 * Monomial is assumed to be
 *    m(x) = x1 * x2 * ... * xn
 * on bounded domain
 *    min_1 <= x1 <= max_1
 *    min_2 <= x2 <= max_2
 *    ...
 *    min_n <= xn <= max_n
 *
 * @param bounds List of min & max bounds for each xi
 * @returns A linear function L(x) = w . x + $c
 *            satisfying      m(x) <= L(x) <= m(x) + err (resp. m(x) - err <= L(x) <= m(x))
 */
export function linbound(
  bounds: MinMax[],
  direction: 'upper' | 'lower' = 'upper'
): { w: number[]; $c: number; err: number } {
  if (bounds.length === 0) return { w: [], $c: 1, err: 0 }
  if (
    bounds.length === 1 &&
    Number.isFinite(bounds[0].min) &&
    Number.isFinite(bounds[0].max)
  ) {
    return { w: [1], $c: 0, err: 0 }
  }
  const nVar = bounds.length

  // Re-scale bounds to [-1, 1] for numerical stability.
  const boundScale = bounds.map(({ min, max }) => Math.max(-min, max))
  if (boundScale.some((bnd) => bnd === 0)) {
    return { w: bounds.map((_) => 0), $c: 0, err: 0 }
  }
  const scaleProd = boundScale.reduce((prod, v) => prod * v, 1)
  bounds = bounds.map(({ min, max }, i) => ({
    min: min / boundScale[i],
    max: max / boundScale[i],
  }))

  const canCache = bounds.every(
    ({ min, max }) => Number.isFinite(min) && Number.isFinite(max)
  )
  const cacheKey = canCache
    ? `${direction}|${bounds.map(({ min, max }) => `${min},${max}`).join(';')}`
    : ''

  let soln = cacheKey ? normalizedLpCache.get(cacheKey) : undefined
  if (!soln) {
    // Setting up the linear program in terms of constraints.
    //   cartesian(bounds) loops 2^nVar times
    const cons = cartesian(...bounds.map(({ min, max }) => [min, max])).flatMap(
      (coords) => {
        const prod = coords.reduce((prod, v) => prod * v, 1)
        const sum = coords.reduce((sum, v) => sum + v, 0)
        switch (direction) {
          case 'upper':
            return [
              [...coords, -1, 0, sum - prod - nVar],
              [...coords.map((v) => -v), 1, -1, nVar + prod - sum],
            ]
          case 'lower':
            return [
              [...coords.map((v) => -v), -1, 0, prod - sum - nVar],
              [...coords, 1, -1, nVar + sum - prod],
            ]
          default:
            assertUnreachable(direction)
        }
      }
    )

    const objective = [...bounds.map((_) => 0), 0, 1]
    try {
      soln = solveLP(objective, cons)
      if (cacheKey) {
        if (normalizedLpCache.size >= MAX_LP_CACHE_SIZE) {
          normalizedLpCache.clear()
        }
        normalizedLpCache.set(cacheKey, soln)
      }
    } catch (e) {
      console.log('ERROR on bounds', bounds)
      console.log('Possibly numerical instability issue.')
      console.log(e)
      throw e
    }
  }

  switch (direction) {
    case 'upper':
      return {
        w: soln
          .slice(0, nVar)
          .map((wi, i) => ((1 - wi) * scaleProd) / boundScale[i]),
        $c: scaleProd * (soln[nVar] - nVar),
        err: scaleProd * soln[nVar + 1],
      }
    case 'lower':
      return {
        w: soln
          .slice(0, nVar)
          .map((wi, i) => ((1 - wi) * scaleProd) / boundScale[i]),
        $c: scaleProd * (nVar - soln[nVar]),
        err: scaleProd * soln[nVar + 1],
      }
    default:
      assertUnreachable(direction)
  }
}
