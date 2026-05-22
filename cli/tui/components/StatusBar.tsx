
import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  connected: boolean
  activity?: {
    state: string
    toolName?: string
  }
  workspaceName?: string
}

const StatusBar = ({ connected, activity, workspaceName }: StatusBarProps) => {
  const connIcon = connected ? '●' : '○'
  const connColor = connected ? 'green' : 'red'
  const connText = connected ? 'Connected' : 'Disconnected'

  let activityText = 'Idle'
  let activityColor: string = 'dim'
  if (activity) {
    switch (activity.state) {
      case 'thinking':
        activityText = 'Thinking...'
        activityColor = 'yellow'
        break
      case 'tool_use':
        activityText = activity.toolName ? `Using: ${activity.toolName}` : 'Tool use'
        activityColor = 'magenta'
        break
      case 'responding':
        activityText = 'Responding...'
        activityColor = 'cyan'
        break
      default:
        activityText = 'Idle'
    }
  }

  return (
    <Box borderStyle="single" borderColor="dim" paddingX={1}>
      <Text color={connColor}>{connIcon} {connText}</Text>
      {workspaceName && <Text color="dim"> | {workspaceName}</Text>}
      <Text> </Text>
      <Box flexGrow={1} />
      <Text color={activityColor}>{activityText}</Text>
      <Text color="dim">  Ctrl+C×2 exit</Text>
    </Box>
  )
}

export default StatusBar
