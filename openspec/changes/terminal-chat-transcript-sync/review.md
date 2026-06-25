# Review: Terminal/Chat Transcript Sync

## Code Review

- Focused regression tests cover terminal JSONL batch forwarding, fallback transcript rendering when PTY output has no printable bytes, and xterm opening on `agent:view-attached`.
- No issues found in the touched terminal sync path after focused tests and browser verification.

## Architecture Review

- The design matches the product semantic model: session JSONL is the message source of truth, while message mode and terminal mode are two UI projections over the same mission conversation.
- Native CLI PTY output remains terminal-only and is not parsed into semantic chat messages. This avoids coupling chat correctness to ANSI/TUI output.
- Terminal snapshot fallback is display-only and only applies when the native PTY has not emitted printable output, so user input still targets the live CLI session.

## UI Review

- Browser verification passed for `http://localhost:13000/workspace/YQLKikbLmY/mission/cIJ6XNzV`.
- Verified message-to-terminal toggle, WebSocket attach and replay events, xterm mount dimensions, absence of restoring/unavailable placeholders, hidden message composer in terminal mode, and no browser console/page errors.
