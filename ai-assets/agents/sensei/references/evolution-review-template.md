# Hermes-Style Evolution Review Template

Use this template only inside an EvolutionReviewJob. The job is proposal-only:
do not write SOUL.md, AGENTS.md, SKILL.md, or support files directly.

## Inputs

- Target type and id
- Trigger type
- Evidence bundle
- Current prompt or skill content, read-only
- Prior similar episodes, if available

## Non-Capture Rules

Do not propose memory or skill changes for:

- transient dependency outages
- local environment setup failures
- one-off user preference changes without repeated evidence
- failures caused by missing permissions or unavailable tools
- tasks outside the target agent's intended scope

## Required Output

````markdown
## Evolution Proposal: <target> - <summary>

### Evidence
- <source>: <observation>

### Root Cause
<why the current behavior produced the issue>

### Change
```diff
- old instruction or file excerpt
+ new instruction or file excerpt
```

### Expected Impact
<specific behavior improvement>

### Risk
<what could regress>

### Validation Plan
<targeted check or test>

### Rollback Path
<snapshot, revert, or reject path>
````
