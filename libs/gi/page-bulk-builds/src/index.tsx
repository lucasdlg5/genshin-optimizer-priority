import { useDataEntryBase, useDataManagerEntries, useDataManagerKeys } from '@genshin-optimizer/common/database-ui'
import { CardThemed } from '@genshin-optimizer/common/ui'
import type { BulkBuildQueueUpdate } from './bulkBuildQueue'
import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'
import { useDatabase, useDBMeta } from '@genshin-optimizer/gi/db-ui'
import { CharacterName } from '@genshin-optimizer/gi/ui'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { Box, Button, Checkbox, FormControlLabel, Grid, IconButton, Typography } from '@mui/material'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BulkBuildCharacterCard } from './BulkBuildCharacterCard'
import { BulkBuildProgress } from './BulkBuildProgress'
import { BulkBuildQueue, createSolverIntegrationError, validateBulkBuildSelections } from './bulkBuildQueue'
export * from './bulkBuildQueue'

export default function PageBulkBuilds() {
  const database = useDatabase()
  const { gender } = useDBMeta()
  const { t } = useTranslation('page_bulk_builds')
  const state = useDataEntryBase(database.displayBulkBuilds)
  const priority = useDataEntryBase(database.characterPriority)
  const characterKeys = useDataManagerKeys(database.chars)
  const teamEntries = useDataManagerEntries(database.teams)
  const teams = useMemo(
    () => teamEntries.map(([id, team]) => ({ id, name: team.name })),
    [teamEntries]
  )
  const selections = state.selections
  const selectedKeys = new Set(selections.map((selection) => selection.characterKey))
  const queue = useRef(new BulkBuildQueue()).current
  const [updates, setUpdates] = useState<BulkBuildQueueUpdate[]>([])
  const [running, setRunning] = useState(false)

  const updateSelection = (selection: BulkBuildSelection | undefined, characterKey: string) => {
    if (!selection)
      database.displayBulkBuilds.set({
        selections: selections.filter((item) => item.characterKey !== characterKey),
      })
    else {
      const next = selections.some((item) => item.characterKey === selection.characterKey)
        ? selections.map((item) => item.characterKey === selection.characterKey ? selection : item)
        : [...selections, selection]
      database.displayBulkBuilds.set({ selections: next })
    }
  }
  const toggleAll = (checked: boolean) =>
    database.displayBulkBuilds.set({
      selections: checked
        ? characterKeys.map((characterKey) => ({ characterKey, mode: 'solo' as const }))
        : [],
    })
  const run = async () => {
    const errors = validateBulkBuildSelections(selections, characterKeys, teams.map((team) => team.id))
    if (errors.length) {
      setUpdates(selections.map((item, index) => ({ index, item, status: 'error' as const, error: new Error(errors[index] ?? errors[0]) })))
      return
    }
    setRunning(true)
    setUpdates([])
    await queue.run(selections, async (_item, signal) => {
      if (signal.aborted) return
      throw createSolverIntegrationError()
    }, {
      stopOnError: state.stopOnError,
      onUpdate: (update) => setUpdates((current) => [...current.filter((item) => item.index !== update.index), update]),
    })
    setRunning(false)
  }
  const movePriority = (index: number, direction: -1 | 1) => {
    const next = [...priority.orderedCharacterKeys]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    database.characterPriority.set({ orderedCharacterKeys: next })
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      <Typography variant="h4">{t('title')}</Typography>
      <Typography color="text.secondary">{t('description')}</Typography>
      <CardThemed>
        <Box p={1} display="flex" gap={1} alignItems="center" flexWrap="wrap">
          <FormControlLabel
            control={<Checkbox checked={selectedKeys.size === characterKeys.length && characterKeys.length > 0} onChange={(_, checked) => toggleAll(checked)} />}
            label={t('selectAll')}
          />
          <FormControlLabel
            control={<Checkbox checked={priority.enabled} onChange={(_, checked) => {
              database.characterPriority.set({ enabled: checked })
              database.displayBulkBuilds.set({ priorityEnabled: checked })
            }} />}
            label={t('priority')}
          />
          <FormControlLabel
            control={<Checkbox checked={state.stopOnError} onChange={(_, checked) => database.displayBulkBuilds.set({ stopOnError: checked })} />}
            label={t('stopOnError')}
          />
          <Button variant="contained" disabled={!selections.length || running} onClick={run}>{t('run')}</Button>
          <Button disabled={!running} onClick={() => queue.cancel()}>{t('cancel')}</Button>
        </Box>
      </CardThemed>
      <CardThemed>
        <Box p={1}>
          <Typography variant="subtitle1">{t('priorityOrder')}</Typography>
          {priority.orderedCharacterKeys.map((characterKey, index) => (
            <Box key={characterKey} display="flex" alignItems="center" gap={1}>
              <Typography sx={{ width: 24 }}>{index + 1}</Typography>
              <Box flexGrow={1}><CharacterName characterKey={characterKey} gender={gender} /></Box>
              <IconButton
                size="small"
                disabled={index === 0}
                aria-label={t('moveUp')}
                onClick={() => movePriority(index, -1)}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                disabled={index === priority.orderedCharacterKeys.length - 1}
                aria-label={t('moveDown')}
                onClick={() => movePriority(index, 1)}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      </CardThemed>
      <Grid container spacing={1}>
        {characterKeys.map((characterKey) => {
          const selection = selections.find((item) => item.characterKey === characterKey) ?? { characterKey, mode: 'solo' as const }
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={characterKey}>
              <BulkBuildCharacterCard
                selection={selection}
                selected={selectedKeys.has(characterKey)}
                teamOptions={teams}
                onChange={updateSelection}
              />
            </Grid>
          )
        })}
      </Grid>
      {!!selections.length && (
        <CardThemed>
          <Box p={1}>
            <BulkBuildProgress updates={updates} total={selections.length} />
            {!updates.length && <Typography>{t('notStarted')}</Typography>}
          </Box>
        </CardThemed>
      )}
      <Typography variant="caption" color="text.secondary">
        {t('integrationNote')}
      </Typography>
    </Box>
  )
}
