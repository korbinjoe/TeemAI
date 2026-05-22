/**
 * TUI App
 *
 * Phase 1: OpenCode HomeScreen
 */

import React from 'react'
import { Box } from 'ink'
import HomeScreen from './components/HomeScreen.js'
import { createApiClient } from './hooks/useApi.js'

export interface ChatReadyParams {
  workspaceId: string
  workspaceName: string
  chatId: string
  repoPaths: string[]
  agentName?: string
  initialPrompt?: string
  model?: string
}

interface AppProps {
  port: number
  workspace: {
    id: string
    name: string
    repositories: { path: string }[]
  }
  chatId: string
  defaultModel?: string
  defaultAgent?: string
  version?: string
  onChatReady: (params: ChatReadyParams) => void
}

const App = ({ port, workspace, chatId, defaultModel, defaultAgent, version, onChatReady }: AppProps) => {
  const api = createApiClient(`http://localhost:${port}`)

  return (
    <Box flexDirection="column">
      <HomeScreen
        port={port}
        api={api}
        workspace={workspace}
        chatId={chatId}
        defaultModel={defaultModel}
        defaultAgent={defaultAgent}
        version={version}
        onSubmit={({ agentId, model, prompt }) => {
          onChatReady({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            chatId,
            repoPaths: workspace.repositories.map((r) => r.path),
            agentName: agentId,
            initialPrompt: prompt,
            model,
          })
        }}
      />
    </Box>
  )
}

export default App
