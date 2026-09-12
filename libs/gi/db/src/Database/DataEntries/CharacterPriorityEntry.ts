import { zodBoolean } from '@genshin-optimizer/common/database'
import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import { allCharacterKeys } from '@genshin-optimizer/gi/consts'
import { z } from 'zod'
import type { ArtCharDatabase } from '../ArtCharDatabase'
import { DataEntry } from '../DataEntry'

export type EquippedArtifactsByCharacter = Partial<
  Record<CharacterKey, readonly string[]>
>

const characterPrioritySchema = z.object({
  orderedCharacterKeys: z.array(z.string()).catch([]),
  enabled: zodBoolean(),
})

export type CharacterPriority = Omit<
  z.infer<typeof characterPrioritySchema>,
  'orderedCharacterKeys'
> & {
  orderedCharacterKeys: CharacterKey[]
}

/**
 * Returns artifacts that are unavailable to a target because they are equipped
 * by a character above it in the configured priority order.
 */
export function getPriorityBlockedArtifactIds({
  orderedCharacterKeys,
  targetCharacterKey,
  equippedArtifactsByCharacter,
  enabled,
}: {
  orderedCharacterKeys: readonly CharacterKey[]
  targetCharacterKey: CharacterKey
  equippedArtifactsByCharacter: EquippedArtifactsByCharacter
  enabled: boolean
}): string[] {
  if (!enabled) return []
  const targetIndex = orderedCharacterKeys.indexOf(targetCharacterKey)
  if (targetIndex <= 0) return []
  return [
    ...new Set(
      orderedCharacterKeys
        .slice(0, targetIndex)
        .flatMap((key) => equippedArtifactsByCharacter[key] ?? [])
        .filter((id): id is string => !!id)
    ),
  ]
}

function normalizeCharacterKeys(
  keys: unknown,
  availableKeys: readonly CharacterKey[]
): CharacterKey[] {
  const available = new Set(availableKeys)
  const result: CharacterKey[] = []
  if (!Array.isArray(keys)) return [...availableKeys]
  for (const key of keys) {
    if (
      typeof key === 'string' &&
      available.has(key as CharacterKey) &&
      !result.includes(key as CharacterKey)
    )
      result.push(key as CharacterKey)
  }
  for (const key of availableKeys) if (!result.includes(key)) result.push(key)
  return result
}

export class CharacterPriorityEntry extends DataEntry<
  'character_priority',
  'character_priority',
  CharacterPriority,
  CharacterPriority
> {
  constructor(database: ArtCharDatabase) {
    super(
      database,
      'character_priority',
      () => ({
        orderedCharacterKeys: [...database.chars.keys],
        enabled: false,
      }),
      'character_priority'
    )
  }

  override validate(obj: unknown): CharacterPriority | undefined {
    const result = characterPrioritySchema.safeParse(obj)
    if (!result.success) return undefined
    return {
      enabled: result.data.enabled,
      orderedCharacterKeys: normalizeCharacterKeys(
        result.data.orderedCharacterKeys,
        this.database.chars.keys.filter((key): key is CharacterKey =>
          allCharacterKeys.includes(key as CharacterKey)
        )
      ),
    }
  }

  sync(characterKeys: readonly CharacterKey[]) {
    const current = this.get()
    const orderedCharacterKeys = normalizeCharacterKeys(
      current.orderedCharacterKeys,
      characterKeys
    )
    if (
      orderedCharacterKeys.length !== current.orderedCharacterKeys.length ||
      orderedCharacterKeys.some(
        (key, index) => key !== current.orderedCharacterKeys[index]
      )
    )
      this.set({ orderedCharacterKeys })
  }
}
