import type { CharacterKey } from '@genshin-optimizer/gi/consts'

export type KqmRotationStep = {
  /** Multiplier / hit count for this step in the combo sequence */
  weight: number
  /** Exact UIData display path [sectionKey, targetKey], e.g. ['burst', 'hit1'] */
  path: [string, string]
  /** Concise Portuguese description of this step in the combo (e.g. "2[N4C] — 1º Golpe (N1)") */
  description?: string
}

export type KqmRotationPreset = {
  /** Short combo notation from KQM Quick Guide (e.g. "E Q 2[N4C] N2C" or "Q E 6[N3E]") */
  comboNotation: string
  /** Concise Portuguese description of the KQM Quick Guide beginner-friendly rotation & source */
  description: string
  /** Source URL consulted on keqingmains.com (or sheet fallback note if unreleased on KQM) */
  sourceUrl: string
  /** Ordered sequence of targets representing the combo */
  steps: KqmRotationStep[]
}

export type KqmRotationBatchMap = Partial<
  Record<CharacterKey, KqmRotationPreset>
>

/** Convenience helper for defining a rotation step */
export function step(
  weight: number,
  path: [string, string],
  description?: string
): KqmRotationStep {
  return { weight, path, description }
}
