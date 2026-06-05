export interface CommandDef {
  name: string
  description: string
  tool: string
  toolLabel: string
  args?: string
  category?: string
}

const CLAUDE_COMMANDS: CommandDef[] = [
  { name: 'add-dir', description: 'Add working directory for this session', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'agents', description: 'Manage agent configurations', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'btw', description: 'Quick side question without adding to conversation', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'branch', description: 'Create a branch of the current conversation', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'chrome', description: 'Configure Claude in Chrome settings', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'clear', description: 'Clear conversation history and free context', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'color', description: 'Set prompt bar color for current session', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'compact', description: 'Compress conversation with optional focus instructions', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'config', description: 'Open settings for theme, model, output style', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'context', description: 'Visualize context usage as colored grid', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'copy', description: 'Copy last assistant response to clipboard', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'cost', description: 'Show token usage statistics', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'desktop', description: 'Continue session in Claude Code Desktop app', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'diff', description: 'Open interactive diff viewer for uncommitted changes', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'doctor', description: 'Diagnose and verify installation and setup', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'effort', description: 'Set model effort level (low/medium/high/max/auto)', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'exit', description: 'Exit CLI', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'export', description: 'Export conversation as plain text', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'extra-usage', description: 'Configure extra usage for rate limits', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'fast', description: 'Toggle fast mode on or off', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'feedback', description: 'Submit feedback about Claude Code', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'help', description: 'Show help and available commands', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'hooks', description: 'View hook configuration for tool events', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'ide', description: 'Manage IDE integrations and show status', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'init', description: 'Initialize project with CLAUDE.md', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'insights', description: 'Analyze sessions: domains, patterns, friction', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'install-github-app', description: 'Set up Claude GitHub Actions app', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'install-slack-app', description: 'Install Claude Slack app', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'keybindings', description: 'Open or create keybindings config file', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'login', description: 'Log in to your Anthropic account', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'logout', description: 'Log out from your Anthropic account', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'mcp', description: 'Manage MCP server connections and OAuth', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'memory', description: 'Edit CLAUDE.md memory files', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'mobile', description: 'Show QR code to download Claude mobile app', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'model', description: 'Select or change AI model', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'passes', description: 'Share a week of free Claude Code', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'permissions', description: 'Manage tool permission rules', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'plan', description: 'Enter Plan Mode with optional description', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'plugin', description: 'Manage Claude Code plugins', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'powerup', description: 'Discover Claude Code features interactively', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'pr-comments', description: 'Get and display GitHub PR comments', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'privacy-settings', description: 'View and update privacy settings', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'release-notes', description: 'View full changelog', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'reload-plugins', description: 'Reload all active plugins', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'remote-control', description: 'Make session remotely controllable from claude.ai', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'remote-env', description: 'Configure default remote environment', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'rename', description: 'Rename current session', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'resume', description: 'Resume a conversation by ID or name', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'review', description: 'Code review', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'rewind', description: 'Rewind conversation and/or code to prior point', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'sandbox', description: 'Toggle sandbox mode', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'schedule', description: 'Create, update, list or run scheduled tasks', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'security-review', description: 'Analyze pending changes for security vulnerabilities', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'skills', description: 'List available skills', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'stats', description: 'Visualize daily usage, session history, streaks', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'status', description: 'Show version, model, account and connectivity', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'statusline', description: 'Configure Claude Code status line', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'stickers', description: 'Order Claude Code stickers', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'tasks', description: 'List and manage background tasks', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'terminal-setup', description: 'Configure terminal shortcuts for Shift+Enter', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'theme', description: 'Change color theme', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'upgrade', description: 'Open upgrade page for higher plan tier', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'usage', description: 'Show plan usage limits and rate limit status', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'vim', description: 'Toggle between Vim and normal editing mode', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'voice', description: 'Toggle push-to-talk voice dictation', tool: 'claude', toolLabel: 'Claude Code' },
]

const CURSOR_COMMANDS: CommandDef[] = [
  { name: 'edit', description: 'Edit selected code inline', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'explain', description: 'Explain selected code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'fix', description: 'Fix issues in selected code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'generate', description: 'Generate code from description', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'test', description: 'Generate tests for code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'docs', description: 'Generate documentation', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'review', description: 'Review code for issues', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'refactor', description: 'Refactor selected code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'optimize', description: 'Optimize code performance', tool: 'cursor', toolLabel: 'Cursor' },
]

const AIDER_COMMANDS: CommandDef[] = [
  { name: 'add', description: 'Add file to chat context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'drop', description: 'Remove file from context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'run', description: 'Run shell command', tool: 'aider', toolLabel: 'Aider' },
  { name: 'commit', description: 'Commit changes with message', tool: 'aider', toolLabel: 'Aider' },
  { name: 'diff', description: 'Show pending changes diff', tool: 'aider', toolLabel: 'Aider' },
  { name: 'undo', description: 'Undo last change', tool: 'aider', toolLabel: 'Aider' },
  { name: 'ls', description: 'List files in context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'map', description: 'Show repository map', tool: 'aider', toolLabel: 'Aider' },
  { name: 'tokens', description: 'Show token usage report', tool: 'aider', toolLabel: 'Aider' },
  { name: 'model', description: 'Switch model', tool: 'aider', toolLabel: 'Aider' },
  { name: 'architect', description: 'Switch to architect mode', tool: 'aider', toolLabel: 'Aider' },
  { name: 'ask', description: 'Ask without editing files', tool: 'aider', toolLabel: 'Aider' },
  { name: 'code', description: 'Switch to code editing mode', tool: 'aider', toolLabel: 'Aider' },
  { name: 'lint', description: 'Lint and fix files', tool: 'aider', toolLabel: 'Aider' },
  { name: 'test', description: 'Run tests and fix failures', tool: 'aider', toolLabel: 'Aider' },
  { name: 'web', description: 'Scrape webpage and add to context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'settings', description: 'Show current settings', tool: 'aider', toolLabel: 'Aider' },
]

const WINDSURF_COMMANDS: CommandDef[] = [
  { name: 'explain', description: 'Explain code or concept', tool: 'windsurf', toolLabel: 'Windsurf' },
  { name: 'fix', description: 'Fix code issues', tool: 'windsurf', toolLabel: 'Windsurf' },
  { name: 'test', description: 'Generate unit tests', tool: 'windsurf', toolLabel: 'Windsurf' },
  { name: 'refactor', description: 'Refactor code', tool: 'windsurf', toolLabel: 'Windsurf' },
  { name: 'docs', description: 'Generate documentation', tool: 'windsurf', toolLabel: 'Windsurf' },
  { name: 'optimize', description: 'Optimize performance', tool: 'windsurf', toolLabel: 'Windsurf' },
]

const CODEX_COMMANDS: CommandDef[] = [
  { name: 'model', description: 'Switch model', tool: 'codex', toolLabel: 'Codex' },
  { name: 'approval', description: 'Set approval mode', tool: 'codex', toolLabel: 'Codex' },
  { name: 'undo', description: 'Undo last action', tool: 'codex', toolLabel: 'Codex' },
  { name: 'diff', description: 'Show changes since start', tool: 'codex', toolLabel: 'Codex' },
  { name: 'clear', description: 'Clear conversation', tool: 'codex', toolLabel: 'Codex' },
  { name: 'help', description: 'Show available commands', tool: 'codex', toolLabel: 'Codex' },
]

const SKILL_COMMANDS: CommandDef[] = [
  { name: 'openspec:proposal', description: 'Create a new change proposal', tool: 'claude', toolLabel: 'OpenSpec' },
  { name: 'openspec:apply', description: 'Apply an approved change', tool: 'claude', toolLabel: 'OpenSpec' },
  { name: 'openspec:archive', description: 'Archive a completed change', tool: 'claude', toolLabel: 'OpenSpec' },
  { name: 'figma:figma-use', description: 'Use Figma component in code', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-use-slides', description: 'Use Figma slides', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-generate-library', description: 'Generate component library', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-code-connect', description: 'Connect code to Figma', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-use-figjam', description: 'Use FigJam board', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-create-new-file', description: 'Create new Figma file', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-generate-diagram', description: 'Generate diagram', tool: 'claude', toolLabel: 'Figma' },
  { name: 'figma:figma-generate-design', description: 'Generate design from prompt', tool: 'claude', toolLabel: 'Figma' },
]

export const COMMAND_REGISTRY: CommandDef[] = [
  ...CLAUDE_COMMANDS,
  ...SKILL_COMMANDS,
  ...CURSOR_COMMANDS,
  ...AIDER_COMMANDS,
  ...WINDSURF_COMMANDS,
  ...CODEX_COMMANDS,
]

const matchesCommand = (cmdName: string, query: string): boolean => {
  const name = cmdName.toLowerCase()
  if (name.includes(query)) return true
  // For hierarchical commands (e.g. "openspec:proposal"),
  // match if the group prefix matches AND the sub-command portion matches
  if (query.includes(':')) {
    const [qGroup, qSub] = query.split(':', 2)
    const [cGroup, cSub] = name.split(':', 2)
    if (!cSub) {
      return name === qGroup
    }
    return cGroup.startsWith(qGroup) && cSub.includes(qSub)
  }
  return false
}

export const filterCommands = (
  input: string,
  registry: CommandDef[],
  activeToolId: string,
): CommandDef[] => {
  if (!input.startsWith('/') || input.includes(' ')) return []
  const query = input.slice(1).toLowerCase()
  if (!query && !input.endsWith('/')) return []

  return registry
    .filter((cmd) => matchesCommand(cmd.name, query))
    .sort((a, b) => {
      // Active tool first
      const aActive = a.tool === activeToolId ? 0 : 1
      const bActive = b.tool === activeToolId ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      // Starts-with match before contains match
      const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return a.name.localeCompare(b.name)
    })
}

export const mergeWithDynamicCommands = (
  staticRegistry: CommandDef[],
  dynamicCommands: string[],
  toolId: string,
  toolLabel: string,
): CommandDef[] => {
  const staticNames = new Set(
    staticRegistry.filter((c) => c.tool === toolId).map((c) => c.name),
  )
  const dynamicOnly = dynamicCommands
    .filter((name) => !staticNames.has(name))
    .map((name): CommandDef => ({
      name,
      description: '',
      tool: toolId,
      toolLabel,
    }))
  return [...staticRegistry, ...dynamicOnly]
}
