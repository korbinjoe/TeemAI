# Qoder Provider Specification

## Overview

Qoder CLI (`qodercli`) is a Claude Code-compatible CLI provider. It produces JSONL transcripts in the same format as Claude Code and accepts the same stream-json protocol over stdin/stdout. The only differences are the binary name, transcript storage path, and project key derivation.

## Provider Identity

| Field | Value |
|-------|-------|
| `CliProvider` value | `'qoder'` |
| Binary name | `qodercli` |
| Install command | `curl -fsSL https://qoder.com/install | bash` |
| Config home | `~/.qoder/` |

## Transcript Path

```
~/.qoder/projects/<project-key>/transcript/<session-uuid>.jsonl
```

### Project Key Derivation

```typescript
const cwdToQoderProjectKey = (cwd: string): string => cwd.replace(/[/.]/g, '-')
```

Examples:
- `/Users/joe/work/myproject` → `-Users-joe-work-myproject`
- `/home/dev/app` → `-home-dev-app`
- `/Users/joe/work/my.project` → `-Users-joe-work-my-project`

Source of truth: `shared/projectKey.ts`

## JSONL Format

Qoder uses the same JSONL format as Claude Code:

```jsonl
{"type":"user","message":{"role":"user","content":"..."},"timestamp":"...","uuid":"..."}
{"type":"assistant","message":{"role":"assistant","content":[...],"model":"...","usage":{...}},"timestamp":"...","uuid":"..."}
```

Parser: `claudeOutputParser` (reused, no Qoder-specific parser)

## Stream-JSON Protocol

Same as Claude Code:
- `--print --verbose`
- `--output-format stream-json`
- `--input-format stream-json`
- `--include-partial-messages`
- `--replay-user-messages`

Message types: `system`, `assistant`, `stream_event`, `user`, `result`

## CLI Flags

| Flag | Supported |
|------|-----------|
| `--print` | Yes |
| `--output-format stream-json` | Yes |
| `--input-format stream-json` | Yes |
| `--resume <sessionId>` | Yes |
| `--dangerously-skip-permissions` | Yes |
| `--system-prompt` / `--append-system-prompt` | Yes |
| `--model <model>` | Yes |
| `--max-turns <n>` | Yes |
| `--settings <path>` | Yes |
| `--mcp-config <json>` | Yes |
| `--allowedTools` / `--disallowedTools` | Yes |
| `--add-dir <path>` | Yes |

## Reuse Matrix

| Component | Reuses | Notes |
|-----------|--------|-------|
| `SessionDiscovery` | `ClaudeSessionDiscovery` | Custom `dirBuilder` for `~/.qoder/` path |
| `OutputParser` | `claudeOutputParser` | Identical JSONL format |
| `SessionFileWatcher` | 100% reuse | Injected parser via discovery result |
| `StreamJsonParser` | 100% reuse | Same stream-json protocol |
| `ConfigCompiler` | Claude path | `command: 'qodercli'` override only |
| `TerminalViewManager` | Claude path | `command: 'qodercli'` for `--resume` |
| `ExpertResumeHandler` | Needs Qoder-specific path | Route to `~/.qoder/` for JSONL read |

## Models

| Model ID | Label | Notes |
|----------|-------|-------|
| `qoder-pro` | Qoder Pro | Primary model (TBD confirmation) |
| `qoder-fast` | Qoder Fast | Fast/cheap model (TBD confirmation) |

Model identifiers are placeholders pending confirmation against Qoder CLI documentation.

## Known Limitations

1. **No Qoder-specific env config** — Unlike Codex which has `resolveCodexProviderEnv()`, Qoder currently uses no provider-specific environment variables. If Qoder requires API keys or config env vars, a `resolveQoderProviderEnv()` function should be added.
2. **Project key derivation unverified** — The `cwd.replace(/[/.]/g, '-')` derivation needs verification against an actual Qoder CLI installation.
3. **No auto-install** — User must manually install `qodercli`.
