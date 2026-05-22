
import React, { useMemo } from 'react'
import { Text, Box } from 'ink'

const TIPS = [
  'Type {~} at start to switch agent',
  '{Ctrl+C} Quit current agent',
  '{Ctrl+E} Switch model',
  '{openteam -r} Quickly restore last session',
  '{Alt+Enter} Multi-line input',
  'Multi-agent parallel: Lead orchestrates multiple Experts working simultaneously',
  'Team config managed in {openteam.json}',
]

const Tips = () => {
  const tip = useMemo(
    () => TIPS[Math.floor(Math.random() * TIPS.length)],
    []
  )

  const parts = tip.split(/\{([^}]+)\}/g)

  return (
    <Box>
      <Text color="dim">› </Text>
      {parts.map((part, i) =>
        i % 2 === 0
          ? <Text key={i} color="dim">{part}</Text>
          : <Text key={i} bold>{part}</Text>
      )}
    </Box>
  )
}

export default Tips
