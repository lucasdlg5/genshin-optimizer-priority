import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'

export type BulkBuildQueueItem = BulkBuildSelection
export type BulkBuildQueueStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export type BulkBuildQueueUpdate = {
  index: number
  item: BulkBuildQueueItem
  status: BulkBuildQueueStatus
  error?: Error
}

export type BulkBuildQueueRunner = (
  item: BulkBuildQueueItem,
  signal: AbortSignal
) => Promise<void>

export type BulkBuildQueueOptions = {
  stopOnError?: boolean
  beforeRun?: (item: BulkBuildQueueItem) => void | Promise<void>
  onUpdate?: (update: BulkBuildQueueUpdate) => void
}

export function validateBulkBuildSelections(
  selections: readonly BulkBuildQueueItem[],
  characterKeys: readonly string[],
  teamIds: readonly string[]
): string[] {
  const errors: string[] = []
  const characters = new Set(characterKeys)
  const teams = new Set(teamIds)
  const selected = new Set<string>()
  selections.forEach((selection, index) => {
    if (!characters.has(selection.characterKey))
      errors.push(`Selection ${index + 1} references an unknown character`)
    if (selected.has(selection.characterKey))
      errors.push(`Character ${selection.characterKey} is selected more than once`)
    selected.add(selection.characterKey)
    if (selection.mode === 'team' && (!selection.teamId || !teams.has(selection.teamId)))
      errors.push(`Selection ${index + 1} references an unknown team`)
  })
  return errors
}

export function resolveBulkBuildSelection(
  selection: BulkBuildQueueItem,
  teams: Readonly<Record<string, readonly string[]>>
):
  | { mode: 'solo'; characterKey: string }
  | { mode: 'team'; characterKey: string; teamId: string } {
  if (selection.mode === 'solo') {
    return { mode: 'solo', characterKey: selection.characterKey }
  }
  if (selection.teamId && teams[selection.teamId]?.includes(selection.characterKey))
    return {
      mode: 'team',
      characterKey: selection.characterKey,
      teamId: selection.teamId,
    }
  throw new Error(
    `Team ${selection.teamId ?? '(missing)'} does not contain ${selection.characterKey}`
  )
}

export class BulkBuildQueue {
  private controller?: AbortController

  get running() {
    return !!this.controller
  }

  cancel() {
    this.controller?.abort()
  }

  async run(
    selections: readonly BulkBuildQueueItem[],
    runner: BulkBuildQueueRunner,
    options: BulkBuildQueueOptions = {}
  ) {
    if (this.controller) throw new Error('A bulk build queue is already running')
    const controller = new AbortController()
    this.controller = controller
    const updates: BulkBuildQueueUpdate[] = []
    try {
      for (const [index, item] of selections.entries()) {
        if (controller.signal.aborted) {
          options.onUpdate?.({ index, item, status: 'cancelled' })
          break
        }
        options.onUpdate?.({ index, item, status: 'running' })
        try {
          await options.beforeRun?.(item)
          await runner(item, controller.signal)
          const update = { index, item, status: 'success' as const }
          updates.push(update)
          options.onUpdate?.(update)
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause))
          const update = { index, item, status: 'error' as const, error }
          updates.push(update)
          options.onUpdate?.(update)
          if (options.stopOnError ?? true) break
        }
      }
      return updates
    } finally {
      this.controller = undefined
    }
  }
}

export function createSolverIntegrationError(): Error {
  return new Error(
    'Bulk build solver integration is not available yet. Run this character from the optimizer page.'
  )
}
