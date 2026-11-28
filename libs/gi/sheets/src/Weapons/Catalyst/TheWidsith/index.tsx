import type { WeaponKey } from '@genshin-optimizer/gi/consts'
import { allElementKeys } from '@genshin-optimizer/gi/consts'
import {
  constant,
  input,
  lookup,
  prod,
  subscript,
} from '@genshin-optimizer/gi/wr'
import { cond, st, stg, trans } from '../../../SheetUtil'
import type { IWeaponSheet } from '../../IWeaponSheet'
import { dataObjForWeaponSheet } from '../../util'
import { headerTemplate, WeaponSheet } from '../../WeaponSheet'

const key: WeaponKey = 'TheWidsith'
const [tr, trm] = trans('weapon', key)

const refinementAtkVals = [-1, 0.6, 0.75, 0.9, 1.05, 1.2]
const refinementEleDmgVals = [-1, 0.48, 0.6, 0.72, 0.84, 0.96]
const refinementEleMasVals = [-1, 240, 300, 360, 420, 480]

const [condPassivePath, condPassive] = cond(key, 'Debut')
const fullAtk_ = subscript(input.weapon.refinement, refinementAtkVals)
const fullEleDmg_ = subscript(input.weapon.refinement, refinementEleDmgVals)
const fullEleMas = subscript(input.weapon.refinement, refinementEleMasVals)

// When no specific buff is manually selected, apply the average expected value
// (1/3 of each of the 3 random buffs). When one is manually selected, apply
// only that buff and ignore the other two.
const atk_ = lookup(
  condPassive,
  {
    recitative: fullAtk_,
    aria: constant(0),
    interlude: constant(0),
  },
  prod(1 / 3, fullAtk_)
)
const eleBonus_ = Object.fromEntries(
  allElementKeys.map((ele) => [
    ele,
    lookup(
      condPassive,
      {
        aria: fullEleDmg_,
        recitative: constant(0),
        interlude: constant(0),
      },
      prod(1 / 3, fullEleDmg_)
    ),
  ])
)
const eleMas = lookup(
  condPassive,
  {
    interlude: fullEleMas,
    aria: constant(0),
    recitative: constant(0),
  },
  prod(1 / 3, fullEleMas)
)

const data = dataObjForWeaponSheet(key, {
  premod: {
    atk_,
    ...Object.fromEntries(
      allElementKeys.map((ele) => [`${ele}_dmg_`, eleBonus_[ele]])
    ),
    eleMas,
  },
})

const sheet: IWeaponSheet = {
  document: [
    {
      value: condPassive,
      path: condPassivePath,
      teamBuff: true,
      header: headerTemplate(key, st('conditional')),
      name: tr('passiveName'),
      states: {
        aria: {
          name: trm('aria'),
          fields: [
            ...allElementKeys.map((ele) => ({ node: eleBonus_[ele] })),
            {
              text: stg('duration'),
              value: 10,
              unit: 's',
            },
          ],
        },
        interlude: {
          name: trm('interlude'),
          fields: [
            {
              node: eleMas,
            },
            {
              text: stg('duration'),
              value: 10,
              unit: 's',
            },
          ],
        },
        recitative: {
          name: trm('recitative'),
          fields: [
            {
              node: atk_,
            },
            {
              text: stg('duration'),
              value: 10,
              unit: 's',
            },
          ],
        },
      },
    },
  ],
}
export default new WeaponSheet(sheet, data)
