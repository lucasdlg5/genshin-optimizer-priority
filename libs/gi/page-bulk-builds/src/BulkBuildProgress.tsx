import type { BulkBuildQueueUpdate } from './bulkBuildQueue'
import { LinearProgress, List, ListItem, ListItemText, Typography } from '@mui/material'

export function BulkBuildProgress({ updates, total }: { updates: readonly BulkBuildQueueUpdate[]; total: number }) {
  const finished = updates.filter((update) => update.status === 'success' || update.status === 'error').length
  const current = updates.find((update) => update.status === 'running')
  return (
    <>
      <Typography variant="subtitle1">
        Progress: {finished}/{total}
      </Typography>
      <LinearProgress variant="determinate" value={total ? (finished / total) * 100 : 0} />
      <List dense>
        {updates.map((update) => (
          <ListItem key={`${update.index}-${update.item.characterKey}`}>
            <ListItemText
              primary={update.item.characterKey}
              secondary={
                update.status === 'error'
                  ? update.error?.message
                  : update.status
              }
            />
          </ListItem>
        ))}
        {current && (
          <ListItem>
            <ListItemText primary={`Running ${current.item.characterKey}`} />
          </ListItem>
        )}
      </List>
    </>
  )
}
