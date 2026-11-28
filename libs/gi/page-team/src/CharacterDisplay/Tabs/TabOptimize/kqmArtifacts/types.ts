import type { ArtSetExclusionKey } from '@genshin-optimizer/gi/db'

export type KqmArtifactSetKey = Exclude<ArtSetExclusionKey, 'rainbow'>

export type KqmArtifactPreset = {
  /** Primary recommended 4pc artifact set(s) from KQM Quick Guide */
  sets4: KqmArtifactSetKey[]
  /** Whether 2pc+2pc mixed sets are also allowed (e.g. Arlecchino, Nilou, Shenhe) */
  allow2pc: boolean
  /** Concise Portuguese summary of the KQM recommendation */
  description: string
  /** Source URL consulted on keqingmains.com */
  sourceUrl: string
}
