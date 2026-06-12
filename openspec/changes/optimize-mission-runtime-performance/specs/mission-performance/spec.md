# Capability: Mission Runtime Performance

Performance contracts for the Mission message pipeline and Mission/chat
switching. These requirements constrain *how* the existing behavior is computed
so that frequent interactions stay responsive, without changing observable
message content, ordering, or status semantics.

## ADDED Requirements

### Requirement: Incremental aggregate message ordering

The aggregate Mission message view SHALL be produced by merging the
already-sorted per-agent message slots, and SHALL NOT re-sort the entire
Mission history on every message mutation. The merged ordering and tie-breaking
MUST be identical to a stable timestamp sort of all messages.

#### Scenario: New streamed message appended to a long Mission

Given a Mission with at least 500 total messages across multiple agents
And each per-agent slot is already in ascending timestamp order
When one agent receives a new message whose timestamp is the newest
Then the aggregate view is updated without performing a full re-sort of all messages
And the resulting order is identical to a stable timestamp sort of all messages

#### Scenario: Single-agent Mission

Given a Mission whose messages all belong to one agent slot
When the aggregate view is computed
Then it returns that slot's already-sorted list without an additional sort pass

#### Scenario: Equal-timestamp messages keep stable order

Given two messages from different agent slots with identical timestamps
When the aggregate view is computed
Then their relative order matches the stable timestamp sort previously produced
And downstream grouping and dedup output is unchanged

### Requirement: Buffered streaming text updates

Partial streaming text events SHALL be coalesced through the per-agent delta
buffer rather than triggering one state update per chunk. No streamed text may
be lost when the turn ends.

#### Scenario: Rapid partial-text chunks within one frame

Given an agent is streaming and emits multiple partial-text chunks within a 16ms window
When the chunks are processed
Then they are merged into a single state update for that agent
And the rendered streaming message contains all chunk text in order

#### Scenario: Turn ends with buffered text pending

Given partial-text chunks are buffered for an agent
When the agent's turn ends or a full replay arrives
Then the buffer is flushed so no streamed text is dropped
And a full replay supersedes any residual streaming entry for that agent

### Requirement: Incremental group activity updates

Per-group activity state SHALL be updated only for the currently-running group(s)
per agent, and SHALL NOT be recomputed by scanning every group on each change.

#### Scenario: Activity changes during an active turn

Given a Mission with many completed groups and one running group for an agent
When the running agent's activity changes
Then only the last group for that agent has its activity entry updated
And completed groups' activity entries are left untouched

### Requirement: Background mission instances do no live git work

A cached but non-active Mission instance SHALL NOT issue git or worktree status
requests or run periodic git polling. When an instance becomes active it MUST
refresh git status immediately so displayed change counts are not stale.

#### Scenario: Switching between cached missions

Given up to four Mission instances are mounted with only one active
When the user switches to another cached Mission
Then only the now-active instance issues git/worktree status requests
And the previously-active instance stops polling

#### Scenario: Returning to a previously-active mission

Given a Mission instance that was active, then backgrounded
When it becomes active again
Then it performs one immediate git status refresh
And its change-count indicator reflects the current repository state

### Requirement: Single shared workspace-chats subscription

Workspace chat list data SHALL be sourced from a single shared subscription per
workspace. A single `chat:activity` or `chat:status-changed` event MUST update
one reducer, and a single mission-created event MUST trigger at most one chat
list refresh, regardless of how many components consume the data.

#### Scenario: Agent activity while many consumers are mounted

Given multiple components consume the workspace chat list for the same workspace
When a `chat:activity` event arrives
Then the shared store updates once
And consumers re-render from the shared state without each issuing its own fetch

#### Scenario: Creating a new mission

Given the workspace chat list is consumed by multiple components
When a new mission is created and a `teemai:chat-created` event is dispatched
Then at most one `/api/workspaces/:id/chats` refresh is issued for that workspace
And all consumers reflect the new mission

#### Scenario: Consumer API is unchanged

Given existing components call the workspace-chats hook
When the shared subscription backs the hook
Then the hook returns the same shape (chats, loading, refresh, awaitingReview, running, done)
And no consumer call site requires modification

### Requirement: Mission switch cost is bounded by the visible window

Switching to a Mission SHALL NOT perform a full re-sort of that Mission's entire
message history. Replay MUST populate per-agent slots in order and the aggregate
view MUST be produced by incremental merge.

#### Scenario: Switching into a long historical mission

Given a historical Mission with a large message history
When the user switches into it and a full replay is applied
Then each per-agent slot is populated in ascending timestamp order
And the aggregate view is produced by merging sorted slots, not by re-sorting all messages
And the displayed messages and ordering are identical to the prior implementation
