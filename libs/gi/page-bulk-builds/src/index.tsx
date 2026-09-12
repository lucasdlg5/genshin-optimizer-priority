import { useDataEntryBase, useDataManagerEntries, useDataManagerKeys } from '@genshin-optimizer/common/database-ui'
import { CardThemed, NumberInputLazy } from '@genshin-optimizer/common/ui'
import type { BulkBuildQueueUpdate } from './bulkBuildQueue'
import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'
import { useDatabase, useDBMeta } from '@genshin-optimizer/gi/db-ui'
import { CharacterName } from '@genshin-optimizer/gi/ui'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, TextField, Typography } from '@mui/material'
import { useMemo, useRef, useState, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { BulkBuildCharacterCard } from './BulkBuildCharacterCard'
import { BulkBuildProgress } from './BulkBuildProgress'
import {
  BulkBuildQueue,
  orderBulkBuildSelections,
  validateBulkBuildSelections,
} from './bulkBuildQueue'
export * from './bulkBuildQueue'

export default function PageBulkBuilds() {
  const database = useDatabase()
  const { gender } = useDBMeta()
  const { t } = useTranslation(['page_bulk_builds', 'charNames_gen'])
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
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const displayCharacterKeys = useMemo(() => {
    const search = deferredSearchTerm.trim().toLowerCase()
    const matches = (characterKey: string) =>
      !search ||
      t(characterKey, { ns: 'charNames_gen' }).toLowerCase().includes(search)
    const priorityKeys = priority.orderedCharacterKeys.filter(
      (characterKey) => matches(characterKey) && selectedKeys.has(characterKey)
    )
    const otherKeys = characterKeys
      .filter((characterKey) => matches(characterKey) && !selectedKeys.has(characterKey))
      .sort((left, right) => left.localeCompare(right))
    return [...priorityKeys, ...otherKeys]
  }, [characterKeys, deferredSearchTerm, priority.orderedCharacterKeys, selections, t])
  const queue = useRef(new BulkBuildQueue()).current
  const [updates, setUpdates] = useState<BulkBuildQueueUpdate[]>([])
  const [running, setRunning] = useState(false)
  const [draggedPriority, setDraggedPriority] = useState<string>()
  const [showPreflight, setShowPreflight] = useState(false)

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
    setShowPreflight(true)
  }
  const confirmRun = async () => {
    setShowPreflight(false)
    setRunning(true)
    setUpdates([])
    const orderedSelections = orderBulkBuildSelections(
      selections,
      priority.orderedCharacterKeys
    )
    await queue.run(orderedSelections, async (_item, signal) => {
      if (signal.aborted) return
      throw new Error(
        'Bulk build solver integration is not available yet. Run this character from the optimizer page.'
      )
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
  const applyPriorityPosition = (characterKey: string, position: number) => {
    const currentIndex = priority.orderedCharacterKeys.indexOf(characterKey)
    if (currentIndex < 0) return
    const targetIndex = Math.max(
      0,
      Math.min(priority.orderedCharacterKeys.length - 1, position - 1)
    )
    if (targetIndex === currentIndex) return
    const next = [...priority.orderedCharacterKeys]
    next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, characterKey)
    database.characterPriority.set({ orderedCharacterKeys: next })
  }
  const dropPriority = (targetCharacterKey: string) => {
    if (!draggedPriority || draggedPriority === targetCharacterKey) return
    const from = priority.orderedCharacterKeys.indexOf(draggedPriority)
    const to = priority.orderedCharacterKeys.indexOf(targetCharacterKey)
    if (from < 0 || to < 0) return
    const next = [...priority.orderedCharacterKeys]
    next.splice(from, 1)
    next.splice(to, 0, draggedPriority)
    database.characterPriority.set({ orderedCharacterKeys: next })
    setDraggedPriority(undefined)
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
            <Box
              key={characterKey}
              display="flex"
              alignItems="center"
              gap={1}
              draggable
              onDragStart={() => setDraggedPriority(characterKey)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropPriority(characterKey)}
              sx={{ cursor: 'grab' }}
            >
              <Typography sx={{ width: 24 }}>{index + 1}</Typography>
              <Box flexGrow={1}><CharacterName characterKey={characterKey} gender={gender} /></Box>
              <NumberInputLazy
                value={index + 1}
                inputProps={{ min: 1, max: priority.orderedCharacterKeys.length }}
                size="small"
                sx={{ width: 70 }}
                aria-label={t('priorityPosition')}
                onChange={(position) =>
                  applyPriorityPosition(characterKey, position)
                }
              />
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
      {(running || updates.length > 0) && (
        <CardThemed>
          <Box p={1}>
            <BulkBuildProgress updates={updates} total={selections.length} />
            {!updates.length && <Typography>{t('notStarted')}</Typography>}
          </Box>
        </CardThemed>
      )}
      <TextField
        label={t('search')}
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        size="small"
        fullWidth
      />
      <Grid container spacing={1}>
        {displayCharacterKeys.map((characterKey) => {
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
      <Dialog open={showPreflight} onClose={() => setShowPreflight(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('preflightTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('preflightDescription')}</Typography>
          <Typography color="warning.main" sx={{ mt: 1 }}>
            {t('preflightTargetWarning')}
          </Typography>
          <Typography sx={{ mt: 1 }}>{t('preflightArtifactDescription')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPreflight(false)}>{t('cancel')}</Button>
          <Button variant="outlined" onClick={() => { window.location.hash = '#/teams' }}>
            {t('openTargetSetup')}
          </Button>
          <Button variant="outlined" onClick={() => { window.location.hash = '#/teams' }}>
            {t('openArtifactSetup')}
          </Button>
          <Button variant="contained" onClick={confirmRun}>
            {t('run')}
          </Button>
        </DialogActions>
      </Dialog>
      <Typography variant="caption" color="text.secondary">
        {t('integrationNote')}
      </Typography>
    </Box>
  )
}
