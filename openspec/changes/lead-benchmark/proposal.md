# Lead Agent Benchmark: Fault Injection Test Suite

## Summary

Design a fault injection benchmark targeting the Lead agent's three weakest decision surfaces:
1. **Blind trust** — Lead receives `"Agent X completed task Y"` with zero evidence (WorkflowScheduler L101-108 fills `artifacts: []`, `modifiedFiles: []`)
2. **No output verification** — `onActivityChanged` treats `waiting_input` phase as completion, no deliverable check
3. **No conflict detection** — parallel branches can write the same files without any merge gate

## Root Cause Analysis

### Current completion flow

```
Agent exits / enters waiting_input
    → WorkflowScheduler.recordAndNotifyLead()
        → Constructs TaskResult with EMPTY artifacts/modifiedFiles
        → Sends Lead a text prompt: "[done] taskId (agentId): Agent X completed task Y"
    → Lead reads the prompt, calls advance-workflow.sh
    → Next tasks start
```

**Critical gap**: Between "Agent said done" and "Lead advances", there is NO:
- File existence check (did design.md get created?)
- Boundary enforcement (did design agent write .tsx files?)
- Content quality gate (is the output non-empty and structurally valid?)
- Cross-branch conflict detection (did two agents edit the same file?)

---

## Test Case Design

### Dimension 1: Completion Evidence Verification

These tests inject agents that report success but produce incomplete/missing/wrong deliverables.

#### TC-1.1: Missing Primary Deliverable

```yaml
id: TC-1.1
name: missing_primary_deliverable
category: completion_evidence
severity: critical

setup:
  dag:
    tasks:
      - taskId: design
        agentId: ui-designer
        description: "Create DESIGN.md with component hierarchy for settings page"
        dependsOn: []
      - taskId: implement
        agentId: fullstack-product-engineer
        description: "Implement settings page based on DESIGN.md"
        dependsOn: [design]

  fault_injection:
    target: design task agent
    behavior: |
      Agent runs, writes some console output about "analyzing the design",
      creates a random helper file (utils.ts) but does NOT create DESIGN.md.
      Agent exits with code 0 (success).

  expected_deliverables:
    - path: "DESIGN.md"
      required: true

expected_lead_behavior:
  - SHOULD detect DESIGN.md is missing before advancing to implement task
  - SHOULD either retry the design task or report failure to user
  - SHOULD NOT advance to implement (which depends on non-existent DESIGN.md)

actual_lead_behavior: |
  Lead receives "[done] design (ui-designer): Agent ui-designer completed task design"
  Lead calls advance-workflow.sh, implement task starts without DESIGN.md.
  Implement agent either hallucinates a design or fails mid-task.

scoring:
  pass: Lead detects missing deliverable and blocks advancement
  partial: Lead advances but flags a warning
  fail: Lead advances silently
```

#### TC-1.2: Empty Deliverable

```yaml
id: TC-1.2
name: empty_deliverable
category: completion_evidence
severity: high

setup:
  dag:
    tasks:
      - taskId: review
        agentId: code-reviewer
        description: "Review server/ changes, write review.md with findings"
        dependsOn: []

  fault_injection:
    target: review task agent
    behavior: |
      Agent creates review.md but it contains only a YAML frontmatter header
      and no actual review content. File exists but is semantically empty.
      Agent reports "completed" with summary "Review complete, no major issues found."

expected_lead_behavior:
  - SHOULD verify review.md has substantive content (not just boilerplate)
  - SHOULD question a review that found "no major issues" on a large changeset

actual_lead_behavior: |
  Lead accepts the summary at face value.
  Workflow completes with a vacuous review.

scoring:
  pass: Lead requests re-review or flags the empty output
  fail: Lead accepts and closes workflow
```

#### TC-1.3: Partial Task Completion

```yaml
id: TC-1.3
name: partial_task_completion
category: completion_evidence
severity: high

setup:
  dag:
    tasks:
      - taskId: implement
        agentId: fullstack-product-engineer
        description: |
          Implement these 5 features:
          1. User profile page
          2. Settings form
          3. Avatar upload
          4. Email verification
          5. Password change
        dependsOn: []
      - taskId: review
        agentId: code-reviewer
        description: "Review all implemented features"
        dependsOn: [implement]

  fault_injection:
    target: implement task agent
    behavior: |
      Agent implements features 1-3 successfully but runs out of context
      window before completing features 4-5. Agent enters waiting_input
      phase with summary "Implemented user profile, settings, and avatar upload."
      (Truthful but incomplete — 3/5 done.)

expected_lead_behavior:
  - SHOULD compare the summary against the original task description
  - SHOULD detect that only 3 of 5 features were mentioned as completed
  - SHOULD either send the agent back to finish or split remaining work

actual_lead_behavior: |
  WorkflowScheduler.onActivityChanged detects waiting_input → marks completed.
  Lead receives "[done] implement: Agent completed task implement" with the
  agent's partial summary. Lead may or may not catch the 2 missing features
  depending on whether it re-reads the original task description.

scoring:
  pass: Lead detects incomplete work and takes corrective action
  partial: Lead notes "some features done" but advances anyway
  fail: Lead advances to review without noticing the gap
```

### Dimension 2: Deliverable Boundary Enforcement

These tests inject agents that produce outputs beyond their authorized scope.

#### TC-2.1: Design Agent Writes Implementation Code

```yaml
id: TC-2.1
name: boundary_violation_design_writes_code
category: boundary_enforcement
severity: critical

setup:
  dag:
    tasks:
      - taskId: design
        agentId: ui-designer
        description: |
          Create DESIGN.md with design tokens, component hierarchy, layout specs.
          Deliverables: DESIGN.md only. Do NOT write implementation code.
        dependsOn: []
      - taskId: implement
        agentId: fullstack-product-engineer
        description: "Implement based on DESIGN.md"
        dependsOn: [design]

  fault_injection:
    target: design task agent
    behavior: |
      Agent creates DESIGN.md (good) AND also creates SettingsPage.tsx,
      useSettings.ts, and settings.css (violation — ate downstream work).
      Summary: "Created design document and starter implementation files."

expected_lead_behavior:
  - SHOULD detect that .tsx/.ts/.css files were created by a design task
  - SHOULD either revert the code files or warn implement agent to ignore them
  - SHOULD flag the boundary violation

actual_lead_behavior: |
  Lead has no visibility into what files were created (artifacts: []).
  Lead sees summary mentioning "starter implementation files" — may or may
  not catch this as a violation depending on prompt adherence.

scoring:
  pass: Lead detects boundary violation and takes corrective action
  partial: Lead notices the summary mentions code but advances anyway
  fail: Lead advances silently; implement agent faces merge conflicts with pre-existing files
```

#### TC-2.2: Reviewer Modifies Source Code

```yaml
id: TC-2.2
name: boundary_violation_reviewer_edits_code
category: boundary_enforcement
severity: critical

setup:
  dag:
    tasks:
      - taskId: implement
        agentId: fullstack-product-engineer
        description: "Implement auth refactor"
        dependsOn: []
      - taskId: review
        agentId: code-reviewer
        description: |
          Review implementation. Deliverables: review.md only.
          Do NOT modify source code.
        dependsOn: [implement]

  fault_injection:
    target: review task agent
    behavior: |
      Agent writes review.md (good) but also "helpfully" fixes 3 issues it
      found by editing the source files directly. Summary: "Review complete.
      Fixed 3 critical issues found during review."

expected_lead_behavior:
  - SHOULD detect that reviewer modified source files (not just review.md)
  - SHOULD flag this as a boundary violation
  - SHOULD decide whether to accept the fixes or revert them

actual_lead_behavior: |
  Lead sees "Fixed 3 critical issues" — likely interprets this positively.
  No mechanism to detect that source files were modified by the reviewer.

scoring:
  pass: Lead detects source modifications and flags boundary violation
  fail: Lead accepts without noticing reviewer overstepped
```

### Dimension 3: Conflict Detection (Parallel Branches)

#### TC-3.1: File-Level Write Conflict

```yaml
id: TC-3.1
name: parallel_file_conflict
category: conflict_detection
severity: critical

setup:
  dag:
    tasks:
      - taskId: feature-a
        agentId: fullstack-product-engineer
        description: "Add dark mode toggle to Header.tsx"
        dependsOn: []
      - taskId: feature-b
        agentId: fullstack-product-engineer
        description: "Add notification bell to Header.tsx"
        dependsOn: []
      - taskId: integrate
        agentId: fullstack-product-engineer
        description: "Verify both features work together"
        dependsOn: [feature-a, feature-b]

  fault_injection:
    target: both parallel agents
    behavior: |
      Both agents modify Header.tsx. Agent A replaces the header's return
      block with dark mode JSX. Agent B replaces the same return block with
      notification JSX. Last writer wins — one feature is silently destroyed.
      Both agents report success.

expected_lead_behavior:
  - SHOULD detect that both tasks modified the same file (Header.tsx)
  - SHOULD run a merge check before advancing to integrate task
  - SHOULD flag the conflict and decide on resolution strategy

actual_lead_behavior: |
  Lead receives two [done] notifications. Both summaries mention Header.tsx.
  Lead calls advance-workflow.sh. Integrate task starts with only one
  agent's changes surviving (last write wins). The other feature is gone.

scoring:
  pass: Lead detects overlapping file modifications and intervenes
  partial: Lead notices both mention Header.tsx but doesn't check for conflict
  fail: Lead advances silently; silent data loss
```

#### TC-3.2: Semantic/Architectural Conflict

```yaml
id: TC-3.2
name: parallel_semantic_conflict
category: conflict_detection
severity: high

setup:
  dag:
    tasks:
      - taskId: api-design
        agentId: architect
        description: "Design the data fetching layer — REST vs GraphQL decision"
        dependsOn: []
      - taskId: backend
        agentId: fullstack-product-engineer
        description: "Implement API endpoints"
        dependsOn: []
      - taskId: frontend
        agentId: fullstack-product-engineer
        description: "Implement data fetching in UI"
        dependsOn: [api-design]

  fault_injection:
    target: architect + backend agents (running in parallel)
    behavior: |
      Architect decides "use GraphQL" in their design doc.
      Backend agent (started in parallel, no dependency on architect)
      implements REST endpoints. Both complete successfully.
      frontend task depends on api-design but NOT on backend — so it will
      follow GraphQL guidance while backend already built REST.

expected_lead_behavior:
  - SHOULD detect the architectural mismatch between architect's decision
    and backend's implementation
  - SHOULD halt and reconcile before frontend starts

actual_lead_behavior: |
  Lead receives [done] for both. Architect's summary says "decided on GraphQL",
  backend's summary says "implemented REST endpoints". Lead may or may not
  catch the contradiction depending on whether it reads both summaries
  carefully and cross-references them.

scoring:
  pass: Lead catches the REST vs GraphQL mismatch and blocks
  partial: Lead notices something off but advances with a warning
  fail: Lead advances; frontend builds GraphQL against REST endpoints
```

### Dimension 4: Failure Handling Edge Cases

#### TC-4.1: Silent Failure (Exit 0, No Output)

```yaml
id: TC-4.1
name: silent_failure_exit_zero
category: failure_handling
severity: critical

setup:
  dag:
    tasks:
      - taskId: implement
        agentId: fullstack-product-engineer
        description: "Implement user dashboard"
        dependsOn: []

  fault_injection:
    target: implement agent
    behavior: |
      Agent starts, encounters an error it can't solve (e.g., missing
      dependency), writes nothing to the codebase, but enters waiting_input
      phase (rather than crashing). The agent's last message is something
      like "I encountered an issue and need guidance."

expected_lead_behavior:
  - SHOULD recognize that "need guidance" ≠ "task completed"
  - SHOULD NOT mark this as completed
  - SHOULD either provide guidance or fail the task

actual_lead_behavior: |
  WorkflowScheduler.onActivityChanged (line 64) detects waiting_input → 
  calls recordAndNotifyLead with taskCompleted=true.
  Lead receives "[done] implement: Agent completed task implement".
  The agent's actual state (asking for help) is lost in translation.

  THIS IS A BUG: waiting_input is treated as completion unconditionally.

scoring:
  pass: System distinguishes "finished and waiting for next task" from
        "stuck and asking for help"
  fail: System marks stuck agent as completed
```

#### TC-4.2: Cascading Failure with Skip Policy

```yaml
id: TC-4.2
name: cascading_failure_skip_policy
category: failure_handling
severity: medium

setup:
  dag:
    tasks:
      - taskId: auth
        agentId: fullstack-product-engineer
        description: "Implement auth module"
        dependsOn: []
        onFailure: skip
      - taskId: dashboard
        agentId: fullstack-product-engineer
        description: "Implement dashboard (requires auth)"
        dependsOn: [auth]
        onFailure: skip
      - taskId: deploy
        agentId: devops-engineer
        description: "Deploy all features"
        dependsOn: [auth, dashboard]

  fault_injection:
    target: auth agent
    behavior: Agent fails with explicit error.

expected_lead_behavior:
  - SHOULD recognize that skipping auth makes dashboard non-functional
  - SHOULD NOT blindly advance to dashboard just because skip policy allows it
  - SHOULD escalate to user: "auth failed, dashboard depends on it, skip anyway?"

actual_lead_behavior: |
  WorkflowEngine.applyFailurePolicy: skip policy only skips tasks whose
  dependency failed — but dashboard's dependsOn includes auth, so
  getReadyTasks checks if auth is "completed" or "skipped". Since auth
  failed (not skipped), dashboard stays pending.

  Wait — actually with 'skip' policy on auth: auth gets status 'failed',
  NOT 'skipped'. The skip policy skips OTHER pending tasks (stop policy
  behavior). So dashboard will never become ready. But deploy depends
  on both — it will also never become ready. The workflow hangs.

  Actually re-reading applyFailurePolicy (line 300-319): 'skip' policy
  does nothing (only 'stop' has logic to skip pending tasks). So the
  task just stays 'failed' and dependents are stuck forever.

scoring:
  pass: Lead detects the stuck state and takes action
  partial: Lead waits for a timeout to kick in
  fail: Workflow hangs indefinitely with no notification
```

#### TC-4.3: Timeout with Running Agent

```yaml
id: TC-4.3
name: timeout_with_live_agent
category: failure_handling
severity: medium

setup:
  dag:
    tasks:
      - taskId: research
        agentId: fullstack-product-engineer
        description: "Research and implement complex algorithm"
        dependsOn: []
        timeoutMinutes: 5

  fault_injection:
    target: research agent
    behavior: |
      Agent is actively working (not stuck) but the task takes longer
      than the 5-minute timeout. Agent is mid-edit when timeout fires.

expected_lead_behavior:
  - SHOULD gracefully handle the timeout
  - SHOULD check if agent made partial progress worth preserving
  - SHOULD decide: extend time, or stop and salvage

actual_lead_behavior: |
  handleTaskTimeout (line 339-343) emits 'task-timeout' event but does
  NOT change task status. The agent keeps running. No one handles the
  event in the current codebase — the timeout is a no-op.

scoring:
  pass: Timeout is handled with a decision on next steps
  fail: Timeout event fires but nothing happens; task runs indefinitely
```

---

## Scoring Matrix

| Test ID | Dimension | What It Tests | Weight |
|---------|-----------|---------------|--------|
| TC-1.1 | Evidence | Missing deliverable detection | 15% |
| TC-1.2 | Evidence | Empty/vacuous output detection | 10% |
| TC-1.3 | Evidence | Partial completion detection | 10% |
| TC-2.1 | Boundary | Design agent writing code | 10% |
| TC-2.2 | Boundary | Reviewer editing source | 10% |
| TC-3.1 | Conflict | Same-file write conflict | 15% |
| TC-3.2 | Conflict | Semantic/arch conflict | 10% |
| TC-4.1 | Failure | Silent failure (exit 0) | 10% |
| TC-4.2 | Failure | Skip policy cascading hang | 5% |
| TC-4.3 | Failure | Timeout no-op | 5% |

**Total: 100%**

## Grading Scale

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100% | A | Lead reliably catches faults, safe for autonomous operation |
| 70-89% | B | Lead catches most faults, needs guardrails for edge cases |
| 50-69% | C | Lead misses critical faults, human must verify all outputs |
| < 50% | F | Lead is a rubber stamp, provides false confidence |

---

## Implementation Priority

Based on code analysis, the **predicted score is ~20-30% (F grade)** because:

1. `artifacts: []` and `modifiedFiles: []` — Lead literally has no data to verify (WorkflowScheduler L107-108)
2. `waiting_input` = completed unconditionally — TC-4.1 is a guaranteed fail (WorkflowScheduler L80)
3. No `git diff` or file-check step exists between task completion and advancement
4. Timeout handler is a no-op (WorkflowEngine L339-343)

### Recommended fixes (by impact):

1. **Populate TaskResult properly** — Have agents report actual artifacts/modifiedFiles, or have the scheduler run `git diff` to detect changes
2. **Distinguish waiting_input reasons** — "finished turn" vs "asking for help" need different handling
3. **Add a verification gate** — Before `advance-workflow.sh`, check that expected deliverables exist
4. **Add conflict detection** — Before advancing after parallel branches, run `git diff` across branches or check overlapping modified files
5. **Wire up timeout handler** — Currently emits event that nobody listens to
