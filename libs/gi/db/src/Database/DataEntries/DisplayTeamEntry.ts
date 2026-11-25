import {
  zodBoolean,
  zodEnumWithDefault,
  zodFilteredArray,
  zodString,
} from '@genshin-optimizer/common/database'
import { allCharacterKeys } from '@genshin-optimizer/gi/consts'
import { z } from 'zod'
import type { ArtCharDatabase } from '../ArtCharDatabase'
import { DataEntry } from '../DataEntry'

export const teamSortKeys = ['name', 'lastEdit'] as const
export type TeamSortKey = (typeof teamSortKeys)[number]

const bulkQueueItemSchema = z.object({
  id: zodString(),
  teamId: zodString(),
  teamCharId: zodString(),
  enabled: zodBoolean(true),
  optWeapon: zodBoolean(false),
  autoEquip: zodBoolean(true),
})
export type BulkQueueItem = z.infer<typeof bulkQueueItemSchema>

const displayTeamSchema = z.object({
  ascending: zodBoolean(),
  sortType: zodEnumWithDefault(teamSortKeys, teamSortKeys[0]),
  charKeys: zodFilteredArray(allCharacterKeys, []),
  searchTerm: zodString(),
  bulkQueue: z.array(bulkQueueItemSchema).catch([]),
})
export type IDisplayTeamEntry = z.infer<typeof displayTeamSchema>

function initialState(): IDisplayTeamEntry {
  return displayTeamSchema.parse({})
}

export class DisplayTeamEntry extends DataEntry<
  'display_team',
  'display_team',
  IDisplayTeamEntry,
  IDisplayTeamEntry
> {
  constructor(database: ArtCharDatabase) {
    super(database, 'display_team', initialState, 'display_team')
  }
  override validate(obj: unknown): IDisplayTeamEntry | undefined {
    const result = displayTeamSchema.safeParse(obj)
    return result.success ? result.data : undefined
  }
}
