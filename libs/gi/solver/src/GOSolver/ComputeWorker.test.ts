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
import { describe, expect, it } from 'vitest'
import type { ArtifactsBySlot, RequestFilter } from '../common.js'
import { BNBSplitWorker } from './BNBSplitWorker/index.js'
import { ComputeWorker } from './ComputeWorker.js'
import { GOSolver } from './GOSolver.js'

const noFilter: RequestFilter = {
  flower: { kind: 'exclude', sets: new Set() },
  plume: { kind: 'exclude', sets: new Set() },
  sands: { kind: 'exclude', sets: new Set() },
  goblet: { kind: 'exclude', sets: new Set() },
  circlet: { kind: 'exclude', sets: new Set() },
}

function prng(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function makeSyntheticArts(perSlot: number): ArtifactsBySlot {
  const sets = [
    'GoldenTroupe',
    'MarechausseeHunter',
    'ObsidianCodex',
    'GladiatorsFinale',
    'EmblemOfSeveredFate',
    'GildedDreams',
    'DeepwoodMemories',
    'WanderersTroupe',
    'ViridescentVenerer',
    'NoblesseOblige',
    'ShimenawasReminiscence',
    'CrimsonWitchOfFlames',
  ] as const

  const sandsMain: [string, number][] = [
    ['atk_', 0.466],
    ['hp_', 0.466],
    ['def_', 0.583],
    ['eleMas', 186.5],
    ['enerRech_', 0.518],
  ]
  const gobletMain: [string, number][] = [
    ['atk_', 0.466],
    ['hp_', 0.466],
    ['def_', 0.583],
    ['eleMas', 186.5],
    ['pyro_dmg_', 0.466],
    ['hydro_dmg_', 0.466],
    ['electro_dmg_', 0.466],
    ['cryo_dmg_', 0.466],
    ['geo_dmg_', 0.466],
    ['dendro_dmg_', 0.466],
  ]
  const circletMain: [string, number][] = [
    ['critRate_', 0.311],
    ['critDMG_', 0.622],
    ['atk_', 0.466],
    ['hp_', 0.466],
    ['def_', 0.583],
    ['eleMas', 186.5],
    ['heal_', 0.359],
  ]
  const subPool: [string, number][] = [
    ['atk_', 0.0495],
    ['atk', 16.5],
    ['hp_', 0.0495],
    ['hp', 254],
    ['def_', 0.062],
    ['def', 19.7],
    ['eleMas', 19.8],
    ['enerRech_', 0.055],
    ['critRate_', 0.033],
    ['critDMG_', 0.066],
  ]

  const makeSlot = (prefix: string, slotIdx: number) =>
    Array.from({ length: perSlot }, (_, i) => {
      const set = sets[(i + slotIdx * 3) % sets.length]
      const baseSeed = slotIdx * 10007 + i * 31 + 1
      const values: Record<string, number> = { [set]: 1 }

      let mainKey = 'hp'
      if (slotIdx === 0) {
        mainKey = 'hp'
        values.hp = 4780
      } else if (slotIdx === 1) {
        mainKey = 'atk'
        values.atk = 311
      } else if (slotIdx === 2) {
        const [mk, mv] = sandsMain[i % sandsMain.length]
        mainKey = mk
        values[mk] = mv
      } else if (slotIdx === 3) {
        const [mk, mv] = gobletMain[i % gobletMain.length]
        mainKey = mk
        values[mk] = mv
      } else {
        const [mk, mv] = circletMain[i % circletMain.length]
        mainKey = mk
        values[mk] = mv
      }

      // Pick 4 distinct substats != mainKey and distribute 8..9 discrete rolls
      let remainingRolls = 8 + (i % 2)
      let picked = 0
      let cursor = Math.floor(prng(baseSeed) * subPool.length)
      while (picked < 4) {
        const [sk, unit] = subPool[cursor % subPool.length]
        cursor++
        if (sk === mainKey || sk in values) continue
        const rolls =
          picked === 3
            ? remainingRolls
            : 1 +
              Math.floor(
                prng(baseSeed + picked * 13 + 3) *
                  Math.max(1, remainingRolls - (3 - picked))
              )
        remainingRolls -= rolls
        const tier = 0.85 + 0.15 * prng(baseSeed + picked * 29 + 7)
        values[sk] = rolls * unit * tier
        picked++
      }

      return {
        id: `${prefix}_${i}`,
        set,
        values,
      }
    })

  return {
    base: {
      atk: 850,
      atk_: 0.25,
      critRate_: 0.05,
      critDMG_: 0.5,
      eleMas: 40,
      enerRech_: 1.0,
      pyro_dmg_: 0,
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

describe('ComputeWorker 5-slot Float64Array kernel & GOSolver preprocess', () => {
  it('matches exact brute-force top-5 builds and plotData with constraints', () => {
    const arts = makeSyntheticArts(8) // 8^5 = 32,768 builds
    const erNode = customRead(['dyn', 'enerRech_'])
    const atk = sum(
      customRead(['dyn', 'atk']),
      prod(
        850,
        sum(
          customRead(['dyn', 'atk_']),
          threshold(customRead(['dyn', 'GladiatorsFinale']), 2, 0.18, 0)
        )
      )
    )
    const critRate = min(
      1,
      max(
        0,
        sum(
          customRead(['dyn', 'critRate_']),
          threshold(customRead(['dyn', 'MarechausseeHunter']), 4, 0.36, 0),
          threshold(customRead(['dyn', 'ObsidianCodex']), 4, 0.4, 0)
        )
      )
    )
    const critDmg = sum(customRead(['dyn', 'critDMG_']), 0.2)
    const dmgBonus = sum(
      1,
      customRead(['dyn', 'pyro_dmg_']),
      threshold(customRead(['dyn', 'GoldenTroupe']), 2, 0.2, 0),
      threshold(customRead(['dyn', 'GoldenTroupe']), 4, 0.5, 0),
      prod(0.25, erNode)
    )
    const reactMult = sum(
      1.5,
      prod(2.78, frac(customRead(['dyn', 'eleMas']), 1400))
    )
    const resMult = res(customRead(['dyn', 'enemyRes_']))
    const targetNode = prod(
      atk,
      sum(1, prod(critRate, critDmg)),
      dmgBonus,
      reactMult,
      resMult
    )

    // Brute-force reference via precompute
    const refEval = precompute(
      [erNode, targetNode],
      arts.base,
      (f) => f.path[1],
      5
    )
    const expectedScores: number[] = []
    for (const f of arts.values.flower)
      for (const p of arts.values.plume)
        for (const s of arts.values.sands)
          for (const g of arts.values.goblet)
            for (const c of arts.values.circlet) {
              const [er, dmg] = refEval([f, p, s, g, c])
              if (er >= 1.2) expectedScores.push(dmg)
            }
    expectedScores.sort((a, b) => b - a)
    const expectedTop5 = expectedScores.slice(0, 5)
    expect(expectedTop5.length).toBe(5)

    // Solve via GOSolver.preprocess + BNBSplitWorker + ComputeWorker
    const setup = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: targetNode,
      constraints: [{ value: erNode, min: 1.2 }],
      exclusion: {},
      topN: 5,
    })

    const sw = new BNBSplitWorker(setup, () => {})
    const cw = new ComputeWorker(setup, () => {})
    for (const chunk of sw.split(noFilter, 500_000)) {
      cw.compute(chunk)
      sw.setThreshold(cw.threshold)
    }
    cw.refresh(true)

    expect(cw.builds.length).toBe(5)
    for (let i = 0; i < 5; i++) {
      expect(cw.builds[i].value).toBeCloseTo(expectedTop5[i], 5)
    }

    // Also verify plotBase mode
    const plotSetup = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: targetNode,
      constraints: [{ value: erNode, min: 1.2 }],
      exclusion: {},
      topN: 1,
      plotBase: erNode,
    })
    const cwPlot = new ComputeWorker(plotSetup, () => {})
    cwPlot.compute(noFilter)
    cwPlot.refresh(true)
    expect(cwPlot.builds[0].value).toBeCloseTo(expectedTop5[0], 5)
    expect(Object.keys(cwPlot.plotData ?? {}).length).toBeGreaterThan(0)
  })

  it('solves realistic 400 +20 artifact (80/slot = 3.27 billion builds) inventory with constraints in <5s single-threaded', () => {
    const arts = makeSyntheticArts(80) // 80^5 = 3,276,800,000 builds
    const erNode = customRead(['dyn', 'enerRech_'])
    const atk = sum(
      customRead(['dyn', 'atk']),
      prod(
        850,
        sum(
          customRead(['dyn', 'atk_']),
          threshold(customRead(['dyn', 'GladiatorsFinale']), 2, 0.18, 0)
        )
      )
    )
    const critRate = min(
      1,
      sum(
        customRead(['dyn', 'critRate_']),
        threshold(customRead(['dyn', 'MarechausseeHunter']), 4, 0.36, 0),
        threshold(customRead(['dyn', 'ObsidianCodex']), 4, 0.4, 0)
      )
    )
    const targetNode = prod(
      atk,
      sum(1, prod(critRate, customRead(['dyn', 'critDMG_']))),
      sum(
        1,
        customRead(['dyn', 'pyro_dmg_']),
        threshold(customRead(['dyn', 'GoldenTroupe']), 2, 0.2, 0),
        threshold(customRead(['dyn', 'GoldenTroupe']), 4, 0.5, 0)
      ),
      sum(1.5, prod(2.78, frac(customRead(['dyn', 'eleMas']), 1400)))
    )

    const t0 = performance.now()
    const setup = GOSolver.prototype.preprocess({
      arts,
      optimizationTarget: targetNode,
      constraints: [{ value: erNode, min: 1.3 }],
      exclusion: {},
      topN: 5,
    })
    const tPre = performance.now() - t0

    let tComputeTotal = 0
    const t1 = performance.now()
    const sw = new BNBSplitWorker(setup, () => {})
    const cw = new ComputeWorker(setup, () => {})
    let chunks = 0
    for (const chunk of sw.split(noFilter, 4_000_000)) {
      chunks++
      const tc0 = performance.now()
      cw.compute(chunk)
      tComputeTotal += performance.now() - tc0
      sw.setThreshold(cw.threshold)
    }
    cw.refresh(true)
    const tSolve = performance.now() - t1

    console.log(
      `[3.27B Benchmark] preprocess=${tPre.toFixed(1)}ms, seed=${setup.initialThreshold?.toFixed(1)}, solve=${tSolve.toFixed(1)}ms (compute=${tComputeTotal.toFixed(1)}ms, split=${(tSolve - tComputeTotal).toFixed(1)}ms, chunks=${chunks}), top1=${cw.builds[0]?.value.toFixed(1)}`
    )
    expect(cw.builds.length).toBe(5)
    expect(tPre + tSolve).toBeLessThan(5000)
  })
})
