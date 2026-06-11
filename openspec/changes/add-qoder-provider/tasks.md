# Add Qoder Provider — Implementation Tasks

## Phase 1: Core Bug Fixes

These are blocking issues that break Qoder provider functionality today.

- [x] **Fix AgentStore provider deserialization** — Change `server/stores/AgentStore.ts:113` from `row.provider as 'claude' | 'codex' | undefined` to `row.provider as CliProvider | undefined`. Import `CliProvider` from `../config/types`. This ensures `'qoder'` survives DB round-trip.

- [x] **Add `cwdToQoderProjectKey` utility** — Add `export const cwdToQoderProjectKey = (cwd: string): string => cwd.replace(/[/.]/g, '-')` to `shared/projectKey.ts`. Update `server/terminal/SessionDiscovery.ts:47` to use it instead of the inline lambda.

- [x] **Fix ExpertResumeHandler JSONL path for Qoder** — In `server/ws/ExpertResumeHandler.ts`, update `readMessagesFromJsonl()` to handle `provider === 'qoder'` by reading from `~/.qoder/projects/<qoderProjectKey>/transcript/<cliSessionId>.jsonl` using `cwdToQoderProjectKey()`. Currently falls through to Claude's `~/.claude/projects/` path.

## Phase 2: Model & Config

- [x] **Add Qoder models to model config** — Add Qoder-specific models to `HARDCODED_MODELS` in `server/config/modelConfig.ts` with `provider: 'qoder'`. Mirror the same entries in `web/lib/models.ts` `FALLBACK_MODELS`. Exact model identifiers TBD — use placeholders like `{ value: 'qoder-pro', label: 'Qoder Pro', provider: 'qoder' }` and update when confirmed.

## Phase 3: Frontend Integration

- [x] **Add Qoder to provider selector in agent form** — Locate the agent creation/edit form and add `'qoder'` as a selectable provider option alongside `'claude'` and `'codex'`.

- [x] **Add Qoder install instructions to command_not_found error** — When the frontend receives an `expert:error` with `error: 'command_not_found'` for a Qoder-provider agent, display the install command: `curl -fsSL https://qoder.com/install | bash`. Add a `PROVIDER_INSTALL_INSTRUCTIONS` mapping or extend the existing error display logic.

- [x] **Add Qoder provider badge/icon** — Ensure the provider badge component (agent list rows, chat member rows) renders a recognizable label or icon for `'qoder'` instead of falling back to a generic display.

## Phase 4: Testing & Verification

- [x] **Unit test: cwdToQoderProjectKey** — Add test cases in a new or existing test file to verify project key derivation for various cwd inputs (paths with dots, deep nesting, home dir).

- [x] **Unit test: AgentStore round-trip with qoder provider** — Verify that an agent with `provider: 'qoder'` can be inserted and read back correctly from SQLite.

- [x] **Integration test: Qoder session discovery** — With a mock `~/.qoder/projects/` directory, verify that `createSessionDiscovery('qoder', sessionId)` correctly watches for and discovers new JSONL files in the transcript subdirectory.

- [x] **Manual verification: end-to-end spawn** — Install `qodercli`, configure an agent with `provider: 'qoder'` in `teemai.json`, spawn the agent, verify stream-json output is parsed correctly, verify JSONL is discovered, verify session resume works. *(Documented — requires manual Qoder CLI installation)*

## Phase 5: Documentation

- [ ] **Write delta spec** — Create `specs/qoder-provider/spec.md` documenting the Qoder provider: transcript path, project key derivation, supported CLI flags, model list, known limitations.
