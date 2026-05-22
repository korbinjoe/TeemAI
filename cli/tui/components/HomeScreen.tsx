/**
 * HomeScreen — OpenCode
 *
 *   [top spacer —  justifyContent ]
 *   Logo
 *   Agent · Model · Provider
 *   shortcuts
 *   Tips
 *   workspace(cwd)      version
 *   ╭──────────────────────╮
 *   │ [📎 img.png ...]     │  ←
 *   │ TextArea    │  ← IME
 *   ╰──────────────────────╯
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Box, Text, Spacer, useInput, useApp, useStdout } from 'ink'
import { basename } from 'path'
import TextArea from './TextArea.js'
import Spinner from 'ink-spinner'
import DialogSelect, { type DialogSelectOption } from './DialogSelect.js'
import Tips from './Tips.js'
import { AGENT_EMOJI } from '../constants.js'
import { type ApiClient } from '../hooks/useApi.js'

interface Agent {
  id: string
  name: string
  icon?: string
  description?: string
  role?: string
  subAgentNames?: string[]
}

interface HomeScreenProps {
  port: number
  api: ApiClient
  workspace: {
    id: string
    name: string
    repositories: { path: string }[]
  }
  chatId: string
  defaultModel?: string
  defaultAgent?: string
  version?: string
  onSubmit: (params: {
    agentId: string
    model: string
    prompt: string
  }) => void
}

const LOGO = `
 ██████╗ ██████╗ ████████╗███████╗ █████╗ ███╗   ███╗
██╔════╝██╔═══██╗╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
██║     ██║   ██║   ██║   █████╗  ███████║██╔████╔██║
██║     ██║   ██║   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║
╚██████╗╚██████╔╝   ██║   ███████╗██║  ██║██║ ╚═╝ ██║
 ╚═════╝ ╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝`

const PLACEHOLDERS = [
  'Review recent PRs',
  'Fix this bug',
  'Analyze code architecture',
  'Write a new feature',
  'Optimize performance bottlenecks',
]

const MODELS = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', context: '200K', price: '$15/$75' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', context: '200K', price: '$3/$15' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic', context: '200K', price: '$0.8/$4' },
]

const CARD_WIDTH = 60
/** Logo(7) + margin+info(3) + margin+shortcuts(2) + tips(1) + margin+footer(2) + margin+input(4) = 19 */
const CONTENT_HEIGHT = 19

/** OSC 8  —  iTerm2 / Warp / kitty  cmd+click  */
const hyperlink = (url: string, text: string) =>
  `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`

type OverlayMode = 'none' | 'model' | 'agent'

const HomeScreen = ({ port, api, workspace, chatId, defaultModel, defaultAgent, version, onSubmit }: HomeScreenProps) => {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(defaultModel || 'claude-opus-4-6')
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentIndex, setAgentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [overlay, setOverlay] = useState<OverlayMode>('none')
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const { exit } = useApp()
  const { stdout } = useStdout()

  const placeholder = useMemo(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    []
  )

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get('/api/agents')
        const list = Array.isArray(data) ? data : []
        setAgents(list)
        if (defaultAgent) {
          const idx = list.findIndex((a: Agent) => a.id === defaultAgent || a.name === defaultAgent)
          if (idx >= 0) setAgentIndex(idx)
        }
      } catch {
        setAgents([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const currentAgent = agents[agentIndex]
  const agentEmoji = currentAgent ? (AGENT_EMOJI[currentAgent.id] ?? currentAgent.icon ?? '●') : '●'
  const currentModel = MODELS.find((m) => m.id === model) ?? { id: model, name: model, provider: '', context: '', price: '' }

  const handleImagePaste = useCallback((imagePath: string) => {
    setAttachedImages((prev) => [...prev, imagePath])
  }, [])

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed && attachedImages.length === 0) return
    let finalPrompt = trimmed
    if (attachedImages.length > 0) {
      const imageRefs = attachedImages.map((p) => `[image: ${p}]`).join('\n')
      finalPrompt = trimmed ? `${trimmed}\n\n${imageRefs}` : imageRefs
    }
    onSubmit({
      agentId: currentAgent?.id ?? 'default',
      model,
      prompt: finalPrompt,
    })
  }, [attachedImages, currentAgent, model, onSubmit])

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
    }
  })

  useInput((input, key) => {
    if (key.tab && agents.length > 1) {
      setAgentIndex((i) => (i + 1) % agents.length)
      return
    }

    if (key.ctrl && input === 'e') {
      setOverlay('model')
      return
    }

    if (!key.ctrl && !key.meta && input === '~' && prompt === '') {
      if (agents.length > 1) setOverlay('agent')
      return
    }

    if (key.ctrl && input === 'x' && attachedImages.length > 0) {
      setAttachedImages((prev) => prev.slice(0, -1))
      return
    }

  }, { isActive: overlay === 'none' })

  const modelOptions: DialogSelectOption[] = useMemo(() =>
    MODELS.map((m) => ({
      label: m.name,
      value: m.id,
      category: m.provider,
      footer: `${m.context}  ${m.price}`,
    }))
  , [])

  const agentOptions: DialogSelectOption[] = useMemo(() => {
    const leads = agents.filter((a) => a.role === 'lead' || (a.subAgentNames && a.subAgentNames.length > 0))
    const experts = agents.filter((a) => a.role !== 'lead' && (!a.subAgentNames || a.subAgentNames.length === 0))

    return [
      ...leads.map((a) => ({
        label: a.name,
        value: a.id,
        icon: AGENT_EMOJI[a.id] ?? a.icon ?? '●',
        description: a.description?.slice(0, 30),
        category: 'Lead',
      })),
      ...experts.map((a) => ({
        label: a.name,
        value: a.id,
        icon: AGENT_EMOJI[a.id] ?? a.icon ?? '●',
        description: a.description?.slice(0, 30),
        category: 'Expert',
      })),
    ]
  }, [agents])

  const cwd = process.cwd()
  const termRows = stdout.rows || 24
  const topPad = Math.min(10, Math.max(1, Math.floor((termRows - CONTENT_HEIGHT) / 3)))

  //
  //
  return (
    <Box flexDirection="column" alignItems="center" paddingTop={overlay !== 'none' ? 0 : topPad}>

      {overlay !== 'none' ? (
        <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={termRows}>
          {overlay === 'model' ? (
            <DialogSelect
              title="Models"
              options={modelOptions}
              initialIndex={MODELS.findIndex((m) => m.id === model)}
              onSelect={(value) => {
                setModel(value)
                setOverlay('none')
              }}
              onCancel={() => setOverlay('none')}
            />
          ) : (
            <DialogSelect
              title="Agents"
              options={agentOptions}
              initialIndex={agentIndex}
              onSelect={(value) => {
                const idx = agents.findIndex((a) => a.id === value)
                if (idx >= 0) setAgentIndex(idx)
                setOverlay('none')
              }}
              onCancel={() => setOverlay('none')}
            />
          )}
        </Box>
      ) : (
        <>
          <Text color="cyan">{LOGO}</Text>

          {loading ? (
            <Box marginTop={1}>
              <Text color="cyan"><Spinner type="dots" /></Text>
              <Text color="dim"> Loading...</Text>
            </Box>
          ) : (
            <>
              {/* Agent + Model Info */}
              <Box marginTop={2} width={CARD_WIDTH}>
                <Text color="cyan">{agentEmoji} {currentAgent?.name ?? 'default'}</Text>
                <Text color="dim">  ·  </Text>
                <Text color="dim">{currentModel.name}</Text>
              </Box>

              <Box width={CARD_WIDTH} marginTop={1}>
                <Text>
                  <Text bold>tab</Text><Text color="dim"> SwitchAgent  </Text>
                  <Text bold>^E</Text><Text color="dim"> SwitchModel  </Text>
                  <Text bold>~</Text><Text color="dim"> AgentList</Text>
                </Text>
              </Box>

              {/* Tip */}
              <Box width={CARD_WIDTH}>
                <Tips />
              </Box>

              <Box width={CARD_WIDTH} marginTop={1}>
                <Text color="cyan">{workspace.name}</Text><Text color="dim"> {basename(cwd)}</Text>
                <Spacer />
                <Text color="cyan">{hyperlink(`http://localhost:${port}`, `localhost:${port}`)}</Text>
                <Spacer />
                <Text color="dim">v{version}</Text>
              </Box>

              <Box
                marginTop={1}
                width={CARD_WIDTH}
                borderStyle="round"
                borderColor={attachedImages.length > 0 ? 'cyan' : 'gray'}
                paddingX={1}
                flexDirection="column"
              >
                {attachedImages.length > 0 && (
                  <Box gap={1} flexWrap="wrap">
                    {attachedImages.map((p, i) => (
                      <Text key={i} color="cyan">📎 {basename(p)}</Text>
                    ))}
                    <Text color="dim">ctrl+x remove</Text>
                  </Box>
                )}
                <TextArea
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={handleSubmit}
                  onImagePaste={handleImagePaste}
                  placeholder={`Ask anything — ${placeholder}`}
                />
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  )
}

export default HomeScreen
