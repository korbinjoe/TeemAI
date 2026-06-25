# Design: Terminal/Chat Transcript Sync

## Current Problem

Terminal mode uses `TerminalViewManager` to spawn a sibling native CLI PTY (`claude --resume`, `codex resume`, or Qoder equivalent). `WSRouter` routes `agent:input` to that PTY first. This gives native terminal behavior, but it also bypasses the structured message pipeline that feeds chat mode.

Chat mode renders from `agent:structured-message` and `agent:partial-text`, ultimately derived from session JSONL. Terminal mode renders raw PTY bytes from `agent:data`. These are two independent streams today.

## Target Architecture

The mission conversation has one transcript authority: provider session JSONL. UI modes differ only in rendering and interaction:

- Message mode: structured cards from parsed JSONL messages.
- Terminal mode: native xterm interaction with CLI PTY, plus the same parsed JSONL deltas sent to the chat state.

The short-term bridge keeps the existing native PTY for interactivity and adds JSONL-derived deltas beside it. The long-term architecture should collapse ACP/native terminal writes into a runtime that makes session adoption explicit.

## Decisions

### D1: JSONL Is the Message Source

PTY stdout is not parsed into chat messages. The server watches the provider JSONL file and emits structured message batches. This preserves existing parser, dedup, and rendering behavior.

### D2: Terminal PTY Remains the Native Interaction Surface

Terminal mode can still drive Claude Code CLI / Codex CLI directly. The PTY owns raw input, TUI menus, control characters, resize, and ANSI output. The sync layer observes persisted transcript changes.

### D3: Reuse Existing Message Contract

The bridge sends `_teemai/messages_batch` through `acpUpdateToWSMessage`, producing `agent:structured-message`. The web chat state does not need a terminal-specific path.

### D4: Incremental Runtime Unification

This change does not remove ACP or merge processes. It fixes user-visible consistency for sessions whose known JSONL is updated by the terminal CLI. If a provider creates a new transcript file on resume, a later session-adoption step must update the mission session pointer.

### D5: Terminal Snapshot Fallback Is Display-Only

When the native CLI PTY emits only control sequences after attach, terminal mode renders a bounded snapshot formatted from session JSONL. This prevents a blank terminal while preserving PTY input as the live interaction path. Once printable PTY output arrives, the native PTY snapshot remains authoritative for the terminal surface.

## Data Flow

```text
xterm input -> agent:input -> TerminalViewManager -> native CLI PTY
native CLI PTY -> agent:data -> xterm
native CLI writes JSONL -> SessionFileWatcher -> agent:structured-message -> chat message store
JSONL full replay -> terminal snapshot fallback only if PTY has no printable output
```

## Failure Behavior

- If the transcript file cannot be resolved, terminal mode still opens; only cross-mode transcript sync is unavailable for that attach.
- If the watcher errors or times out, the PTY is not killed.
- Full replay on attach is allowed because frontend replay merge treats JSONL as authoritative and dedups existing content.
