import { zodBoolean } from '@genshin-optimizer/common/database'
import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import { z } from 'zod'
import type { ArtCharDatabase } from '../ArtCharDatabase'
import { DataEntry } from '../DataEntry'

export const bulkBuildSelectionSchema = z.object({
  characterKey: z.string(),
  mode: z.enum(['solo', 'team']).catch('solo'),
  teamId: z.string().optional(),
})
export type BulkBuildSelection = z.infer<typeof bulkBuildSelectionSchema> & {
  characterKey: CharacterKey
}

const displayBulkBuildsSchema = z.object({
  selections: z.array(bulkBuildSelectionSchema).catch([]),
  priorityEnabled: zodBoolean(),
  stopOnError: zodBoolean(true),
})
export type DisplayBulkBuilds = Omit<
  z.infer<typeof displayBulkBuildsSchema>,
  'selections'
> & {
  selections: BulkBuildSelection[]
}

export class DisplayBulkBuildsEntry extends DataEntry<
  'display_bulk_builds',
  'display_bulk_builds',
  DisplayBulkBuilds,
  DisplayBulkBuilds
> {
  constructor(database: ArtCharDatabase) {
    super(
      database,
      'display_bulk_builds',
      () => ({
        selections: [],
        priorityEnabled: false,
        stopOnError: true,
      }),
      'display_bulk_builds'
    )
  }

  override validate(obj: unknown): DisplayBulkBuilds | undefined {
    const result = displayBulkBuildsSchema.safeParse(obj)
    if (!result.success) return undefined
    const characters = new Set(this.database.chars.keys)
    const teams = new Set(this.database.teams.keys)
    const selections: BulkBuildSelection[] = []
    for (const selection of result.data.selections) {
      if (!characters.has(selection.characterKey)) continue
      if (selections.some((item) => item.characterKey === selection.characterKey))
        continue
      if (selection.mode === 'team' && (!selection.teamId || !teams.has(selection.teamId)))
        selections.push({ characterKey: selection.characterKey, mode: 'solo' })
      else selections.push(selection as BulkBuildSelection)
    }
    return {
      selections,
      priorityEnabled: result.data.priorityEnabled,
      stopOnError: result.data.stopOnError,
    }
  }

  sync(characterKeys: readonly string[], teamIds: readonly string[]) {
    const current = this.get()
    const characters = new Set(characterKeys)
    const teams = new Set(teamIds)
    const selections = current.selections
      .filter((selection) => characters.has(selection.characterKey))
      .map((selection) =>
        selection.mode === 'team' &&
        (!selection.teamId || !teams.has(selection.teamId))
          ? { characterKey: selection.characterKey, mode: 'solo' as const }
          : selection
      )
    if (JSON.stringify(selections) !== JSON.stringify(current.selections))
      this.set({ selections })
  }
}
