# Design: Unified AI Tool Command Palette

## Architecture

```
InputArea.tsx
  └── SlashCommandMenu (enhanced)
        ├── CommandRegistry     — static merged command list from all tools
        ├── CommandFilter       — fuzzy match + sort by relevance
        └── CommandBadge        — tool origin indicator
```

## Data Model

### Command Registry (`web/lib/commandRegistry.ts`)

```typescript
export interface CommandDef {
  name: string          // 'compact', 'explain', 'figma:use'
  description: string
  tool: string          // 'claude' | 'cursor' | 'aider' | 'windsurf' | 'figma'
  toolLabel: string     // display name: 'Claude Code', 'Cursor', etc.
  args?: string         // argument hint
  category?: string     // optional grouping: 'context', 'code', 'navigation'
}

// Flat merged list of all commands
export const COMMAND_REGISTRY: CommandDef[] = [
  // Claude Code
  { name: 'compact', description: 'Compress conversation with optional focus', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'clear', description: 'Clear conversation history', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'model', description: 'Select or change AI model', tool: 'claude', toolLabel: 'Claude Code' },
  { name: 'plan', description: 'Enter Plan Mode', tool: 'claude', toolLabel: 'Claude Code' },
  // ...all existing Claude commands

  // Cursor
  { name: 'explain', description: 'Explain selected code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'fix', description: 'Fix issues in selected code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'test', description: 'Generate tests for code', tool: 'cursor', toolLabel: 'Cursor' },
  { name: 'docs', description: 'Generate documentation', tool: 'cursor', toolLabel: 'Cursor' },

  // Aider
  { name: 'add', description: 'Add file to chat context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'drop', description: 'Remove file from context', tool: 'aider', toolLabel: 'Aider' },
  { name: 'run', description: 'Run shell command', tool: 'aider', toolLabel: 'Aider' },
  { name: 'commit', description: 'Commit changes with message', tool: 'aider', toolLabel: 'Aider' },

  // Multi-level (colon hierarchy)
  { name: 'figma:use', description: 'Use Figma component', tool: 'figma', toolLabel: 'Figma' },
  { name: 'figma:generate-design', description: 'Generate design from prompt', tool: 'figma', toolLabel: 'Figma' },
]
```

### Command Filter Logic

```typescript
function filterCommands(
  input: string,             // e.g. "/exp" → query = "exp"
  registry: CommandDef[],
  activeToolId: string,      // prioritize active tool's commands
): CommandDef[] {
  const query = input.slice(1).toLowerCase() // strip leading "/"
  
  return registry
    .filter(cmd => cmd.name.toLowerCase().includes(query))
    .sort((a, b) => {
      // Active tool's commands first
      if (a.tool === activeToolId && b.tool !== activeToolId) return -1
      if (b.tool === activeToolId && a.tool !== activeToolId) return 1
      // Then alphabetical
      return a.name.localeCompare(b.name)
    })
}
```

## Component Changes

### Modified: `SlashCommandMenu.tsx`

- Each command row adds a small tool badge: `[Claude Code]`, `[Cursor]`, etc.
- Badge is subtle (muted text, right-aligned)
- Section dividers when tool changes in sorted list (optional, could be visually noisy)

### Modified: `InputArea.tsx`

- Replace `filteredCmds` (string array) with `filteredCommands` (CommandDef array)
- Pass full `CommandDef` to `SlashCommandMenu` for badge rendering
- `handleSlashSelect` receives `CommandDef` and formats output per tool's convention

### New: `web/lib/commandRegistry.ts`

- Exports `COMMAND_REGISTRY` and `filterCommands()`
- Easy to extend: add entries to the array

## Decisions

### D1: Flat list, no tool namespacing

User types `/explain`, not `/cursor:explain`. The tool origin is informational (badge), not syntactic.

### D2: `:` reserved for command hierarchy

`/figma:use` means "figma" is a command group, "use" is the sub-command. This is structural hierarchy, same as `/install-github-app` uses dash.

### D3: Active tool's commands sort first

If the current session is Claude Code, Claude commands appear at the top of the filtered list. Other tools' commands still show but below.

### D4: Static registry for v1

All commands are statically defined. The `slashCommands` array from WebSocket (dynamic from CLI) merges with (or overrides) the static Claude entries at runtime.
