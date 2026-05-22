/**
 * AgentSwitchMenu - PTY  Agent
 *  ~  AgentESC
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'
import { AGENT_EMOJI } from '../constants.js'

interface Agent {
  id: string
  name: string
  icon?: string
  description?: string
  subAgentNames?: string[]
}

interface AgentSwitchMenuProps {
  port: number
  currentAgentId: string
  onSelect: (agentId: string) => void
  onCancel: () => void
}

interface SelectItem {
  label: string
  value: string
}

interface ItemProps {
  isSelected: boolean
  label: string
}

const AgentItem = ({ isSelected, label }: ItemProps) => {
  const [avatar = '', name = '', suffix = ''] = label.split('\x00')
  return (
    <Box>
      <Text color="cyan">{isSelected ? '› ' : '  '}</Text>
      <Text bold={isSelected} color={isSelected ? 'white' : undefined}>{avatar} {name}</Text>
      {suffix ? <Text color="dim">  {suffix}</Text> : null}
    </Box>
  )
}

const AgentSwitchMenu = ({ port, currentAgentId, onSelect, onCancel }: AgentSwitchMenuProps) => {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useInput((_input, key) => {
    if (key.escape) {
      onCancel()
    }
  })

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`http://localhost:${port}/api/agents`)
        const data = await res.json()
        setAgents(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!loading && agents.length <= 1) {
      const timer = setTimeout(() => onCancel(), 1500)
      return () => clearTimeout(timer)
    }
  }, [loading, agents.length])

  const handleSelect = (item: SelectItem) => {
    onSelect(item.value)
  }

  if (loading) {
    return (
      <Box>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Text> Loading agents...</Text>
      </Box>
    )
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>
  }

  if (agents.length <= 1) {
    return <Text color="yellow">No other agents available.</Text>
  }

  const leads = agents.filter((a) => a.subAgentNames && a.subAgentNames.length > 0)
  const experts = agents.filter((a) => !a.subAgentNames || a.subAgentNames.length === 0)
  const ordered = [...leads, ...experts]

  const MAX_DESC = 36
  const items: SelectItem[] = ordered.map((agent) => {
    const avatar = AGENT_EMOJI[agent.id] ?? agent.icon ?? '●'
    const isCurrent = (agent.id ?? agent.name) === currentAgentId
    const suffix = isCurrent ? '(current)' : (agent.description ?? '').slice(0, MAX_DESC)
    return {
      label: `${avatar}\x00${agent.name}\x00${suffix}`,
      value: agent.id ?? agent.name,
    }
  })

  const currentIdx = items.findIndex((i) => i.value === currentAgentId)
  const initialIndex = currentIdx >= 0 ? (currentIdx + 1) % items.length : 0

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Switch Agent</Text>
        <Text color="dim">  (ESC to cancel)</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} itemComponent={AgentItem} initialIndex={initialIndex} />
    </Box>
  )
}

export default AgentSwitchMenu
