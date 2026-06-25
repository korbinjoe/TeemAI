# Tasks: Terminal/Chat Transcript Sync

- [x] 1.1 Document root cause and target architecture.
- [x] 2.1 Add provider-aware session transcript path resolution.
- [x] 2.2 Start a JSONL watcher beside terminal resume PTYs.
- [x] 2.3 Emit watcher full/delta batches through `agent:structured-message`.
- [x] 2.4 Stop transcript watchers with terminal PTY lifecycle.
- [x] 3.1 Create/open xterm instance on `agent:view-attached`.
- [x] 4.1 Add server regression for terminal JSONL batches.
- [x] 4.2 Add web regression for view-attached opening before first data.
- [x] 5.1 Run focused tests.
- [x] 5.2 Run TypeScript check.
- [x] 5.3 Run browser UI verification on mission `cIJ6XNzV`.
- [x] 5.4 Add reusable UI verification skill for future large changes.
- [x] 5.5 Record verification review report.

## Verification Notes

- Focused Vitest coverage passes for server terminal sync and web terminal attach.
- `npx tsc --noEmit` passes for web.
- `npm run build:server` passes.
- Browser UI verification passes at `http://localhost:13000/workspace/YQLKikbLmY/mission/cIJ6XNzV`: message → terminal toggle works, `agent:cli-attach` is sent, `agent:view-attached` and `agent:structured-message` are received, xterm is mounted with nonzero dimensions, and no browser console/page errors were reported.
- Re-run with exact `button[aria-label="Message"]` / `button[aria-label="Terminal"]` selectors confirms terminal mode becomes active, xterm mounts, and the JSONL snapshot fallback prevents the terminal surface from staying blank when the native Codex PTY initially emits no printable content.
- `npx tsc -p server/tsconfig.json` remains blocked by existing repo-wide server type errors/rootDir issues; filtering the output shows no new actionable errors in `TerminalViewManager` or its test, and only the existing shared-rootDir class for `SessionTranscript`'s `projectKey` import.
