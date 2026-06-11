# Add Qoder Provider — Technical Design

## Architecture Overview

Qoder slots into the existing multi-CLI provider architecture as a Claude-compatible provider. The key insight is that Qoder CLI produces JSONL in the same format as Claude Code, so we reuse the entire Claude parsing pipeline and only override the binary name and file paths.

```
                   ┌─────────────────────────┐
                   │    ConfigCompiler        │
                   │  provider === 'qoder'    │
                   │  → command: 'qodercli'   │
                   │  → same args as claude   │
                   └────────┬────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │     StreamJsonManager      │
              │  spawn('qodercli', args)   │
              │  stdout → StreamJsonParser │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   StreamJsonParser         │
              │  (same as Claude path)     │
              └─────────────┬──────────────┘
                            │
    ┌───────────────────────▼────────────────────────┐
    │              SessionDiscovery                   │
    │  ClaudeSessionDiscovery + custom dirBuilder     │
    │  ~/.qoder/projects/<key>/transcript/<uuid>.jsonl│
    └───────────────────────┬────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │    SessionFileWatcher       │
              │  reuses claudeOutputParser  │
              └────────────────────────────┘
```

## 1. Session Discovery Strategy

### Current State

`SessionDiscovery.ts:44-48` already has a `case 'qoder'` that reuses `ClaudeSessionDiscovery` with a custom `dirBuilder`:

```typescript
case 'qoder':
  return new ClaudeSessionDiscovery(sessionId, (cwd) => {
    const projectKey = cwd.replace(/[/.]/g, '-')
    return join(homedir(), '.qoder', 'projects', projectKey, 'transcript')
  })
```

### Design Decision: Project Key Derivation

The project key derivation `cwd.replace(/[/.]/g, '-')` needs verification. For example:
- `/Users/joe/work/myproject` → `-Users-joe-work-myproject`
- `/home/dev/app` → `-home-dev-app`

This is the same pattern used by Claude Code's `cwdToClaudeProjectKey()` but applied to a different base directory. We should verify this matches Qoder CLI's actual behavior by:
1. Installing Qoder CLI
2. Running a session in a known directory
3. Confirming the transcript path matches our derivation

**Action**: Keep the current implementation but add a utility function `cwdToQoderProjectKey()` in `shared/projectKey.ts` for consistency and testability. If the derivation needs adjustment after verification, there's a single function to update.

### Transcript Directory Structure

```
~/.qoder/
  projects/
    -Users-joe-work-myproject/
      transcript/
        <uuid>.jsonl          # Same format as Claude Code JSONL
```

## 2. Output Parser

### Design Decision: Reuse claudeOutputParser

Qoder CLI writes JSONL in the same format as Claude Code (same `type: 'user' | 'assistant'` entries, same `message.content` block structure, same `tool_use` / `tool_result` format). Therefore:

- **SessionFileWatcher**: Uses `claudeOutputParser` (default) — no parser override needed
- **SessionDiscovery**: Returns `{ sessionId, filePath: undefined, parser: undefined }` — watcher falls back to `claudeOutputParser`
- **StreamJsonParser**: Same stdout format as Claude — `handleSystemEvent`, `handleAssistantEvent`, etc. all apply

No `QoderParser` is needed. If Qoder's format diverges in the future, we add one by implementing the `OutputParser` interface — the architecture supports this cleanly.

## 3. Agent Spawn / Install Flow

### Spawn Command

`ConfigCompiler.compile()` already handles Qoder:
- `command: effectiveProvider === 'qoder' ? 'qodercli' : 'claude'` (line 158, 300)
- Same CLI flags as Claude (`--print`, `--output-format stream-json`, `--input-format stream-json`, etc.)
- Same `--resume` flow for session recovery

### Install Detection

`StreamJsonManager.spawn()` calls `resolveCliCommandAsync(command)` which checks PATH. If `qodercli` is not found, it throws `Command not found: qodercli`. The existing error handling in `ExpertLifecycle.ts` catches this and sends `expert:error` with `error: 'command_not_found'`.

**Enhancement**: Add a provider-specific install instruction message. When the frontend receives `command_not_found` for a Qoder agent, it should display:

```
Qoder CLI not found. Install it with:
curl -fsSL https://qoder.com/install | bash
```

This requires a small frontend change to map `provider + command_not_found` to install instructions.

### Install Instructions Data

Add to a shared constants file or inline in the frontend:

```typescript
const PROVIDER_INSTALL_INSTRUCTIONS: Record<CliProvider, string> = {
  claude: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
  codex: 'Install Codex CLI: npm install -g @openai/codex',
  qoder: 'Install Qoder CLI: curl -fsSL https://qoder.com/install | bash',
  acp: '',
}
```

## 4. Config Schema Changes

### teemai.json / openteam.json

No schema changes needed. The `agents.list[].provider` field already accepts `'qoder'` via the `CliProvider` type. Example:

```json
{
  "agents": {
    "defaults": {
      "provider": "claude"
    },
    "list": [
      {
        "id": "qoder-engineer",
        "name": "Qoder Engineer",
        "provider": "qoder",
        "skills": ["whiteboard"]
      }
    ]
  }
}
```

### Model Config

Add Qoder-specific models to `server/config/modelConfig.ts`:

```typescript
{ value: 'qoder-pro', label: 'Qoder Pro', provider: 'qoder' },
{ value: 'qoder-fast', label: 'Qoder Fast', provider: 'qoder' },
```

The exact model identifiers will be confirmed against Qoder's documentation. These models are also duplicated in `web/lib/models.ts` as the frontend fallback list.

## 5. Bug Fixes Required

### 5a. AgentStore.rowToEntity Provider Mapping

**File**: `server/stores/AgentStore.ts:113`

**Bug**: The `provider` field is cast to `'claude' | 'codex' | undefined`, dropping `'qoder'`:

```typescript
// BEFORE (buggy)
provider: row.provider as 'claude' | 'codex' | undefined,

// AFTER (fixed)
provider: row.provider as CliProvider | undefined,
```

This requires importing `CliProvider` from `../config/types`.

### 5b. ExpertResumeHandler JSONL Path

**File**: `server/ws/ExpertResumeHandler.ts:58-68`

**Bug**: `readMessagesFromJsonl` falls through to the Claude path for Qoder, using `cwdToClaudeProjectKey()` which points to `~/.claude/projects/...` instead of `~/.qoder/projects/...`:

```typescript
// BEFORE (buggy)
const readMessagesFromJsonl = (cwd, cliSessionId, provider = 'claude') => {
  if (provider === 'codex') return readCodexRollout(cliSessionId)
  // Falls through to Claude path for ALL other providers
  const projectKey = cwdToClaudeProjectKey(cwd)
  const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, `${cliSessionId}.jsonl`)
  ...
}

// AFTER (fixed)
const readMessagesFromJsonl = (cwd, cliSessionId, provider = 'claude') => {
  if (provider === 'codex') return readCodexRollout(cliSessionId)
  if (provider === 'qoder') {
    const projectKey = cwdToQoderProjectKey(cwd)
    const jsonlPath = join(homedir(), '.qoder', 'projects', projectKey, 'transcript', `${cliSessionId}.jsonl`)
    if (!existsSync(jsonlPath)) return null
    const msgs = parseConversationFile(jsonlPath)
    return msgs.length > 0 ? msgs : null
  }
  // Default: Claude path
  const projectKey = cwdToClaudeProjectKey(cwd)
  const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, `${cliSessionId}.jsonl`)
  ...
}
```

## 6. Frontend Provider Integration

### Agent Creation/Edit

The agent form should include `'qoder'` in the provider selector dropdown. Currently the provider field likely only shows `claude` and `codex`.

**Files to update**:
- Agent creation/edit form component (search for provider selector)
- Provider badge/icon display in agent list

### Model Filtering

When a user selects `provider: 'qoder'` for an agent, the model dropdown should filter to show only models with `provider: 'qoder'` (plus models with no provider tag, which are considered universal).

### Install Status Indicator

Add a provider health check endpoint or client-side check that verifies `qodercli` is on PATH. Display an install prompt if not found.

## 7. Shared Utilities

### cwdToQoderProjectKey

Add to `shared/projectKey.ts`:

```typescript
export const cwdToQoderProjectKey = (cwd: string): string => {
  return cwd.replace(/[/.]/g, '-')
}
```

This mirrors the derivation currently inline in `SessionDiscovery.ts:47` and provides a single source of truth for both session discovery and resume handler.

## 8. No New Dependencies

Qoder provider integration requires zero new npm dependencies:
- Reuses existing `claudeOutputParser`
- Reuses existing `ClaudeSessionDiscovery` with custom `dirBuilder`
- Reuses existing `StreamJsonParser` handlers
- Reuses existing `ConfigCompiler` Claude path with command override
- Reuses existing `SessionFileWatcher`

## Decisions

1. **Reuse vs. new parser**: Reuse `claudeOutputParser` — Qoder uses identical JSONL format. Reassess if format diverges.
2. **Project key function**: Extract `cwdToQoderProjectKey` to `shared/projectKey.ts` for DRY and testability.
3. **Model list**: Add placeholder Qoder models; exact values TBD based on Qoder docs.
4. **No auto-install**: Users install `qodercli` manually; we detect and inform.
