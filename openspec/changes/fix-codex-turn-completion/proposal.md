# Fix Codex Turn Completion State

## Summary

Codex-backed mission agents currently treat a normal one-turn `codex exec` process exit as mission completion. This causes the mission to move to `stopped/success` and triggers desktop "Task Completed" notifications immediately after every Codex reply.

## Root Cause

Codex sessions are intentionally one-shot: TeemAI writes the prompt to stdin and closes stdin. When Codex finishes the turn, the process exits successfully. The generic runtime exit path interprets exit code `0` as a finished mission, even though for Codex it only means "turn completed and waiting for the next user message".

## Goals

- Keep Codex missions in a resumable idle state after normal one-turn replies.
- Suppress completion notifications for normal Codex turn exits.
- Preserve true terminal states for explicit stop, timeout, model switch, and non-Codex providers.
- Keep existing resume behavior for the next Codex message.

## Non-Goals

- Changing Claude or Qoder completion behavior.
- Replacing the current `codex exec resume` one-shot architecture.
- Redesigning mission lifecycle terminology.

## Approach

Introduce a runtime-level distinction between a process exit that completes a mission and a provider-specific turn exit that should leave the mission idle. For successful Codex exits, the server will update the mission to `idle/waiting_input` instead of `stopped/success`, and activity broadcasts will carry `waiting_input` rather than `completed`, preventing Electron's completed notification path.

## Risks

- Existing UI code may assume every process exit is terminal.
- Completed-session replay must still be available so the next Codex turn can resume from the prior CLI session.
- Workflow/background uses that rely on Codex success as task completion need to continue receiving explicit completion when appropriate.
