# Proposal: Terminal/Chat Transcript Sync

## Summary

Terminal mode and chat mode are two UI projections of the same mission conversation. Today terminal mode is implemented as a native resume PTY side path: xterm receives raw CLI bytes and sends raw input, while chat mode renders structured events derived from session JSONL. That split lets users talk in terminal mode but leaves the chat message stream stale when they switch back.

This change adds a server-side JSONL transcript sync to the terminal resume bridge. When terminal mode attaches to a native Claude/Codex/Qoder CLI session, the server also watches the resolved session JSONL and emits `agent:structured-message` batches through the same frontend contract used by chat mode. Raw PTY output remains only the terminal rendering surface; JSONL remains the message truth source.

## Motivation

- Users expect message mode and terminal mode to show the same mission conversation.
- Native CLI terminal mode is still required for Claude Code CLI / Codex CLI interactivity.
- PTY stdout is not a reliable semantic transcript; session JSONL is the durable source used by existing chat rendering.
- The current `agent:input` route is intercepted by `TerminalViewManager.forwardInput()`, so terminal input bypasses the structured ACP/chat path.

## Goals

- Sync terminal-originated conversation turns into chat mode without changing the frontend message contract.
- Preserve native terminal interaction through Claude/Codex/Qoder CLI PTYs.
- Fix the blank terminal attach case where no xterm opens before first `agent:data`.
- Keep the change incremental; do not replace the existing ACP runtime in this pass.

## Non-Goals

- Replacing the native CLI PTY with a fully unified runtime.
- Changing database schema or persisting view mode server-side.
- Parsing terminal ANSI output as messages.
- Changing message-mode composer semantics.

## Approach

1. Resolve the provider session JSONL path for `(cwd, cliSessionId, provider)`.
2. Start a `SessionFileWatcher` beside each terminal resume PTY when a transcript file exists.
3. Convert watcher `message:full` / `message:delta` events into `_teemai/messages_batch` and send them as `agent:structured-message`.
4. Keep raw `agent:data` for xterm only.
5. On frontend `agent:view-attached`, create/open the terminal instance even before the first PTY data frame.

## Risks

- If a provider resumes by forking into a new JSONL file instead of appending to the known session file, this bridge will only sync the known file. Runtime unification or session adoption is the follow-up architecture.
- Full replay on attach may duplicate messages if frontend dedup regresses. Existing `applyAgentReplay`/content dedup is the guard.
- Watching many historical terminal sessions can add file watcher overhead; terminal attach already limits prewarm and this change only starts a watcher for attached PTYs.
