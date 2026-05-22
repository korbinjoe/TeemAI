---
name: expert-dispatcher
description: >
  Agent dispatch tool. Used by Lead Agent to start, communicate with, and stop Expert Agents.
  All Agents use check-inbox to check their mailbox, providing unified awareness of expert status (progress, completion, awaiting input).
  Supports Monitor push mode, reducing ~80% communication token consumption.
allowed-tools: Bash,Monitor
---

# Expert Dispatch Instructions

You can manage Expert Agents via the following scripts. All required environment variables are auto-injected — no manual setup needed.

## Environment Variables (Injected)

| Variable | Description |
|----------|-------------|
| `EXPERT_API_BASE` | openteam-server HTTP address |
| `EXPERT_CONNECTION_ID` | Current WS connection ID |
| `OPENTEAM_CHAT_ID` | Current chat ID |
| `OPENTEAM_INSTANCE_ID` | Your instance ID |

## Calling Convention

When calling all dispatcher scripts, **you must use Bash's `description` parameter** with a short description. This makes the UI display a clear operation description instead of a long script path.

| Script | description example |
|--------|-------------------|
| `team-status.sh` | `Check team status` |
| `check-inbox.sh` | `Check expert inbox` |
| `watch-events.sh` | `Start expert event stream` |
| `watch-inbox.sh` | `Start inbox monitor (fallback)` |
| `start-expert.sh` | `Start expert code-reviewer` |
| `send-to-expert.sh` | `Send reply to code-reviewer` |
| `list-experts.sh` | `List running experts` |
| `stop-expert.sh` | `Stop expert code-reviewer` |
| `stop-all-experts.sh` | `Stop all experts` |

## Available Commands

All scripts are in the `scripts/` subdirectory of this Skill directory. Execute with `bash`.

### Check Team Status (Recommended)

```bash
bash {SKILL_DIR}/scripts/team-status.sh
```

- Returns real-time status of all Experts in current Chat at once (phase, current tool, progress, cost)
- Served directly from server memory, zero file IO, more efficient than check-inbox
- Use for on-demand global progress awareness, replacing high-frequency inbox polling

### Start Expert

```bash
bash {SKILL_DIR}/scripts/start-expert.sh <agentId> "<task>" [instanceSuffix]
```

- `agentId`: Expert name (e.g., `fullstack-product-engineer`, `code-reviewer`)
- `task`: Task description assigned to the expert
- `instanceSuffix`: Optional, for running multiple instances of the same expert in parallel (e.g., passing `2` makes instance ID `agentId#2`)
- Returns: JSON launch result (contains taskId, sessionId)

### Event Stream Monitoring (Recommended — SSE Mode)

Use Claude Code's **Monitor tool** to start an SSE event stream. Expert terminal state changes are **auto-pushed** to the conversation:

```
Monitor tool parameters:
  command: "bash {SKILL_DIR}/scripts/watch-events.sh"
  description: "Expert event stream"
  persistent: true
```

**Advantage**: Server-side push, three-layer pipeline, only pushes terminal events (completed/failed/input_required), no idle spinning.

**Use case**: Start Monitor immediately after launching experts, then just wait for notifications. Stop Monitor with TaskStop after all experts complete.

### Inbox Monitoring (Fallback — File Watch Mode)

Fall back to file watching when SSE is unavailable:

```
Monitor tool parameters:
  command: "bash {SKILL_DIR}/scripts/watch-inbox.sh"
  description: "Expert inbox monitor"
  persistent: true
```

### Check Inbox (Last Resort — Pull Mode)

```bash
bash {SKILL_DIR}/scripts/check-inbox.sh
```

**Use case**: Fallback when Monitor is unavailable, or for manually confirming latest status at critical decision points.

| Message Type | Meaning | Handling |
|-------------|---------|----------|
| `task:input_required` | Expert asked a question via AskUserQuestion, awaiting confirmation | Follow "awaiting input loop" |
| `task:completed` | Expert task completed | Get results, verify |
| `task:failed` | Expert task failed | Analyze cause, decide retry or escalate |

> **Note**: Progress info is no longer pushed via inbox. Use `team-status.sh` for on-demand queries (served from server memory, more efficient).

### Send Message to Expert

```bash
bash {SKILL_DIR}/scripts/send-to-expert.sh <agentId> "<message>"
```

- Used to send replies when expert is waiting for input

### List Running Experts

```bash
bash {SKILL_DIR}/scripts/list-experts.sh
```

### Stop Expert

```bash
bash {SKILL_DIR}/scripts/stop-expert.sh <agentId>
```

### Stop All Experts

```bash
bash {SKILL_DIR}/scripts/stop-all-experts.sh
```

## Core Workflow: Start → Monitor → Handle

```
1. start-expert.sh <agentId> "<task>"        ← Start and assign task
2. Monitor watch-events.sh                   ← Start SSE event stream (only pushes terminal states)
3. Turn ends, wait for Monitor notification. No polling.
4. When Monitor notification arrives, handle:
   ├─ [input_required] → Follow "awaiting input loop" (see below)
   ├─ [completed]      → Get results, verify
   └─ [failed]         → Analyze cause, decide retry or escalate
5. Need global progress → team-status.sh     ← On-demand query, gets all at once
6. All experts done → TaskStop to stop Monitor
```

### Parallel Dispatch

When multiple subtasks have no dependencies, start them in parallel:

1. Run `start-expert.sh` to launch multiple experts sequentially
2. Start **1** Monitor (`watch-events.sh`), aggregating all experts' terminal events
3. When Monitor notifications arrive, differentiate by the `from` field in the message
4. Call `team-status.sh` when you need overall progress — gets all status at once
5. After all `task:completed` arrive, TaskStop to stop Monitor

### Fallback When Monitor Is Unavailable

If Monitor tool is unavailable (e.g., tool restrictions), degrade to polling mode:

1. After starting experts, periodically call `team-status.sh` to check global status
2. Call `check-inbox.sh` at critical decision points to check for control signals
3. Handle `task:input_required` promptly when received

## Autonomous Handling Protocol for Expert Awaiting Input

When receiving a `task:input_required` message (Monitor notification or check-inbox return), **this is Lead's autonomous decision point, not a human intervention point**.
You must immediately execute the following steps — do not stop and wait for the user:

1. **Read intent**: Check the `question` field in the message, understand what the expert is asking
2. **Decision path** (choose one — stopping to wait for user is NOT allowed):
   - **Can answer autonomously** (confirmation-type, directional, and task context is sufficient) → give answer directly, go to step 3
   - **Cannot answer autonomously** (requires user decision, e.g., which PR to choose, confirm scope) →
     use `AskUserQuestion` to ask user, then execute step 3 after getting answer
3. **Send immediately**:
   ```bash
   bash {SKILL_DIR}/scripts/send-to-expert.sh <agentId> "<your answer>"
   ```
4. **Continue waiting**: Wait for Monitor's next notification (or manually check-inbox)

> **Absolutely forbidden**: Receiving `task:input_required` and taking no action, only showing the message to user then stopping.
> Must complete the full loop: read intent → decide (autonomous or ask user) → send-to-expert → continue monitoring.

## Usage Standards

1. **Monitor immediately after start**: After calling `start-expert.sh`, immediately start Monitor to watch inbox
2. **Use team-status for progress**: Call `team-status.sh` when you need expert progress, served from memory, more efficient than inbox
3. **Result verification**: After expert completes, check output against acceptance criteria
4. **Monitor pushes control signals**, team-status queries progress — complementary, don't use check-inbox to poll progress

## Message Protocol

For detailed message type definitions for inter-Agent communication, see `references/message-protocol.md`.
