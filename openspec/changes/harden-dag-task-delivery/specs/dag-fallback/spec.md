# Spec: DAG Fallback Strategy

## ADDED Requirements

### Requirement: Merge-remaining fallback on exhausted retries

The scheduler SHALL merge all remaining pending and failed task descriptions into a single handoff dispatch when a DAG with `fallback: { strategy: 'merge-remaining' }` has the fallback triggered by Lead.

#### Scenario: Fallback merges 3 remaining tasks into single handoff

- **Given** a DAG with tasks [A, B, C] and `fallback: { strategy: 'merge-remaining' }`
- **And** task A has reached `maxRejects` cap (reject count = 2)
- **And** tasks B and C are still pending
- **When** Lead triggers `fallback-workflow.sh`
- **Then** the scheduler combines descriptions of A, B, and C into a single prompt
- **And** dispatches a handoff to a single agent with the merged prompt
- **And** marks A, B, and C as `skipped` with reason "merged into fallback handoff"

#### Scenario: Fallback uses configured agentId

- **Given** a DAG with `fallback: { strategy: 'merge-remaining', agentId: 'fullstack-engineer' }`
- **When** fallback is triggered
- **Then** the single handoff is dispatched to `fullstack-engineer`

#### Scenario: Fallback uses first remaining task's agentId when not configured

- **Given** a DAG with `fallback: { strategy: 'merge-remaining' }` (no `agentId`)
- **And** the first remaining pending task has `agentId: 'architect'`
- **When** fallback is triggered
- **Then** the single handoff is dispatched to `architect`

#### Scenario: Merged description capped at 8000 chars

- **Given** 5 remaining tasks with combined descriptions exceeding 8000 chars
- **When** fallback merges the descriptions
- **Then** the merged prompt is truncated to at most 8000 chars
- **And** each task description is proportionally shortened

#### Scenario: Fallback rejected when not configured

- **Given** a DAG with no `fallback` field
- **When** Lead calls `fallback-workflow.sh`
- **Then** the API returns HTTP 400 with error `no_fallback_configured`

### Requirement: Fallback-workflow shell script

A `fallback-workflow.sh` script SHALL be available as a Lead skill action
to trigger the merge-remaining fallback for a workflow.

#### Scenario: Script triggers fallback successfully

- **Given** a workflow `wf-abc` with fallback configured
- **When** Lead runs `fallback-workflow.sh 'wf-abc'`
- **Then** the script POSTs to `/api/workflow/wf-abc/fallback`
- **And** prints the dispatched agent and merged task count

#### Scenario: Lead prompt includes fallback option at reject cap

- **Given** a task has reached its `maxRejects` cap
- **And** the DAG has a `fallback` config
- **When** the scheduler builds the Lead prompt for this workflow event
- **Then** the action block includes a 4th option: `fallback-workflow.sh '<workflowId>'`
