# Tasks: Browser Bridge Redesign

## 1. Bridge Server (browser-plugin)

- [x] 1.1 Add `extension-bridge/bridge_server.py` forked from xiaohongshu-skills with role=extension/cli routing and UUID correlation
- [x] 1.2 Add CLI launcher script `extension-bridge/start-bridge.sh` and document `BROWSER_BRIDGE_PORT` env override
- [x] 1.3 Add unit test: CLI short-connect `ping_server` returns `extension_connected` boolean
- [x] 1.4 Add integration test: mock extension WS handshake + one forwarded command round-trip

## 2. Extension Bridge Handler

- [x] 2.1 Create `src/background/bridge-handler.ts` — WebSocket client, reconnect, handshake `{ role: "extension" }`
- [x] 2.2 Create `src/lib/bridge/primitives.ts` — implement navigate, wait_for_load, wait_dom_stable, evaluate
- [x] 2.3 Create `src/lib/bridge/navigation.ts` — same-origin `location.href` strategy for xiaohongshu.com / reddit.com
- [x] 2.4 Create `src/lib/bridge/debugger.ts` — trusted click and insertText via chrome.debugger
- [x] 2.5 Wire bridge-handler into `src/background/index.ts`; add `controlMode` setting gate for autonomous scheduler
- [x] 2.6 Port `interceptor.js` 404/302 capture from xiaohongshu-skills into extension (document_start MAIN world)
- [x] 2.7 Add popup connection indicator for WebSocket bridge status (replace or supplement daemon status)

## 3. Skill CLI Foundation

- [x] 3.1 Scaffold `skill-cli/` with `pyproject.toml`, Python ≥ 3.11, `websockets` dependency
- [x] 3.2 Implement `skill-cli/bridge/page.py` — BridgePage with `_call`, `ping_server`, `is_server_running`, primitive wrappers
- [x] 3.3 Implement `skill-cli/cli.py` — argparse entry, `_ensure_bridge_ready()`, `_output()` JSON helper, exit codes 0–4
- [x] 3.4 Implement `skill-cli/shared/run_lock.py` — single-instance lock for mutating commands
- [x] 3.5 Add `ping-server` subcommand and verify end-to-end with loaded extension

## 4. Xiaohongshu Platform Port

- [x] 4.1 Copy `xiaohongshu-skills/scripts/xhs/` into `skill-cli/platforms/xhs/` (selectors, urls, types, errors, human)
- [x] 4.1 Adapt imports to local `bridge/page.py` BridgePage
- [x] 4.2 Wire auth subcommands: check-login, login, send-code, verify-code, delete-cookies
- [x] 4.3 Wire explore subcommands: list-feeds, search-feeds, get-feed-detail, user-profile
- [x] 4.4 Wire interact subcommands: post-comment, reply-comment, like-feed, favorite-feed
- [x] 4.5 Wire publish subcommands: fill-publish, publish, publish-video, click-publish, long-article pipeline
- [x] 4.6 Wire diagnostic subcommands: check-risk, diagnose-404, get-netlog, risk-report
- [x] 4.7 Manual E2E test: check-login → search-feeds → get-feed-detail → post-comment (dry-run then confirm)

## 5. Reddit Platform CLI

- [x] 5.1 Create `skill-cli/platforms/reddit/selectors.py`, `feeds.py`, `comment.py`
- [x] 5.2 Implement `list-feeds --platform reddit --subreddit` via BridgePage navigate + evaluate
- [x] 5.3 Implement `post-comment --platform reddit` with content-file support
- [x] 5.4 Implement `upvote --platform reddit`
- [x] 5.5 Port optional relevance scoring from extension decision-engine to Python (flag `--score`)
- [x] 5.6 Manual E2E test: list-feeds on r/test → post-comment dry-run

## 6. Skill Tree (browser-plugin/skills)

- [x] 6.1 Rewrite `skills/browser-agent/SKILL.md` as root router with CLI-only boundary
- [x] 6.2 Add `skills/xhs-auth/SKILL.md`, `xhs-explore/SKILL.md`, `xhs-publish/SKILL.md`, `xhs-interact/SKILL.md` (adapt from xiaohongshu-skills)
- [x] 6.3 Add `skills/reddit-engage/SKILL.md` with list-feeds / post-comment / upvote whitelist
- [x] 6.4 Add `skills/browser-agent/references/bridge-protocol.md` (sync with design.md communication section)
- [x] 6.5 Add `npm run sync:skills` script copying skills to `TeemAI/ai-assets/skills/` (or document symlink workflow)

## 7. Social Operator Integration (TeemAI)

- [x] 7.1 Update `browser-plugin/agents/social-operator/BOOT.md` — ping-server, cli path resolution
- [x] 7.2 Update `browser-plugin/agents/social-operator/TOOLS.md` — cli.py mapping table, deprecated bash list
- [x] 7.3 Update `browser-plugin/agents/social-operator/workflows/reddit-engage.md` for cli.py commands
- [x] 7.4 Add Xiaohongshu workflow markdown under social-operator workflows
- [x] 7.5 Update `teemai.agent.json` skills array with xhs-* and reddit-engage sub-skills
- [x] 7.6 Run sync:skills → verify TeemAI ai-assets skills load in agent runtime

## 8. Deprecation & Cleanup (Phase 3 — after E2E pass)

- [x] 8.1 Mark `skill/scripts/daemon.mjs`, `native-host/`, `send.sh`, `monitor.sh`, `browser.sh` as deprecated in README
- [x] 8.2 Remove deprecated bridge components from browser-plugin and TeemAI ai-assets
- [x] 8.3 Remove `agent-core.ts` coarse command dispatch (monitor/post/reply); retain autonomous module behind controlMode gate
- [x] 8.4 Update CHANGELOG with **BREAKING** migration guide (send.sh → cli.py mapping)
- [x] 8.5 Update browser-plugin README setup: extension + uv sync + load skills (no Native Host)

## 9. Verification

- [x] 9.1 Document skill ↔ extension communication diagram in `skills/browser-agent/references/bridge-protocol.md`
- [x] 9.2 Add `tests/e2e/bridge-integration.spec.ts` — extension mock or test harness for primitive round-trip
- [x] 9.3 Verify social-operator boot with bridge online/offline scenarios
- [x] 9.4 Verify controlMode=teemai suppresses autonomous actions while bridge commands work
- [x] 9.5 Cross-platform smoke test on macOS: full XHS search-feeds flow
