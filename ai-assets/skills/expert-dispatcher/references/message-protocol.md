# Inter-Agent Message Protocol Reference

This document defines the message types and formats used for inter-agent communication.

## Base Message Structure

All messages share the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique message ID (timestamp + random suffix) |
| `timestamp` | string | Send time (ISO 8601) |
| `from` | string | Sender instance ID |
| `to` | string | Receiver instance ID |
| `chatId` | string | Parent Chat ID |
| `type` | string | Message type (see below) |
| `protocolVersion` | string | Fixed `"1.0"` |
| `taskId` | string? | Associated task ID |
| `replyTo` | string? | Referenced message ID |

## Message Types

### Task Lifecycle

| type | Direction | payload | Description |
|------|-----------|---------|-------------|
| `task:assign` | Lead → Expert | TaskEnvelope | Assign task |
| `task:accepted` | Expert → Lead | `{taskId}` | Accept task |
| `task:progress` | Expert → Lead | ProgressReport | Progress update |
| `task:milestone` | Expert → Lead | `{taskId, milestone, percent}` | Milestone |
| `task:blocked` | Expert → Lead | `{taskId, reason}` | Blocked report |
| `task:completed` | Expert → Lead | TaskResult | Task completed |
| `task:failed` | Expert → Lead | TaskResult | Task failed |

### Collaboration

| type | Direction | payload | Description |
|------|-----------|---------|-------------|
| `query` | Bidirectional | `{question, timeoutMs?}` | Ask question |
| `response` | Bidirectional | `{answer}` | Answer |
| `handoff` | Expert → Expert | HandoffPayload | Work handoff |
| `artifact` | Expert → Lead | `{path, description}` | Artifact notification |

## TaskEnvelope Structure

```json
{
  "taskId": "task-1234567890-abcd",
  "agentId": "fullstack-product-engineer",
  "description": "Task description",
  "priority": "p0 | p1 | p2",
  "inputs": {
    "files": ["path/to/file.ts"],
    "context": "Context information"
  },
  "expectedOutputs": {
    "type": "code | document | review | design | image",
    "acceptanceCriteria": ["Acceptance criterion 1", "Acceptance criterion 2"]
  }
}
```

## ProgressReport Structure

```json
{
  "taskId": "task-xxx",
  "percent": 50,
  "phase": "Implementing core logic",
  "status": "working | blocked | completed | failed",
  "justCompleted": "Completed data model design",
  "newArtifact": {"path": "file.ts", "description": "New file"}
}
```

## Progress Reporting Method

Expert Agent reports progress by appending messages to a file:

```bash
# File path: ~/.openteam/mailbox/{chatId}/{instanceId}→lead.jsonl
# Format: one JSON object per line
echo '{"id":"...","timestamp":"...","from":"expert-id","to":"lead","chatId":"...","type":"task:progress","protocolVersion":"1.0","payload":{"taskId":"...","percent":50,"phase":"implementing","status":"working"}}' >> ~/.openteam/mailbox/{chatId}/{instanceId}→lead.jsonl
```
