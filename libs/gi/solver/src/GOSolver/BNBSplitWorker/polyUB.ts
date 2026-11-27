import { assertUnreachable } from '@genshin-optimizer/common/util'
import type { ConstantNode, OptNode } from '@genshin-optimizer/gi/wr/opt'
import {
  allOperations,
  customMapFormula,
  forEachNodes,
  prod,
  threshold,
} from '@genshin-optimizer/gi/wr/opt'
import type { ArtifactsBySlot, MinMax } from '../../common.js'
import { computeFullArtRange, computeNodeRange } from '../../common.js'
import type { Linear } from './linbound.js'
import { linbound } from './linbound.js'

/**
 * With xi being the variables and pi(x1, x2, ...) being polynomials on xi
 *    LinTerm  = $c + w1*x1 + w2*x2 + ...
 *    PolyProd = $k * p1 * p2 * ...
 *    PolySum  = $c + p1 + p2 + ...
 *
 * $c is used as additive constant, $k is used as multiplicative constant.
 */
export type PolynomialWithBounds = PolyProd | PolySum | LinTerm
type LinTerm = { type: 'lin'; lin: Linear; min: number; max: number }
type PolyProd = {
  type: 'prod'
  terms: PolynomialWithBounds[]
  $k: number
  min: number
  max: number
}
type PolySum = {
  type: 'sum'
  terms: PolynomialWithBounds[]
  $c: number
  min: number
  max: number
}

function constP(n: number): LinTerm {
  return { type: 'lin', lin: { $c: n }, min: n, max: n }
}
function readP(k: string, minmax: MinMax): LinTerm {
  return { type: 'lin', lin: { [k]: 1, $c: 0 }, ...minmax }
}
function sumP(...terms: (PolynomialWithBounds | number)[]): PolySum {
  const c = (terms.filter((v) => typeof v === 'number') as number[]).reduce(
    (a, b) => a + b,
    0
  )
  const poly = terms.filter(
    (v) => typeof v !== 'number'
  ) as PolynomialWithBounds[]
  return {
    type: 'sum',
    terms: poly,
    $c: c,
    min: poly.reduce((a, { min }) => a + min, c),
    max: poly.reduce((a, { max }) => a + max, c),
  }
}
function prodP(...terms: (PolynomialWithBounds | number)[]): PolyProd {
  const k = (terms.filter((v) => typeof v === 'number') as number[]).reduce(
    (a, b) => a * b,
    1
  )
  const poly = terms.filter(
    (v) => typeof v !== 'number'
  ) as PolynomialWithBounds[]
  const minMax = poly.reduce(
    ({ min: min1, max: max1 }, { min: min2, max: max2 }) => {
      return {
        min: Math.min(min1 * min2, min1 * max2, max1 * min2, max1 * max2),
        max: Math.max(min1 * min2, min1 * max2, max1 * min2, max1 * max2),
      }
    },
    { min: k, max: k }
  )
  return { type: 'prod', terms: poly, $k: k, ...minMax }
}

function slopePoint(
  slope: number,
  x0: number,
  y0: number,
  poly: PolynomialWithBounds
): PolynomialWithBounds {
  return sumP(y0 - slope * x0, prodP(slope, poly))
}
function interpolate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  poly: PolynomialWithBounds,
  upper: boolean
): PolynomialWithBounds {
  if (Math.abs(x0 - x1) < 1e-10)
    return constP(upper ? Math.max(y0, y1) : Math.min(y0, y1))
  return slopePoint((y1 - y0) / (x1 - x0), x0, y0, poly)
}

export function polyUB(
  nodes: OptNode[],
  arts: ArtifactsBySlot
): SumOfMonomials[] {
  const minMaxes = new Map<OptNode, MinMax>()
  forEachNodes(
    nodes,
    (f) => {
      const { operation } = f
      if (operation === 'mul')
        minMaxes.set(f, { min: Number.NaN, max: Number.NaN })
      switch (operation) {
        case 'mul':
        case 'min':
        case 'max':
        case 'threshold':
        case 'res':
        case 'sum_frac':
          f.operands.forEach((op) =>
            minMaxes.set(op, { min: Number.NaN, max: Number.NaN })
          )
      }
    },
    (_) => _
  )
  const statMinMax = computeFullArtRange(arts)
  const nodeRanges = computeNodeRange([...minMaxes.keys()], statMinMax)
  for (const [node, minMax] of nodeRanges.entries()) minMaxes.set(node, minMax)

  const upper = 'u',
    lower = 'l',
    exact = 'e'
  type Context = typeof upper | typeof lower | typeof exact
  const poly = customMapFormula<Context, PolynomialWithBounds, OptNode>(
    nodes,
    upper,
    (f, context, _map) => {
      const { operation } = f
      const map: (op: OptNode, c?: Context) => PolynomialWithBounds = (
        op,
        c = context
      ) => _map(op, c)
      const oppositeContext = context === upper ? lower : upper

      switch (operation) {
        case 'const':
          return constP(f.value)
        case 'read':
          return readP(f.path[1], minMaxes.get(f)!)
        case 'add':
          return sumP(...f.operands.map((op) => map(op)))
        case 'mul': {
          if (context === exact)
            return prodP(...f.operands.map((op) => map(op)))
          const { min: minf, max: maxf } = minMaxes.get(f)!
          if (minf === maxf) return constP(minf) // Handles zero coeff
          const zeroCrossing =
            minf * maxf < 0 ||
            f.operands.some((op) => {
              const { min, max } = minMaxes.get(op)!
              return min * max < 0
            })
          if (zeroCrossing) return map(f, exact)

          const signf = minf === 0 ? maxf : minf
          const op = allOperations[operation]
          const k = op(
            f.operands
              .filter((op) => op.operation === 'const')
              .map((c) => (c as ConstantNode<number>).value)
          )
          const polys = f.operands
            .filter((op) => op.operation !== 'const')
            .map((op) => {
              const { min, max } = minMaxes.get(op)!
              const sign = min === 0 ? max : min
              const ctx = signf * sign > 0 ? context : oppositeContext
              const p = map(op, ctx)

              if (
                (ctx === lower && max > 0 && p.min < -min) ||
                (ctx === upper && min < 0 && p.max > -max)
              )
                throw new PolyError(
                  'Unallowed large crossing post approximation',
                  operation
                )

              return p
            })
          return prodP(k, ...polys)
        }
        case 'min':
        case 'max': {
          if (context === exact)
            throw new PolyError('Cannot be exactly represented', operation)
          const op = allOperations[operation]
          const xs = f.operands.filter((op) => op.operation !== 'const'),
            [xOp] = xs
          if (xs.length !== 1) throw new PolyError('Multivariate', operation)

          const x = map(xOp),
            c = op(
              f.operands
                .filter((op) => op.operation === 'const')
                .map((c) => (c as ConstantNode<number>).value)
            )
          if (
            (operation === 'max' && context === lower) ||
            (operation === 'min' && context === upper)
          )
            return x
          const { min, max } = minMaxes.get(xOp)!,
            yMin = op([min, c]),
            yMax = op([max, c])
          return interpolate(min, yMin, max, yMax, x, context === upper)
        }
        case 'res': {
          if (context === exact)
            throw new PolyError('Cannot be exactly represented', operation)
          if (context === lower)
            throw new PolyError('Unsupported direction', operation)
          const op = allOperations[operation]
          const [xOp] = f.operands,
            { min, max } = minMaxes.get(xOp)!
          const x = map(xOp, oppositeContext)
          // Linear region 1 - base/2 or concave region with peak at base = 0
          if (min < 0 && max < 1.75) return sumP(1, prodP(-0.5, x))
          // Clamp `min` to guarantee upper bound
          else
            return interpolate(
              min,
              op([min]),
              max,
              op([max]),
              x,
              context === upper
            )
        }
        case 'sum_frac': {
          if (context === exact)
            throw new PolyError('Cannot be exactly represented', operation)
          if (context === lower)
            throw new PolyError('Unsupported direction', operation)
          const [xOp, cOp] = f.operands
          if (cOp.operation !== 'const')
            throw new PolyError('Non-constant node', operation)
          const x = map(xOp),
            c = cOp.value,
            { min, max } = minMaxes.get(xOp)!
          if (min <= -c)
            throw new PolyError('Unallowed negative argument', operation)
          const loc = Math.sqrt((min + c) * (max + c))
          return slopePoint(c / (loc + c) / (loc + c), loc, loc / (loc + c), x)
        }
        case 'threshold': {
          if (context === exact)
            throw new PolyError('Cannot be exactly represented', operation)
          const [vOp, tOp, pOp, fOp] = f.operands
          if (tOp.operation !== 'const')
            throw new PolyError('Non-constant node', operation)
          const { min, max } = minMaxes.get(vOp)!
          if (min >= tOp.value) return map(pOp)
          if (max < tOp.value) return map(fOp)

          if (fOp.operation !== 'const')
            throw new PolyError('Non-constant node', operation)
          if (pOp.operation !== 'const') {
            if (fOp.value !== 0)
              throw new PolyError('Unsupported pattern', operation)

            const threshOp = threshold(vOp, tOp, 1, fOp),
              mulOp = prod(threshOp, pOp)
            // Populate `minMaxes` to ensure consistency
            const { min, max } = minMaxes.get(pOp)!
            minMaxes.set(threshOp, { min: 0, max: 1 })
            minMaxes.set(mulOp, {
              min: Math.min(min, 0),
              max: Math.max(max, 0),
            })
            return map(mulOp)
          }
          const thresh = tOp.value,
            pass = pOp.value,
            fail = fOp.value
          const isFirstHalf = pass > fail === (context === upper)

          const v = map(vOp, isFirstHalf ? upper : lower)
          if (isFirstHalf) {
            const slope = (pass - fail) / (thresh - min)
            return slopePoint(slope, thresh, pass, v)
          }
          // not first half -> return const(fail)
          // Can also interpolate slopePoint on 2nd half, but I choose not to
          return constP(fail)
        }
        default:
          assertUnreachable(operation)
      }
    }
  )

  const expandCaches = {
    upper: new Map<PolynomialWithBounds, readonly Monomial[]>(),
    lower: new Map<PolynomialWithBounds, readonly Monomial[]>(),
    exact: new Map<PolynomialWithBounds, readonly Monomial[]>(),
  }
  return poly.map((p) => expandPoly(p, statMinMax, expandCaches))
}

export type SumOfMonomials = Monomial[]
type Monomial = {
  $k: number
  terms: string[]
}

const MAX_MONOMIALS = 60_000
const MAX_MONOMIAL_DEGREE = 8
const COLLAPSE_PRODUCT_LIMIT = 8_192

function mergeSortedTerms(
  a: readonly string[],
  b: readonly string[]
): string[] {
  if (a.length === 0) return [...b]
  if (b.length === 0) return [...a]
  const out = new Array<string>(a.length + b.length)
  let i = 0
  let j = 0
  let k = 0
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) out[k++] = a[i++]
    else out[k++] = b[j++]
  }
  while (i < a.length) out[k++] = a[i++]
  while (j < b.length) out[k++] = b[j++]
  return out
}

function finalizeMonomialMap(acc: Map<string, Monomial>): Monomial[] {
  const result: Monomial[] = []
  for (const m of acc.values()) {
    if (m.$k !== 0) result.push(m)
  }
  result.sort(({ terms: termsA }, { terms: termsB }) => {
    if (termsA.length !== termsB.length) return termsA.length - termsB.length
    for (let i = 0; i < termsA.length; i++) {
      if (termsA[i] !== termsB[i]) return termsA[i] < termsB[i] ? -1 : +1
    }
    return 0
  })
  return result
}

function addFoldedLists(
  lists: readonly (readonly Monomial[])[],
  c: number
): Monomial[] {
  const acc = new Map<string, Monomial>()
  if (c !== 0) {
    acc.set('', { $k: c, terms: [] })
  }
  for (const list of lists) {
    for (const m of list) {
      if (m.$k === 0) continue
      const key = m.terms.join('\0')
      const existing = acc.get(key)
      if (existing) {
        existing.$k += m.$k
      } else {
        if (acc.size >= MAX_MONOMIALS) {
          throw new PolyError('Excessive monomial count', 'add')
        }
        acc.set(key, { $k: m.$k, terms: [...m.terms] })
      }
    }
  }
  return finalizeMonomialMap(acc)
}

function multiplyFoldedPair(
  a: readonly Monomial[],
  b: readonly Monomial[]
): Monomial[] {
  if (a.length === 0 || b.length === 0) return []
  const acc = new Map<string, Monomial>()
  for (let i = 0; i < a.length; i++) {
    const ma = a[i]
    if (ma.$k === 0) continue
    for (let j = 0; j < b.length; j++) {
      const mb = b[j]
      if (mb.$k === 0) continue
      const k = ma.$k * mb.$k
      if (k === 0) continue
      const terms = mergeSortedTerms(ma.terms, mb.terms)
      if (terms.length > MAX_MONOMIAL_DEGREE) {
        throw new PolyError('Excessive polynomial degree', 'mul')
      }
      const key = terms.join('\0')
      const existing = acc.get(key)
      if (existing) {
        existing.$k += k
      } else {
        if (acc.size >= MAX_MONOMIALS) {
          throw new PolyError('Excessive monomial count', 'mul')
        }
        acc.set(key, { $k: k, terms })
      }
    }
  }
  return finalizeMonomialMap(acc)
}

function collapseToLinearMonomials(
  mons: readonly Monomial[],
  minMax: Record<string, MinMax>,
  direction: 'upper' | 'lower'
): Monomial[] {
  const acc = new Map<string, Monomial>()
  const addTerm = (key: string, val: number) => {
    if (val === 0) return
    const ex = acc.get(key)
    if (ex) ex.$k += val
    else acc.set(key, { $k: val, terms: key ? [key] : [] })
  }

  for (let idx = 0; idx < mons.length; idx++) {
    const mon = mons[idx]
    const weight = mon.$k
    if (weight === 0) continue
    if (mon.terms.length === 0) {
      addTerm('', weight)
    } else if (mon.terms.length === 1) {
      addTerm(mon.terms[0], weight)
    } else {
      const bounds = mon.terms.map((k) => minMax[k])
      const monDir = weight >= 0 === (direction === 'upper') ? 'upper' : 'lower'
      const { w, $c } = linbound(bounds, monDir)
      addTerm('', weight * $c)
      for (let i = 0; i < mon.terms.length; i++) {
        addTerm(mon.terms[i], weight * w[i])
      }
    }
  }
  return finalizeMonomialMap(acc)
}

type ExpandDir = 'upper' | 'lower' | 'exact'

function expandPoly(
  node: PolynomialWithBounds,
  statMinMax: Record<string, MinMax>,
  caches: Record<ExpandDir, Map<PolynomialWithBounds, readonly Monomial[]>>
): SumOfMonomials {
  function toExpandedPoly(
    n: PolynomialWithBounds,
    dir: ExpandDir
  ): readonly Monomial[] {
    const cache = caches[dir]
    const hit = cache.get(n)
    if (hit) return hit

    let res: Monomial[]
    switch (n.type) {
      case 'lin': {
        const acc = new Map<string, Monomial>()
        for (const [k, v] of Object.entries(n.lin)) {
          if (v === 0) continue
          if (k === '$c') {
            const ex = acc.get('')
            if (ex) ex.$k += v
            else acc.set('', { $k: v, terms: [] })
          } else {
            const ex = acc.get(k)
            if (ex) ex.$k += v
            else acc.set(k, { $k: v, terms: [k] })
          }
        }
        res = finalizeMonomialMap(acc)
        break
      }
      case 'sum': {
        const childLists = n.terms.map((t) => toExpandedPoly(t, dir))
        res = addFoldedLists(childLists, n.$c)
        break
      }
      case 'prod': {
        if (n.$k === 0) {
          res = []
          break
        }
        const allFixedSign =
          dir !== 'exact' && n.terms.every((t) => t.min >= 0 || t.max <= 0)

        if (!allFixedSign) {
          const factors = n.terms
            .map((t) => toExpandedPoly(t, 'exact'))
            .sort((a, b) => a.length - b.length)
          if (factors.some((f) => f.length === 0)) {
            res = []
            break
          }
          let cur: readonly Monomial[] = [{ $k: n.$k, terms: [] }]
          for (const factor of factors) {
            cur = multiplyFoldedPair(cur, factor)
            if (cur.length === 0) break
          }
          res = cur as Monomial[]
          break
        }

        let totalSign = n.$k >= 0 ? 1 : -1
        const childSigns = n.terms.map((t) => {
          const s = t.max <= 0 && t.min < 0 ? -1 : 1
          totalSign *= s
          return s
        })

        const nonNegFactors: (readonly Monomial[])[] = []
        let hasZeroFactor = false
        for (let i = 0; i < n.terms.length; i++) {
          const childSign = childSigns[i]
          const otherSign = totalSign * childSign
          const childDir: ExpandDir =
            otherSign > 0 ? dir : dir === 'upper' ? 'lower' : 'upper'
          const expanded = toExpandedPoly(n.terms[i], childDir)
          if (expanded.length === 0) {
            hasZeroFactor = true
            break
          }
          nonNegFactors.push(
            childSign < 0
              ? expanded.map((m) => ({ $k: -m.$k, terms: m.terms }))
              : expanded
          )
        }

        if (hasZeroFactor) {
          res = []
          break
        }

        nonNegFactors.sort((a, b) => a.length - b.length)
        const prodDir: 'upper' | 'lower' =
          totalSign > 0 === (dir === 'upper') ? 'upper' : 'lower'

        let cur: readonly Monomial[] = [{ $k: Math.abs(n.$k), terms: [] }]
        for (const factor of nonNegFactors) {
          if (
            cur.length * factor.length > COLLAPSE_PRODUCT_LIMIT &&
            cur.some((m) => m.terms.length > 1)
          ) {
            cur = collapseToLinearMonomials(cur, statMinMax, prodDir)
          }
          cur = multiplyFoldedPair(cur, factor)
          if (cur.length === 0) break
        }

        res =
          totalSign < 0
            ? cur.map((m) => ({ $k: -m.$k, terms: [...m.terms] }))
            : (cur as Monomial[])
        break
      }
    }

    cache.set(n, res)
    return res
  }

  return toExpandedPoly(node, 'upper').map((m) => ({
    $k: m.$k,
    terms: [...m.terms],
  }))
}

class PolyError extends Error {
  constructor(cause: string, operation: string) {
    super(
      `Found ${cause} in ${operation} node when generating polynomial upper bound`
    )
  }
}
