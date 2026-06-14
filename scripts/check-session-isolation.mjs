#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function read(relPath) {
  return readFileSync(resolve(root, relPath), 'utf8')
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message)
  }
}

function checkServerLifecycle() {
  const src = read('server/ws/MissionAgentLifecycle.ts')
  const checks = [
    [/type:\s*'agent:started'[\s\S]{0,260}?chatId/s, 'MissionAgentLifecycle: agent:started payload must include chatId'],
    [/type:\s*'agent:error'[\s\S]{0,260}?chatId/s, 'MissionAgentLifecycle: agent:error payload must include chatId'],
  ]
  for (const [pattern, message] of checks) assertContains(src, pattern, message)
}

function checkServerResume() {
  const src = read('server/ws/MissionAgentResumeHandler.ts')
  const checks = [
    [/type:\s*'agent:started'[\s\S]{0,260}?chatId/s, 'MissionAgentResumeHandler: agent:started payload must include chatId'],
    [/type:\s*'agent:activity'[\s\S]{0,260}?chatId/s, 'MissionAgentResumeHandler: agent:activity payload must include chatId'],
    [/type:\s*'agent:resume-failed'[\s\S]{0,260}?chatId/s, 'MissionAgentResumeHandler: agent:resume-failed payload must include chatId'],
  ]
  for (const [pattern, message] of checks) assertContains(src, pattern, message)
}

function checkClientGuards() {
  const chatWs = read('web/hooks/useChatWebSocket.ts')
  assertContains(chatWs, /const isCurrentChatEvent = /, 'useChatWebSocket: isCurrentChatEvent guard is required')
  assertContains(chatWs, /if\s*\(!isCurrentChatEvent\(payload\)\)\s*return/g, 'useChatWebSocket: expert handlers must guard by current chatId')

  const terminalWs = read('web/components/terminal/useTerminalWsEvents.ts')
  assertContains(terminalWs, /const isCurrentChatEvent = \(payload\?: \{ chatId\?: string \}\) =>/, 'useTerminalWsEvents: isCurrentChatEvent guard is required')
  assertContains(terminalWs, /if\s*\(!isCurrentChatEvent\(payload\)\)\s*return/g, 'useTerminalWsEvents: expert handlers must guard by current chatId')
}

function main() {
  checkServerLifecycle()
  checkServerResume()
  checkClientGuards()
  console.log('session-isolation checks passed')
}

main()
