import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'
import { CharacterCard, CharacterName } from '@genshin-optimizer/gi/ui'
import { useDBMeta } from '@genshin-optimizer/gi/db-ui'
import { Card, CardContent, Checkbox, FormControlLabel, Typography } from '@mui/material'
import { TeamModeSelector } from './TeamModeSelector'

export function BulkBuildCharacterCard({
  selection,
  selected,
  teamOptions,
  onChange,
}: {
  selection: BulkBuildSelection
  selected: boolean
  teamOptions: readonly { id: string; name: string }[]
  onChange: (selection: BulkBuildSelection | undefined, characterKey: string) => void
}) {
  const { gender } = useDBMeta()
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={selected}
              onChange={(_, checked) => onChange(checked ? selection : undefined, selection.characterKey)}
              inputProps={{ 'aria-label': `Select ${selection.characterKey}` }}
            />
          }
          label={<CharacterName characterKey={selection.characterKey} gender={gender} />}
        />
        <CharacterCard characterKey={selection.characterKey} hideStats />
        <TeamModeSelector
          value={selection}
          teamOptions={teamOptions}
          onChange={(next) => onChange(next, selection.characterKey)}
        />
        <Typography variant="caption" color="text.secondary">
          {selection.mode === 'team' ? 'Saved team' : 'Solo'}
        </Typography>
      </CardContent>
    </Card>
  )
}
