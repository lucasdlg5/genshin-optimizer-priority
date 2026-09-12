import type { BulkBuildSelection } from '@genshin-optimizer/gi/db'
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'

export function TeamModeSelector({
  value,
  teamOptions,
  onChange,
}: {
  value: BulkBuildSelection
  teamOptions: readonly { id: string; name: string }[]
  onChange: (selection: BulkBuildSelection) => void
}) {
  const mode = value.mode === 'team' && value.teamId ? `team:${value.teamId}` : 'solo'
  return (
    <FormControl size="small">
      <InputLabel>Build context</InputLabel>
      <Select
        value={mode}
        label="Build context"
        onChange={(event) => {
          const selected = event.target.value
          if (selected === 'solo') onChange({ characterKey: value.characterKey, mode: 'solo' })
          else onChange({ characterKey: value.characterKey, mode: 'team', teamId: selected.slice(5) })
        }}
      >
        <MenuItem value="solo">Solo</MenuItem>
        {teamOptions.map((team) => (
          <MenuItem key={team.id} value={`team:${team.id}`}>
            {team.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
